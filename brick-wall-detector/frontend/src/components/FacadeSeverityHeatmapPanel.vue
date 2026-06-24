<template>
  <el-card class="fsh-panel" shadow="never">
    <template #header>
      <div class="fsh-header">
        <div class="fsh-header-left">
          <el-icon class="fsh-icon"><Picture /></el-icon>
          <div>
            <span class="fsh-title">病害严重程度热力图</span>
            <span class="fsh-sub">
              无标注正射底图 + heatmap.js 热力层（叠加 {{ Math.round(overlayOpacity * 100) }}%）
            </span>
          </div>
        </div>
        <el-button
          type="primary"
          :loading="generating"
          :disabled="!canGenerate"
          @click="generateHeatmap"
        >
          <el-icon><MagicStick /></el-icon>
          生成热力图
        </el-button>
      </div>
    </template>

    <div v-if="canGenerate" class="fsh-options">
      <el-form inline size="small" @submit.prevent>
        <el-form-item label="点权重">
          <el-select v-model="weightMode" style="width: 120px">
            <el-option label="置信度" value="confidence" />
            <el-option label="受损面积" value="area" />
            <el-option label="严重程度" value="severity" />
          </el-select>
        </el-form-item>
        <el-form-item label="叠加强度">
          <el-slider
            v-model="overlayOpacity"
            :min="0.2"
            :max="0.85"
            :step="0.05"
            :format-tooltip="(v: number) => `${Math.round(v * 100)}%`"
            style="width: 140px"
          />
        </el-form-item>
        <el-form-item label="渲染半径" class="fsh-radius-item">
          <el-slider
            v-model="heatRadius"
            :min="radiusRange.min"
            :max="radiusRange.max"
            :step="1"
            :format-tooltip="(v: number) => `${v} px`"
            style="width: 200px"
            @change="onRadiusChange"
          />
          <span class="fsh-radius-val">{{ heatRadius }} / {{ radiusRange.max }} px</span>
        </el-form-item>
      </el-form>
      <p class="fsh-options-hint">
        叠加图使用<strong>无检测框</strong>的正射原图。渲染半径可调
        {{ radiusRange.min }}–{{ radiusRange.max }} px：偏小便于区分三种点权重，偏大用于区域汇总。
      </p>
    </div>

    <el-alert
      v-if="lastError"
      type="error"
      :closable="true"
      show-icon
      class="fsh-error"
      :title="lastError"
      @close="lastError = ''"
    />

    <el-alert
      v-else-if="!canGenerate"
      type="info"
      :closable="false"
      show-icon
      title="请先完成 AI 诊断并确保有原图与病害数据，再生成热力图。"
    />

    <div v-if="hasResult" class="fsh-result">
      <div class="fsh-result-toolbar">
        <el-tag type="success" effect="dark">已生成 2 张热力图</el-tag>
        <span class="fsh-meta">{{ resultMeta }}</span>
        <div class="fsh-actions">
          <el-button type="primary" plain size="small" @click="downloadPure">
            <el-icon><Download /></el-icon> 下载纯热力图
          </el-button>
          <el-button type="warning" plain size="small" @click="downloadOverlay">
            <el-icon><Download /></el-icon> 下载叠加图
          </el-button>
          <el-button size="small" @click="generateHeatmap">
            <el-icon><Refresh /></el-icon> 重新生成
          </el-button>
        </div>
      </div>

      <div class="fsh-dual-preview">
        <div class="fsh-preview-block">
          <div class="fsh-preview-label">纯热力图</div>
          <div class="fsh-preview-wrap fsh-preview-wrap--dark">
            <img :src="pureHeatmapUrl" alt="纯热力图" class="fsh-preview-img" />
          </div>
        </div>
        <div class="fsh-preview-block">
          <div class="fsh-preview-label">正射底图 + 热力层</div>
          <div class="fsh-preview-wrap">
            <img :src="overlayHeatmapUrl" alt="叠加热力图" class="fsh-preview-img" />
          </div>
        </div>
      </div>
    </div>

    <el-empty
      v-else-if="!generating && !lastError"
      description="点击「生成热力图」输出纯热力图与底图叠加图（不会阻塞页面加载）"
    />
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Picture, MagicStick, Download, Refresh } from '@element-plus/icons-vue'
import type { SeverityDetection, HeatmapWeightMode } from '../utils/severityHeatmapRenderer'
import {
  getHeatRadiusRange,
  DEFAULT_HEAT_RADIUS,
  DEFAULT_OVERLAY_OPACITY,
} from '../utils/severityHeatmapRenderer'
import { downloadBlob, reportFilename } from '../utils/reportExport'

const props = defineProps<{
  /** 无标注全景正射图 URL */
  imageUrl: string
  imageWidth?: number
  imageHeight?: number
  /** 病害坐标所在画布宽/高（与 AI 分析区一致） */
  coordWidth?: number
  coordHeight?: number
  cropOffsetX?: number
  cropOffsetY?: number
  detections: SeverityDetection[]
  /** 诊断完成后自动生成分布热力图 */
  autoGenerate?: boolean
}>()

const generating = ref(false)
const weightMode = ref<HeatmapWeightMode>('confidence')
const overlayOpacity = ref(DEFAULT_OVERLAY_OPACITY)
const heatRadius = ref(DEFAULT_HEAT_RADIUS)
const radiusInitialized = ref(false)
const pureHeatmapUrl = ref('')
const overlayHeatmapUrl = ref('')
const pureBlob = ref<Blob | null>(null)
const overlayBlob = ref<Blob | null>(null)
const resultMeta = ref('')
const lastError = ref('')

const canGenerate = computed(
  () => !!props.imageUrl && (props.detections?.length ?? 0) > 0
)

const hasResult = computed(() => !!pureHeatmapUrl.value && !!overlayHeatmapUrl.value)

const radiusRange = computed(() =>
  getHeatRadiusRange(
    props.coordWidth || props.imageWidth || 2048,
    props.coordHeight || props.imageHeight || 2048
  )
)

watch(
  () =>
    [
      props.imageWidth,
      props.imageHeight,
      props.coordWidth,
      props.coordHeight,
      props.cropOffsetX,
      props.cropOffsetY,
    ] as const,
  () => {
    const cw = props.coordWidth || props.imageWidth
    const ch = props.coordHeight || props.imageHeight
    if (!cw || !ch) return
    const range = getHeatRadiusRange(cw, ch)
    heatRadius.value = Math.max(range.min, Math.min(range.max, DEFAULT_HEAT_RADIUS))
    radiusInitialized.value = true
    if (hasResult.value && !generating.value) {
      void generateHeatmap()
    }
  },
  { immediate: true }
)

watch([weightMode, overlayOpacity], () => {
  if (hasResult.value && !generating.value) {
    void generateHeatmap()
  }
})

watch(
  () => [props.detections, props.imageUrl, props.autoGenerate] as const,
  () => {
    if (props.autoGenerate && canGenerate.value && !generating.value) {
      void generateHeatmap()
    }
  },
  { deep: true }
)

function onRadiusChange() {
  if (hasResult.value && !generating.value) {
    void generateHeatmap()
  }
}

function revokeUrls() {
  if (pureHeatmapUrl.value) {
    URL.revokeObjectURL(pureHeatmapUrl.value)
    pureHeatmapUrl.value = ''
  }
  if (overlayHeatmapUrl.value) {
    URL.revokeObjectURL(overlayHeatmapUrl.value)
    overlayHeatmapUrl.value = ''
  }
}

function resolveImageUrl(url: string): string {
  if (!url) return ''
  if (/^(https?:|blob:|data:)/.test(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const src = resolveImageUrl(url)
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error('底图尺寸为 0'))
        return
      }
      resolve(img)
    }
    img.onerror = () => reject(new Error(`底图加载失败：${src}`))
    img.src = src
  })
}

async function generateHeatmap() {
  if (!canGenerate.value || generating.value) return

  generating.value = true
  lastError.value = ''
  revokeUrls()
  pureBlob.value = null
  overlayBlob.value = null

  try {
    const { renderSeverityHeatmaps, canvasToBlob } = await import('../utils/severityHeatmapRenderer')
    const img = await loadImage(props.imageUrl)
    const result = renderSeverityHeatmaps(img, props.detections || [], {
      weightMode: weightMode.value,
      overlayOpacity: overlayOpacity.value,
      radius: heatRadius.value,
      coordWidth: props.coordWidth || img.naturalWidth,
      coordHeight: props.coordHeight || img.naturalHeight,
      cropOffsetX: props.cropOffsetX ?? 0,
      cropOffsetY: props.cropOffsetY ?? 0,
    })
    const [pureB, overlayB] = await Promise.all([
      canvasToBlob(result.pure),
      canvasToBlob(result.overlay),
    ])
    pureBlob.value = pureB
    overlayBlob.value = overlayB
    pureHeatmapUrl.value = URL.createObjectURL(pureB)
    overlayHeatmapUrl.value = URL.createObjectURL(overlayB)
    resultMeta.value =
      `${result.width}×${result.height} px · ${result.pointCount} 点 · ` +
      `半径 ${result.radius} px · 渲染权重 ${result.normMin}~${result.normMax}`
    ElMessage.success('热力图已生成')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '热力图生成失败'
    lastError.value = msg
    ElMessage.error(msg)
  } finally {
    generating.value = false
  }
}

function downloadPure() {
  if (!pureBlob.value) {
    ElMessage.warning('请先生成热力图')
    return
  }
  downloadBlob(pureBlob.value, reportFilename('病害严重程度_纯热力图', 'png'), 'image/png')
}

function downloadOverlay() {
  if (!overlayBlob.value) {
    ElMessage.warning('请先生成热力图')
    return
  }
  downloadBlob(overlayBlob.value, reportFilename('病害严重程度_叠加图', 'png'), 'image/png')
}

onBeforeUnmount(() => revokeUrls())
</script>

<style scoped>
.fsh-panel {
  border: 1px solid #f5dab1;
  border-radius: 12px;
  background: linear-gradient(180deg, #fffbf5 0%, #fff 40%);
}
.fsh-panel :deep(.el-card__header) {
  background: linear-gradient(90deg, #fdf6ec, #fff);
  border-bottom: 1px solid #faecd8;
  padding: 14px 18px;
}
.fsh-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.fsh-header-left { display: flex; align-items: flex-start; gap: 12px; }
.fsh-icon { font-size: 28px; color: #e6a23c; margin-top: 2px; }
.fsh-title { display: block; font-size: 16px; font-weight: 700; color: #303133; }
.fsh-sub { display: block; font-size: 12px; color: #909399; margin-top: 4px; }
.fsh-options {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}
.fsh-options :deep(.el-form-item) { margin-bottom: 0; margin-right: 12px; }
.fsh-radius-item :deep(.el-form-item__content) {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}
.fsh-radius-val {
  font-size: 12px;
  color: #606266;
  min-width: 88px;
  font-variant-numeric: tabular-nums;
}
.fsh-options-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
.fsh-error { margin-bottom: 12px; }
.fsh-result { margin-top: 4px; }
.fsh-result-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}
.fsh-meta { font-size: 12px; color: #606266; }
.fsh-actions { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
.fsh-dual-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 960px) {
  .fsh-dual-preview { grid-template-columns: 1fr; }
}
.fsh-preview-block { min-width: 0; }
.fsh-preview-label {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}
.fsh-preview-wrap {
  border-radius: 10px;
  overflow: auto;
  max-height: min(60vh, 560px);
  background: #2c2c2c;
  border: 1px solid #dcdfe6;
  text-align: center;
}
.fsh-preview-wrap--dark { background: #0d1117; }
.fsh-preview-img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}
</style>
