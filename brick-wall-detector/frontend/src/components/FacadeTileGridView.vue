<template>
  <div class="tgv-wrap">
    <!-- ── Toolbar ── -->
    <div class="tgv-toolbar">
      <el-button-group size="small">
        <el-button :type="viewMode === 'stitched' ? 'primary' : 'default'" @click="viewMode = 'stitched'">
          <el-icon><PictureFilled /></el-icon> 拼合大图
        </el-button>
        <el-button :type="viewMode === 'grid' ? 'primary' : 'default'" @click="viewMode = 'grid'">
          <el-icon><Grid /></el-icon> 切片列表
        </el-button>
      </el-button-group>
      <span class="tgv-meta">
        共 <b>{{ tiles.length }}</b> 块切片 &nbsp;·&nbsp; 累计检出 <b>{{ totalDetections }}</b> 处病害
      </span>
      <el-tag v-if="failedTiles > 0" type="warning" size="small">
        {{ failedTiles }} 块失败
      </el-tag>
    </div>

    <!-- ── 拼合大图视图 ── -->
    <div v-show="viewMode === 'stitched'" class="tgv-stitched-wrap">
      <div class="tgv-img-container" ref="containerRef" @resize="onContainerResize">
        <!-- 主图：优先显示拼合标注大图，否则显示原图 -->
        <img
          ref="imgRef"
          :src="stitchedImageUrl || sourceImageUrl"
          class="tgv-img"
          draggable="false"
          @load="onImgLoad"
        />

        <!-- 切片边框覆盖层（百分比定位） -->
        <div
          v-for="tile in tiles"
          :key="tile.tileId"
          class="tgv-cell"
          :class="{
            'has-detections': tile.detectionCount > 0,
            'tile-failed':    tile.status === 'failed'
          }"
          :style="cellStyle(tile)"
          @click="openModal(tile)"
          :title="`切片 ${tile.index}：点击放大查看（${tile.detectionCount} 处病害）`"
        >
          <span class="tgv-cell-index">{{ tile.index }}</span>
          <span v-if="tile.detectionCount > 0" class="tgv-cell-badge">
            {{ tile.detectionCount }}
          </span>
          <el-icon v-if="tile.status === 'failed'" class="tgv-cell-fail"><WarningFilled /></el-icon>
          <div class="tgv-cell-hover-label">点击放大</div>
        </div>
      </div>

      <p class="tgv-hint">
        {{ stitchedImageUrl ? '图中已叠加每块切片的独立 AI 标注结果' : '拼合图生成中…' }}
        &nbsp;·&nbsp; 点击任意切片可放大查看
      </p>
    </div>

    <!-- ── 切片缩略图列表 ── -->
    <div v-show="viewMode === 'grid'" class="tgv-thumb-grid">
      <div
        v-for="tile in tiles"
        :key="tile.tileId"
        class="tgv-thumb-card"
        :class="{
          'has-detections': tile.detectionCount > 0,
          'tile-failed':    tile.status === 'failed'
        }"
        @click="openModal(tile)"
      >
        <div class="tgv-thumb-img-wrap">
          <img
            v-if="tile.annotatedTileUrl"
            :src="tile.annotatedTileUrl"
            class="tgv-thumb-img"
            loading="lazy"
          />
          <div v-else class="tgv-thumb-placeholder">
            <el-icon :size="28" color="#bbb"><PictureFilled /></el-icon>
          </div>
          <!-- Disease count badge -->
          <span v-if="tile.detectionCount > 0" class="tgv-thumb-badge">
            {{ tile.detectionCount }} 处病害
          </span>
          <span v-else-if="tile.status === 'detected'" class="tgv-thumb-clean">
            无病害
          </span>
        </div>
        <div class="tgv-thumb-footer">
          <span class="tgv-thumb-label">切片 {{ tile.index }}</span>
          <span class="tgv-thumb-pos">R{{ tile.rowIndex + 1 }}-C{{ tile.colIndex + 1 }}</span>
        </div>
      </div>
    </div>

    <!-- ── 放大弹窗 ── -->
    <el-dialog
      v-model="modalVisible"
      :title="`切片 ${activeTile?.index}（第 ${activeTile ? activeTile.rowIndex + 1 : '-'} 行 第 ${activeTile ? activeTile.colIndex + 1 : '-'} 列）`"
      width="80%"
      destroy-on-close
      class="tgv-modal"
    >
      <template v-if="activeTile">
        <img
          v-if="activeTile.annotatedTileUrl"
          :src="activeTile.annotatedTileUrl"
          class="tgv-modal-img"
        />
        <el-empty v-else description="该切片暂无标注图" />

        <div class="tgv-modal-meta">
          <el-descriptions :column="3" size="small" border style="margin-top:12px">
            <el-descriptions-item label="切片编号">{{ activeTile.index }}</el-descriptions-item>
            <el-descriptions-item label="位置">
              R{{ activeTile.rowIndex + 1 }}-C{{ activeTile.colIndex + 1 }}
            </el-descriptions-item>
            <el-descriptions-item label="尺寸">
              {{ activeTile.width }}×{{ activeTile.height }} px
            </el-descriptions-item>
            <el-descriptions-item label="检出病害">
              <el-tag :type="activeTile.detectionCount > 0 ? 'danger' : 'success'" size="small">
                {{ activeTile.detectionCount }} 处
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="activeTile.status === 'detected' ? 'success' : 'warning'" size="small">
                {{ activeTile.status === 'detected' ? '已检测' : activeTile.status === 'failed' ? '推理失败' : '待检' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="全局偏移">
              ({{ activeTile.offsetX }}, {{ activeTile.offsetY }})
            </el-descriptions-item>
          </el-descriptions>

          <!-- Per-tile detections from global list -->
          <div v-if="tileDetections(activeTile).length > 0" style="margin-top:12px">
            <el-table :data="tileDetections(activeTile)" size="small" max-height="200">
              <el-table-column label="#" type="index" width="45" />
              <el-table-column label="病害类型" prop="class" width="100">
                <template #default="{ row }">
                  <el-tag size="small" :color="DISEASE_COLORS[row.class]" style="color:#fff;border:none">
                    {{ row.class }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="置信度" prop="confidence">
                <template #default="{ row }">{{ (row.confidence * 100).toFixed(0) }}%</template>
              </el-table-column>
              <el-table-column label="面积 m²" prop="areaM2" />
            </el-table>
          </div>
        </div>
      </template>

      <template #footer>
        <el-button @click="navTile(-1)" :disabled="!activeTile || activeTile.index <= 1">
          ← 上一块
        </el-button>
        <el-button @click="navTile(+1)" :disabled="!activeTile || activeTile.index >= tiles.length">
          下一块 →
        </el-button>
        <el-button type="primary" @click="modalVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { PictureFilled, Grid, WarningFilled } from '@element-plus/icons-vue'

interface TileInfo {
  tileId: string
  index: number
  rowIndex: number
  colIndex: number
  offsetX: number
  offsetY: number
  stitchedOffsetX: number
  stitchedOffsetY: number
  width: number
  height: number
  tileUrl: string | null
  annotatedTileUrl: string | null
  detectionCount: number
  status: string
}

const props = defineProps<{
  stitchedImageUrl: string | null
  stitchedWidth: number
  stitchedHeight: number
  sourceImageUrl: string
  tiles: TileInfo[]
  detections: any[]
  totalDetections: number
  failedTiles: number
}>()

const DISEASE_COLORS: Record<string, string> = {
  '风化': '#e74c3c', '泛碱': '#3498db', '裂缝': '#f39c12',
  '植物附着': '#9b59b6', '缺损': '#1abc9c'
}

const viewMode    = ref<'stitched' | 'grid'>('stitched')
const imgRef      = ref<HTMLImageElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const imgDisplayW = ref(0)
const imgDisplayH = ref(0)

function onImgLoad() {
  const img = imgRef.value
  if (!img) return
  imgDisplayW.value = img.clientWidth
  imgDisplayH.value = img.clientHeight
}

function onContainerResize() { onImgLoad() }

// Percentage-based cell positioning relative to stitched image dims
function cellStyle(tile: TileInfo) {
  const W = props.stitchedWidth  || 1
  const H = props.stitchedHeight || 1
  return {
    left:   `${(tile.stitchedOffsetX / W) * 100}%`,
    top:    `${(tile.stitchedOffsetY / H) * 100}%`,
    width:  `${(tile.width / W) * 100}%`,
    height: `${(tile.height / H) * 100}%`
  }
}

// ── Modal ─────────────────────────────────────────────────────────────
const modalVisible = ref(false)
const activeTile   = ref<TileInfo | null>(null)

function openModal(tile: TileInfo) {
  activeTile.value   = tile
  modalVisible.value = true
}

function navTile(delta: number) {
  if (!activeTile.value) return
  const nextIdx = activeTile.value.index + delta - 1  // 0-based
  if (nextIdx >= 0 && nextIdx < props.tiles.length) {
    activeTile.value = props.tiles[nextIdx]
  }
}

function tileDetections(tile: TileInfo) {
  if (!props.detections) return []
  return props.detections.filter(d => d.tileId === tile.tileId)
}
</script>

<style scoped>
.tgv-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tgv-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.tgv-meta {
  font-size: 13px;
  color: #555;
}

/* ── Stitched view ── */
.tgv-stitched-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tgv-img-container {
  position: relative;
  display: inline-block;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: #1e1e1e;
}

.tgv-img {
  display: block;
  width: 100%;
  max-height: 560px;
  object-fit: contain;
  border-radius: 8px;
}

.tgv-hint {
  font-size: 12px;
  color: #888;
  text-align: center;
  margin: 0;
}

/* ── Tile cell overlay ── */
.tgv-cell {
  position: absolute;
  border: 1.5px dashed rgba(255, 255, 255, 0.45);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  box-sizing: border-box;
}
.tgv-cell:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: #fff;
  z-index: 2;
}
.tgv-cell.has-detections {
  border-color: rgba(231, 76, 60, 0.7);
}
.tgv-cell.has-detections:hover {
  border-color: #e74c3c;
  background: rgba(231, 76, 60, 0.12);
}
.tgv-cell.tile-failed {
  border-color: rgba(230, 162, 60, 0.7);
}

.tgv-cell-index {
  position: absolute;
  top: 3px;
  left: 5px;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255,255,255,0.9);
  text-shadow: 0 1px 3px rgba(0,0,0,0.7);
  pointer-events: none;
}
.tgv-cell-badge {
  position: absolute;
  top: 3px;
  right: 5px;
  background: #e74c3c;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 8px;
  pointer-events: none;
}
.tgv-cell-fail {
  position: absolute;
  bottom: 4px;
  right: 4px;
  color: #e6a23c;
  font-size: 14px;
  pointer-events: none;
}
.tgv-cell-hover-label {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: rgba(255,255,255,0.8);
  background: rgba(0,0,0,0.5);
  padding: 1px 6px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
  white-space: nowrap;
}
.tgv-cell:hover .tgv-cell-hover-label { opacity: 1; }

/* ── Thumbnail grid ── */
.tgv-thumb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}

.tgv-thumb-card {
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  background: #fafafa;
}
.tgv-thumb-card:hover {
  border-color: #0070C0;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,112,192,0.15);
}
.tgv-thumb-card.has-detections {
  border-color: #fbc4c4;
}
.tgv-thumb-card.has-detections:hover {
  border-color: #e74c3c;
}
.tgv-thumb-card.tile-failed {
  border-color: #f5dab1;
  opacity: 0.7;
}

.tgv-thumb-img-wrap {
  position: relative;
  aspect-ratio: 1 / 1;
  background: #1e1e1e;
  overflow: hidden;
}
.tgv-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tgv-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f2f5;
}
.tgv-thumb-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(231,76,60,0.9);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
}
.tgv-thumb-clean {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(103,194,58,0.9);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
}

.tgv-thumb-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  background: #fff;
}
.tgv-thumb-label { font-size: 12px; font-weight: 600; color: #303133; }
.tgv-thumb-pos   { font-size: 11px; color: #909399; }

/* ── Modal ── */
.tgv-modal-img {
  width: 100%;
  border-radius: 8px;
  display: block;
}
.tgv-modal-meta { }

:deep(.tgv-modal .el-dialog__body) {
  padding: 16px 20px;
}
</style>
