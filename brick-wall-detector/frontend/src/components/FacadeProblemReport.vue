<template>
  <div class="fpr-wrap" :class="{ 'fpr-fill': fill }">
    <el-collapse v-model="expanded" class="fpr-collapse">
      <el-collapse-item name="report">
        <template #title>
          <div class="fpr-title">
            <el-icon class="fpr-icon"><Document /></el-icon>
            <span class="fpr-title-text">{{ title }}</span>
            <el-tag type="danger" effect="dark" round size="small">{{ detections.length }} 处</el-tag>
            <span v-if="filterDisease || filterGrid" class="fpr-filter-hint">
              筛选显示 {{ filteredDetections.length }} 处
            </span>
          </div>
        </template>

        <div class="fpr-toolbar">
          <el-select v-model="filterDisease" placeholder="病害类型" size="small" clearable class="fpr-select">
            <el-option label="全部类型" :value="null" />
            <el-option v-for="(color, name) in DISEASE_COLORS" :key="name" :label="name" :value="name">
              <span class="fpr-opt-dot" :style="{ background: color }"></span>{{ name }}
            </el-option>
          </el-select>
          <el-select v-model="filterGrid" placeholder="网格" size="small" clearable class="fpr-select fpr-select-sm">
            <el-option label="全部网格" :value="null" />
            <el-option v-for="g in grids" :key="g.gridId" :label="g.gridId" :value="g.gridId" />
          </el-select>
          <div class="fpr-export">
            <el-button size="small" type="primary" plain :loading="exporting" @click.stop="exportAs('txt')">TXT</el-button>
            <el-button size="small" type="success" plain :loading="exporting" @click.stop="exportAs('word')">Word</el-button>
            <el-button size="small" type="warning" plain :loading="exporting" @click.stop="exportAs('pdf')">PDF</el-button>
          </div>
        </div>

        <div v-if="cardItems.length" class="fpr-grid">
          <article
            v-for="item in cardItems"
            :key="item.id"
            class="fpr-card"
            :style="{ '--accent': diseaseColor(item.class) }"
          >
            <header class="fpr-card-head">
              <span class="fpr-card-index">{{ item.index }}</span>
              <div class="fpr-card-title">
                <span class="fpr-card-class">{{ item.class }}</span>
                <span v-if="item.severity && item.severity !== '—'" class="fpr-card-sev">{{ item.severity }}</span>
              </div>
              <span class="fpr-card-conf">置信度 {{ item.confidenceText }}</span>
            </header>
            <dl class="fpr-card-body">
              <div v-for="row in item.rows" :key="row.label" class="fpr-row">
                <dt class="fpr-row-label">{{ row.label }}</dt>
                <dd class="fpr-row-value" :class="{ 'fpr-row-mono': row.mono }">{{ row.value }}</dd>
              </div>
            </dl>
          </article>
        </div>
        <el-empty v-else description="暂无匹配的病害" />
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Document } from '@element-plus/icons-vue'
import type { ProblemReportMeta, ProblemReportInput } from '../utils/facadeProblemReportExport'
import { exportProblemReportFormats } from '../utils/facadeWallReportExport'
import { formatWallPoint, hasValidCoordTransform, pixelBboxToRealM } from '../utils/facadeCoordTransform'
import { DISEASE_COLORS, diseaseColor } from '../utils/diseaseColors'

interface CardRow {
  label: string
  value: string
  mono?: boolean
}

interface CardItem {
  id: string
  index: number
  class: string
  severity: string
  confidenceText: string
  rows: CardRow[]
}

const props = withDefaults(defineProps<{
  detections: any[]
  grids?: any[]
  summary?: any
  meta?: ProblemReportMeta
  title?: string
  fill?: boolean
}>(), {
  title: '病害详细列表',
  fill: false,
})

const expanded = ref<string[]>([])
const filterDisease = ref<string | null>(null)
const filterGrid = ref<string | null>(null)
const exporting = ref(false)

const filteredDetections = computed(() => {
  let list = props.detections || []
  if (filterDisease.value) list = list.filter(d => d.class === filterDisease.value)
  if (filterGrid.value) list = list.filter(d => d.gridId === filterGrid.value)
  return list
})

function buildCard(det: any, index: number): CardItem {
  const bbox = det.globalBbox || det.bbox || []
  const x1 = bbox[0] || 0
  const y1 = bbox[1] || 0
  const x2 = (bbox[0] || 0) + (bbox[2] || 0)
  const y2 = (bbox[1] || 0) + (bbox[3] || 0)
  const rows: CardRow[] = []

  const meta = props.meta
  if (hasValidCoordTransform(meta)) {
    const real = pixelBboxToRealM(x1, y1, x2, y2, {
      scalePxPerMm: meta!.scalePxPerMm!,
      imageHeight: meta!.imageHeight!,
    })
    rows.push({
      label: '墙面坐标',
      value: `中心 ${formatWallPoint(real.center)} · 左下 ${formatWallPoint(real.bottomLeft)} · 右上 ${formatWallPoint(real.topRight)}`,
      mono: true,
    })
  }

  rows.push({
    label: '像素对照',
    value: `(${Math.round(x1)}, ${Math.round(y1)}) → (${Math.round(x2)}, ${Math.round(y2)})`,
    mono: true,
  })
  if (det.areaM2 > 0) {
    rows.push({ label: '受损面积', value: `${det.areaM2.toFixed(3)} m²` })
  }
  if (det.lengthM > 0) {
    rows.push({ label: '裂缝长度', value: `${det.lengthM.toFixed(3)} m` })
  }
  if (det.gridId) {
    rows.push({ label: '所属网格', value: det.gridId, mono: true })
  }
  if (det.tileId) {
    rows.push({ label: '所在切片', value: det.tileId, mono: true })
  }

  return {
    id: String(det.id || `${det.tileId}-${index}`),
    index,
    class: det.class || '未知',
    severity: det.severity || '—',
    confidenceText: `${((det.confidence || 0) * 100).toFixed(1)}%`,
    rows,
  }
}

const cardItems = computed(() =>
  filteredDetections.value.map((det, i) => buildCard(det, i + 1))
)

function reportInput(): ProblemReportInput {
  return {
    detections: filteredDetections.value,
    summary: props.summary,
    grids: props.grids,
    meta: props.meta,
  }
}

async function exportAs(fmt: 'txt' | 'word' | 'pdf') {
  if (!filteredDetections.value.length) {
    ElMessage.warning('暂无病害可导出')
    return
  }
  exporting.value = true
  try {
    await exportProblemReportFormats(reportInput(), fmt)
    ElMessage.success(`已导出 ${fmt.toUpperCase()} 问题汇报`)
  } catch (e: any) {
    ElMessage.error(e.message || '导出失败')
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.fpr-wrap { width: 100%; }
.fpr-collapse { border: none; background: transparent; }
.fpr-collapse :deep(.el-collapse-item) {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 112, 192, 0.06);
}
.fpr-collapse :deep(.el-collapse-item__header) {
  height: 48px;
  line-height: 48px;
  padding: 0 16px;
  background: linear-gradient(90deg, #f0f7ff, #fff);
  border: 1px solid #d9ecff;
  border-bottom: none;
  font-weight: 600;
}
.fpr-collapse :deep(.el-collapse-item:not(.is-active) .el-collapse-item__header) {
  border-bottom: 1px solid #d9ecff;
  border-radius: 12px;
}
.fpr-collapse :deep(.el-collapse-item.is-active .el-collapse-item__header) {
  border-radius: 12px 12px 0 0;
}
.fpr-collapse :deep(.el-collapse-item__wrap) {
  border: 1px solid #e4e7ed;
  border-top: none;
  border-radius: 0 0 12px 12px;
  background: #fff;
}
.fpr-collapse :deep(.el-collapse-item__content) {
  padding: 14px 16px 16px;
}
.fpr-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}
.fpr-icon { color: #0070c0; font-size: 18px; flex-shrink: 0; }
.fpr-title-text { font-size: 15px; font-weight: 700; color: #003a66; }
.fpr-filter-hint { font-size: 12px; color: #909399; font-weight: normal; margin-left: auto; }
.fpr-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}
.fpr-select { width: 130px; }
.fpr-select-sm { width: 110px; }
.fpr-opt-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.fpr-export { margin-left: auto; display: flex; flex-wrap: wrap; gap: 8px; }

.fpr-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  max-height: min(56vh, 640px);
  overflow-y: auto;
  padding: 2px 4px 4px;
  align-items: stretch;
}

.fpr-card {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  border-left: 3px solid var(--accent, #0070c0);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.fpr-card:hover {
  border-color: #c6e2ff;
  box-shadow: 0 4px 14px rgba(0, 112, 192, 0.1);
}

.fpr-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 10px 12px;
  background: linear-gradient(180deg, #f8fbff 0%, #f3f6f9 100%);
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.fpr-card-index {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  line-height: 24px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: var(--accent, #0070c0);
  border-radius: 6px;
}

.fpr-card-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fpr-card-class {
  font-size: 14px;
  font-weight: 700;
  color: #303133;
}

.fpr-card-sev {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  background: #ecf5ff;
  color: #409eff;
  font-weight: 600;
}

.fpr-card-conf {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  white-space: nowrap;
}

.fpr-card-body {
  margin: 0;
  padding: 10px 12px 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.fpr-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 4px 10px;
  align-items: start;
  padding: 5px 0;
  border-bottom: 1px dashed #f0f2f5;
}
.fpr-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.fpr-row-label {
  margin: 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  white-space: nowrap;
}

.fpr-row-value {
  margin: 0;
  font-size: 12px;
  color: #303133;
  line-height: 1.5;
  word-break: break-all;
}

.fpr-row-mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
}

@media (max-width: 900px) {
  .fpr-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .fpr-card-head {
    flex-wrap: wrap;
    min-height: auto;
    padding: 10px;
  }
  .fpr-card-conf {
    width: 100%;
    padding-left: 34px;
  }
  .fpr-row {
    grid-template-columns: 64px minmax(0, 1fr);
  }
}
</style>
