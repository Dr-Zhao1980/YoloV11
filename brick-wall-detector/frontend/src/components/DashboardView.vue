<template>
  <div class="dashboard-view">
    <div class="dashboard-header">
      <div class="dh-title">
        <el-icon :size="20" color="#0070C0"><DataBoard /></el-icon>
        <span>看板模式 - 网格化热力图</span>
      </div>
      <div class="dh-actions">
        <el-button-group>
          <el-button :type="gridSize === 3 ? 'primary' : 'default'" size="small" @click="gridSize = 3">3×3</el-button>
          <el-button :type="gridSize === 4 ? 'primary' : 'default'" size="small" @click="gridSize = 4">4×4</el-button>
          <el-button :type="gridSize === 5 ? 'primary' : 'default'" size="small" @click="gridSize = 5">5×5</el-button>
        </el-button-group>
        <el-button size="small" @click="$emit('close')">
          <el-icon><Close /></el-icon>
          关闭看板
        </el-button>
      </div>
    </div>

    <div class="dashboard-body">
      <!-- 热力图区域 -->
      <div class="heatmap-container" ref="heatmapRef">
        <img :src="imagePath" class="heatmap-bg" @load="onImageLoad" ref="imgRef" />
        
        <!-- 网格叠加层 -->
        <div class="grid-overlay" :style="gridOverlayStyle">
          <div
            v-for="cell in gridCells"
            :key="cell.id"
            class="grid-cell"
            :class="{ active: selectedCell === cell.id, hasDisease: cell.count > 0 }"
            :style="getCellStyle(cell)"
            @click="selectCell(cell)"
          >
            <div class="cell-content">
              <span class="cell-id">{{ cell.id }}</span>
              <span v-if="cell.count > 0" class="cell-count">{{ cell.count }}</span>
            </div>
            <div v-if="cell.count > 0" class="cell-severity" :class="'sev-' + cell.maxSeverity"></div>
          </div>
        </div>
      </div>

      <!-- 右侧详情面板 -->
      <div class="detail-panel">
        <div v-if="!selectedCell" class="panel-empty">
          <el-icon :size="48" color="#d0d0d0"><Grid /></el-icon>
          <p>点击网格查看该区域病害详情</p>
        </div>
        
        <template v-else>
          <div class="panel-header">
            <h4>网格 {{ selectedCell }}</h4>
            <el-tag v-if="selectedCellData" :type="sevType(selectedCellData.maxSeverity)" size="small" effect="dark">
              {{ selectedCellData.maxSeverity }}
            </el-tag>
          </div>

          <div v-if="selectedCellData && selectedCellData.count > 0" class="panel-content">
            <div class="panel-stat">
              <span class="ps-label">病害数量</span>
              <span class="ps-value">{{ selectedCellData.count }} 处</span>
            </div>
            
            <div class="panel-diseases">
              <h5>病害分布</h5>
              <div v-for="(count, disease) in selectedCellData.diseases" :key="String(disease)" class="pd-item">
                <span class="pd-dot" :style="{ background: diseaseColor(String(disease)) }"></span>
                <span class="pd-name">{{ disease }}</span>
                <span class="pd-count">{{ count }} 处</span>
              </div>
            </div>

            <div class="panel-detections">
              <h5>检测详情</h5>
              <div v-for="det in selectedCellDetections" :key="det.id" class="det-item">
                <span class="det-class" :style="{ background: diseaseColor(det.class) }">{{ det.class }}</span>
                <span class="det-conf">{{ (det.confidence * 100).toFixed(0) }}%</span>
                <el-tag :type="sevType(det.severity)" size="small" effect="plain">{{ det.severity }}</el-tag>
              </div>
            </div>
          </div>
          
          <div v-else class="panel-empty">
            <el-icon :size="32" color="#10b981"><CircleCheck /></el-icon>
            <p>该区域未检测到病害</p>
          </div>
        </template>
      </div>
    </div>

    <!-- 图例 -->
    <div class="dashboard-legend">
      <span class="legend-title">热力图图例：</span>
      <span class="legend-item"><span class="lg-box sev-轻度"></span>轻度</span>
      <span class="legend-item"><span class="lg-box sev-中度"></span>中度</span>
      <span class="legend-item"><span class="lg-box sev-重度"></span>重度</span>
      <span class="legend-item"><span class="lg-box sev-none"></span>无病害</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface Detection {
  id: number
  class: string
  confidence: number
  bbox: number[]
  area: number | null
  severity: string
  gridId?: string
}

interface GridCell {
  id: string
  row: number
  col: number
  count: number
  diseases: Record<string, number>
  maxSeverity: string
  detections: Detection[]
}

const props = defineProps<{
  imagePath: string
  detections: Detection[]
  imageWidth: number
  imageHeight: number
}>()

defineEmits(['close'])

const gridSize = ref(4)
const selectedCell = ref<string | null>(null)
const imgRef = ref<HTMLImageElement>()
const heatmapRef = ref<HTMLDivElement>()
const imgLoaded = ref(false)
const displaySize = ref({ width: 0, height: 0 })

const DISEASE_COLORS: Record<string, string> = {
  '风化': '#e74c3c',
  '泛碱': '#3498db',
  '裂缝': '#f39c12',
  '植物附着': '#9b59b6',
  '缺损': '#1abc9c'
}

function diseaseColor(name: string): string {
  return DISEASE_COLORS[name] || '#999'
}

function sevType(s: string) {
  return s === '重度' ? 'danger' : s === '中度' ? 'warning' : 'success'
}

function onImageLoad() {
  imgLoaded.value = true
  updateDisplaySize()
}

function updateDisplaySize() {
  if (imgRef.value) {
    displaySize.value = {
      width: imgRef.value.clientWidth,
      height: imgRef.value.clientHeight
    }
  }
}

const gridOverlayStyle = computed(() => ({
  width: displaySize.value.width + 'px',
  height: displaySize.value.height + 'px'
}))

const gridCells = computed<GridCell[]>(() => {
  const cells: GridCell[] = []
  const cellWidth = props.imageWidth / gridSize.value
  const cellHeight = props.imageHeight / gridSize.value

  for (let row = 0; row < gridSize.value; row++) {
    for (let col = 0; col < gridSize.value; col++) {
      const id = `G${row + 1}-${col + 1}`
      const cell: GridCell = {
        id,
        row,
        col,
        count: 0,
        diseases: {},
        maxSeverity: '无',
        detections: []
      }

      // 找出落在这个网格内的检测
      props.detections.forEach(det => {
        const cx = det.bbox[0] + det.bbox[2] / 2
        const cy = det.bbox[1] + det.bbox[3] / 2
        const detCol = Math.floor(cx / cellWidth)
        const detRow = Math.floor(cy / cellHeight)
        
        if (detRow === row && detCol === col) {
          cell.count++
          cell.diseases[det.class] = (cell.diseases[det.class] || 0) + 1
          cell.detections.push(det)
          
          const sevOrder: Record<string, number> = { '无': 0, '轻度': 1, '中度': 2, '重度': 3 }
          if (sevOrder[det.severity] > sevOrder[cell.maxSeverity]) {
            cell.maxSeverity = det.severity
          }
        }
      })

      cells.push(cell)
    }
  }
  return cells
})

const selectedCellData = computed(() => {
  if (!selectedCell.value) return null
  return gridCells.value.find(c => c.id === selectedCell.value) || null
})

const selectedCellDetections = computed(() => {
  return selectedCellData.value?.detections || []
})

function getCellStyle(cell: GridCell) {
  const wPercent = 100 / gridSize.value
  const hPercent = 100 / gridSize.value
  return {
    width: wPercent + '%',
    height: hPercent + '%',
    left: (cell.col * wPercent) + '%',
    top: (cell.row * hPercent) + '%'
  }
}

function selectCell(cell: GridCell) {
  selectedCell.value = selectedCell.value === cell.id ? null : cell.id
}

watch(gridSize, () => {
  selectedCell.value = null
})
</script>

<style scoped>
.dashboard-view {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 112, 192, 0.1);
  overflow: hidden;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e6f2fb 100%);
  border-bottom: 1px solid #d6ebf7;
}

.dh-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #003a66;
}

.dh-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dashboard-body {
  display: flex;
  min-height: 400px;
}

.heatmap-container {
  flex: 1;
  position: relative;
  background: #1a1a2e;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.heatmap-bg {
  max-width: 100%;
  max-height: 500px;
  object-fit: contain;
  border-radius: 8px;
}

.grid-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.grid-cell {
  position: absolute;
  border: 1px solid rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
}

.grid-cell:hover {
  border-color: #0070C0;
  background: rgba(0, 112, 192, 0.2);
}

.grid-cell.active {
  border: 2px solid #0070C0;
  background: rgba(0, 112, 192, 0.3);
  z-index: 10;
}

.grid-cell.hasDisease {
  background: rgba(255, 100, 100, 0.2);
}

.cell-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.cell-id {
  font-size: 10px;
  opacity: 0.8;
}

.cell-count {
  font-size: 16px;
  font-weight: 700;
}

.cell-severity {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.sev-轻度, .cell-severity.sev-轻度 { background: #10b981; }
.sev-中度, .cell-severity.sev-中度 { background: #f59e0b; }
.sev-重度, .cell-severity.sev-重度 { background: #ef4444; }
.sev-none { background: #e5e7eb; }

.detail-panel {
  width: 300px;
  border-left: 1px solid #e5e7eb;
  background: #fafbfc;
  padding: 20px;
  overflow-y: auto;
  max-height: 540px;
}

.panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #999;
  text-align: center;
}

.panel-empty p {
  margin-top: 12px;
  font-size: 14px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.panel-header h4 {
  margin: 0;
  font-size: 16px;
  color: #003a66;
}

.panel-stat {
  display: flex;
  justify-content: space-between;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
  margin-bottom: 16px;
}

.ps-label {
  color: #666;
  font-size: 13px;
}

.ps-value {
  font-weight: 700;
  color: #0070C0;
}

.panel-diseases, .panel-detections {
  margin-bottom: 16px;
}

.panel-diseases h5, .panel-detections h5 {
  margin: 0 0 10px;
  font-size: 13px;
  color: #666;
}

.pd-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px dashed #e5e7eb;
}

.pd-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pd-name {
  flex: 1;
  font-size: 14px;
  color: #333;
}

.pd-count {
  font-size: 13px;
  color: #666;
}

.det-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #fff;
  border-radius: 6px;
  margin-bottom: 8px;
}

.det-class {
  padding: 2px 8px;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.det-conf {
  font-size: 13px;
  color: #666;
  margin-left: auto;
}

.dashboard-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: #f8fafc;
  border-top: 1px solid #e5e7eb;
  font-size: 13px;
  color: #666;
}

.legend-title {
  font-weight: 600;
  color: #333;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.lg-box {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

/* ===================== RESPONSIVE ===================== */
/* Tablet */
@media (max-width: 992px) {
  .dashboard-body {
    flex-direction: column;
  }
  
  .detail-panel {
    width: 100%;
    max-height: 300px;
    border-left: none;
    border-top: 1px solid #e5e7eb;
  }
  
  .heatmap-container {
    min-height: 300px;
  }
}

/* Mobile */
@media (max-width: 768px) {
  .dashboard-view {
    border-radius: 12px;
    margin-top: 16px;
  }
  
  .dashboard-header {
    padding: 12px 14px;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .dh-title {
    font-size: 14px;
    gap: 8px;
  }
  
  .dh-actions {
    width: 100%;
    flex-direction: column;
    gap: 8px;
  }
  
  .dh-actions .el-button-group {
    width: 100%;
    display: flex;
  }
  
  .dh-actions .el-button-group .el-button {
    flex: 1;
  }
  
  .dh-actions > .el-button {
    width: 100%;
  }
  
  .dashboard-body {
    flex-direction: column;
    min-height: auto;
  }
  
  .heatmap-container {
    min-height: 250px;
    padding: 12px;
  }
  
  .heatmap-bg {
    max-height: 300px;
  }
  
  .detail-panel {
    width: 100%;
    max-height: 280px;
    padding: 14px;
    border-left: none;
    border-top: 1px solid #e5e7eb;
  }
  
  .panel-empty {
    height: 120px;
  }
  
  .panel-empty p {
    font-size: 13px;
  }
  
  .panel-header h4 {
    font-size: 14px;
  }
  
  .panel-stat {
    padding: 10px;
  }
  
  .ps-label, .ps-value {
    font-size: 12px;
  }
  
  .panel-diseases h5, .panel-detections h5 {
    font-size: 12px;
  }
  
  .pd-name {
    font-size: 13px;
  }
  
  .pd-count {
    font-size: 12px;
  }
  
  .det-item {
    padding: 6px;
    gap: 6px;
  }
  
  .det-class {
    font-size: 11px;
    padding: 2px 6px;
  }
  
  .det-conf {
    font-size: 12px;
  }
  
  .cell-id {
    font-size: 8px;
  }
  
  .cell-count {
    font-size: 12px;
  }
  
  .cell-severity {
    width: 6px;
    height: 6px;
    bottom: 2px;
    right: 2px;
  }
  
  .dashboard-legend {
    padding: 10px 14px;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 11px;
  }
  
  .legend-title {
    width: 100%;
    margin-bottom: 4px;
  }
  
  .lg-box {
    width: 12px;
    height: 12px;
  }
}

/* Small mobile */
@media (max-width: 480px) {
  .dashboard-header {
    padding: 10px 12px;
  }
  
  .dh-title {
    font-size: 13px;
  }
  
  .heatmap-container {
    min-height: 200px;
    padding: 10px;
  }
  
  .heatmap-bg {
    max-height: 220px;
  }
  
  .detail-panel {
    padding: 12px;
    max-height: 240px;
  }
  
  .cell-id {
    display: none;
  }
  
  .cell-count {
    font-size: 10px;
  }
}

/* Touch optimizations */
@media (hover: none) and (pointer: coarse) {
  .grid-cell {
    min-width: 44px;
    min-height: 44px;
  }
  
  .grid-cell:active {
    background: rgba(0, 112, 192, 0.4);
  }
}
</style>
