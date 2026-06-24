<template>
  <div ref="wrapRef" class="facade-canvas-wrap">
    <div v-if="isAnalyzing" class="ai-overlay">
      <div class="ai-card">
        <div class="ai-title">AI 深度普查诊断中，请稍候...</div>
        <div class="ai-subtitle">正在建立比例尺、分块识别并汇总整墙病害</div>
        <div class="ai-progress-shell">
          <div class="ai-progress-track">
            <div class="ai-progress-glow"></div>
            <div class="ai-progress-fill" :style="{ width: `${progressPct}%` }"></div>
          </div>
          <div class="ai-progress-text">{{ progressLabel }}</div>
        </div>
      </div>
    </div>

    <div ref="stageRef" class="facade-stage" :style="stageStyle">
      <img
        v-if="imageUrl"
        ref="bgImgRef"
        :src="imageUrl"
        class="facade-bg-img"
        alt="立面底图"
        decoding="async"
        draggable="false"
        @load="onBgLoad"
        @error="onBgError"
      />
      <div v-else class="facade-bg-placeholder">等待底图...</div>

      <canvas
        ref="canvasRef"
        class="facade-overlay-canvas"
        :width="overlaySize.w"
        :height="overlaySize.h"
        @click="handleCanvasClick"
        @mousemove="handleCanvasMove"
        @mouseleave="hoverGrid = null"
      />
    </div>

    <div v-if="hoverGrid" class="grid-tooltip">
      <div>{{ hoverGrid.gridId }}</div>
      <div>病害 {{ hoverGrid.totalCount }} 处</div>
      <div>面积 {{ hoverGrid.totalAreaM2 }} m²</div>
    </div>

    <div v-if="!isAnalyzing && grids.length" class="disease-legend">
      <span class="legend-title">定损说明</span>
      <span class="legend-item">网格编号如 R1-C5 用于定位</span>
      <span class="legend-item">
        <i class="legend-swatch legend-swatch--heat"></i>
        底色深浅表示该格病害密度
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface FacadeGrid {
  gridId: string
  row: number
  col: number
  xM: number
  yM: number
  widthM: number
  heightM: number
  totalCount: number
  totalAreaM2: number
  crackLengthM: number
  intensity: number
  tileIds: string[]
}

const props = defineProps<{
  imageUrl: string
  imageWidth: number
  imageHeight: number
  wallWidthM: number
  wallHeightM: number
  grids: FacadeGrid[]
  detections?: unknown[]
  isAnalyzing?: boolean
  progress?: number
  progressText?: string
}>()

const emit = defineEmits<{
  (event: 'select-grid', grid: FacadeGrid): void
}>()

const wrapRef = ref<HTMLDivElement | null>(null)
const stageRef = ref<HTMLDivElement | null>(null)
const bgImgRef = ref<HTMLImageElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const hoverGrid = ref<FacadeGrid | null>(null)
const containerWidth = ref(0)
const displaySize = ref({ w: 0, h: 0 })
const bgReady = ref(false)

const progressPct = computed(() => Math.max(0, Math.min(100, props.progress ?? 0)))
const progressLabel = computed(() => props.progressText || '正在执行 AI 诊断')

const logicalSize = computed(() => {
  const img = bgImgRef.value
  const w = img?.naturalWidth || props.imageWidth || 1
  const h = img?.naturalHeight || props.imageHeight || 1
  return { w: Math.max(1, w), h: Math.max(1, h) }
})

const displayScale = computed(() => {
  const { w: imgW, h: imgH } = logicalSize.value
  const cw = containerWidth.value || 980
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 680
  const maxHeight = Math.max(360, Math.min(680, viewportH * 0.7))
  return Math.min(cw / imgW, maxHeight / imgH, 2)
})

const stageStyle = computed(() => {
  const { w: imgW, h: imgH } = logicalSize.value
  if (!imgW || !imgH) return {}
  return { aspectRatio: `${imgW} / ${imgH}` }
})

const overlaySize = computed(() => {
  if (displaySize.value.w > 0 && displaySize.value.h > 0) {
    return displaySize.value
  }
  const scale = displayScale.value
  const { w: imgW, h: imgH } = logicalSize.value
  return {
    w: Math.max(1, Math.round(imgW * scale)),
    h: Math.max(1, Math.round(imgH * scale)),
  }
})

function syncDisplaySize() {
  const img = bgImgRef.value
  if (!img) return
  const w = img.clientWidth
  const h = img.clientHeight
  if (w > 0 && h > 0) {
    displaySize.value = { w: Math.round(w), h: Math.round(h) }
  }
}

function onBgLoad() {
  bgReady.value = true
  if (wrapRef.value?.clientWidth) {
    containerWidth.value = wrapRef.value.clientWidth
  }
  nextTick(() => {
    syncDisplaySize()
    drawOverlay()
  })
}

function onBgError() {
  bgReady.value = false
}

function gridRectOnCanvas(
  grid: FacadeGrid,
  imgW: number,
  imgH: number,
  wallW: number,
  wallH: number,
  scale: number,
) {
  const gw = (grid.widthM / wallW) * imgW * scale
  const gh = (grid.heightM / wallH) * imgH * scale
  const x = (grid.xM / wallW) * imgW * scale
  // 工程坐标原点在左下，Canvas 原点在左上
  const y = ((wallH - grid.yM - grid.heightM) / wallH) * imgH * scale
  return { x, y, w: gw, h: gh }
}

function drawOverlay() {
  const canvas = canvasRef.value
  if (!canvas || !bgReady.value) return

  syncDisplaySize()
  const w = overlaySize.value.w
  const h = overlaySize.value.h
  if (w <= 0 || h <= 0) return

  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, w, h)

  const scale = w / logicalSize.value.w
  const wallW = props.wallWidthM > 0 ? props.wallWidthM : 1
  const wallH = props.wallHeightM > 0 ? props.wallHeightM : 1
  const { w: imgW, h: imgH } = logicalSize.value

  props.grids.forEach(grid => {
    if (grid.intensity > 0 && grid.totalCount > 0) {
      const { x, y, w: gw, h: gh } = gridRectOnCanvas(grid, imgW, imgH, wallW, wallH, scale)
      ctx.fillStyle = getIntensityColor(grid.intensity)
      ctx.fillRect(x, y, gw, gh)
    }
  })

  // 统一绘制网格线（避免逐格描边导致虚线重叠变粗）
  const xLines = new Set<number>()
  const yLines = new Set<number>()
  let minY = Infinity
  let maxY = -Infinity
  props.grids.forEach(grid => {
    const { x, y, w: gw, h: gh } = gridRectOnCanvas(grid, imgW, imgH, wallW, wallH, scale)
    xLines.add(Math.round(x))
    xLines.add(Math.round(x + gw))
    yLines.add(Math.round(y))
    yLines.add(Math.round(y + gh))
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y + gh)
  })

  ctx.save()
  ctx.setLineDash([])
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(100, 220, 100, 0.75)'
  ctx.beginPath()
  for (const x of xLines) {
    ctx.moveTo(x + 0.5, minY)
    ctx.lineTo(x + 0.5, maxY)
  }
  for (const y of yLines) {
    ctx.moveTo(Math.min(...xLines), y + 0.5)
    ctx.lineTo(Math.max(...xLines), y + 0.5)
  }
  ctx.stroke()

  props.grids.forEach(grid => {
    const { x, y, w: gw, h: gh } = gridRectOnCanvas(grid, imgW, imgH, wallW, wallH, scale)

    if (gw > 28 && gh > 18) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
      const fontSize = Math.max(9, Math.min(13, 11 * scale))
      ctx.font = `bold ${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(grid.gridId, x + gw / 2, y + gh / 2)

      if (grid.totalCount > 0 && gh > 30) {
        ctx.font = `${Math.max(8, fontSize - 2)}px sans-serif`
        ctx.fillStyle = 'rgba(255, 255, 255, 0.78)'
        ctx.fillText(`${grid.totalCount}处`, x + gw / 2, y + gh / 2 + fontSize * 0.85)
      }
    }
  })

  ctx.restore()
}

function getIntensityColor(intensity: number): string {
  const r = Math.round(50 + intensity * 205)
  const g = Math.round(205 - intensity * 180)
  const b = Math.round(50 + intensity * 50)
  const alpha = Math.min(0.55, 0.12 + intensity * 0.42)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function locateGridByEvent(event: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return null

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const canvasX = (event.clientX - rect.left) * scaleX
  const canvasY = (event.clientY - rect.top) * scaleY

  const imageX = canvasX / (canvas.width / logicalSize.value.w)
  const imageY = canvasY / (canvas.height / logicalSize.value.h)

  const wallW = props.wallWidthM > 0 ? props.wallWidthM : 1
  const wallH = props.wallHeightM > 0 ? props.wallHeightM : 1
  const { w: imgW, h: imgH } = logicalSize.value
  const wallXM = (imageX / imgW) * wallW
  const wallYM = ((imgH - imageY) / imgH) * wallH

  return props.grids.find(grid =>
    wallXM >= grid.xM
    && wallXM < grid.xM + grid.widthM
    && wallYM >= grid.yM
    && wallYM < grid.yM + grid.heightM
  ) || null
}

function handleCanvasClick(event: MouseEvent) {
  const grid = locateGridByEvent(event)
  if (grid) emit('select-grid', grid)
}

function handleCanvasMove(event: MouseEvent) {
  hoverGrid.value = locateGridByEvent(event)
}

function scheduleRedraw() {
  nextTick(() => {
    syncDisplaySize()
    drawOverlay()
  })
}

watch(
  () => [props.imageUrl, props.grids, props.wallWidthM, props.wallHeightM],
  () => {
    bgReady.value = false
    scheduleRedraw()
  },
  { deep: true }
)

watch(() => props.isAnalyzing, (analyzing) => {
  if (!analyzing) scheduleRedraw()
})

watch(displayScale, () => scheduleRedraw())

let resizeObserver: ResizeObserver | null = null
const handleWindowResize = () => {
  if (wrapRef.value) containerWidth.value = wrapRef.value.clientWidth
  scheduleRedraw()
}

onMounted(() => {
  if (wrapRef.value) {
    containerWidth.value = wrapRef.value.clientWidth
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (wrapRef.value?.clientWidth) {
          containerWidth.value = wrapRef.value.clientWidth
        }
        scheduleRedraw()
      })
      resizeObserver.observe(wrapRef.value)
      if (stageRef.value) resizeObserver.observe(stageRef.value)
    }
  }
  window.addEventListener('orientationchange', handleWindowResize)
  window.addEventListener('resize', handleWindowResize, { passive: true })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('orientationchange', handleWindowResize)
  window.removeEventListener('resize', handleWindowResize)
})
</script>

<style scoped>
.facade-canvas-wrap {
  position: relative;
  width: 100%;
  min-height: 240px;
  border-radius: 18px;
  overflow: hidden;
  background: #111827;
  -webkit-tap-highlight-color: transparent;
}

.facade-stage {
  position: relative;
  width: 100%;
  max-height: 70vh;
  line-height: 0;
}

.facade-bg-img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 70vh;
  object-fit: contain;
  user-select: none;
}

.facade-bg-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
}

.facade-overlay-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: manipulation;
  pointer-events: auto;
}

.grid-tooltip {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  color: #fff;
  background: rgba(17, 24, 39, 0.85);
  font-size: 13px;
  line-height: 1.6;
  max-width: 60%;
  pointer-events: none;
  z-index: 5;
}

.disease-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  padding: 10px 14px;
  background: #f8fafc;
  border-top: 1px solid #e5e7eb;
  font-size: 12px;
  color: #475569;
}

.legend-title {
  font-weight: 600;
  color: #334155;
  margin-right: 4px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.legend-swatch--heat {
  background: linear-gradient(90deg, rgba(100, 220, 100, 0.3), rgba(255, 80, 80, 0.55));
}

.ai-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: radial-gradient(circle at center, rgba(6, 12, 24, 0.22), rgba(3, 7, 18, 0.72));
  backdrop-filter: blur(6px);
  z-index: 20;
  pointer-events: none;
}

.ai-card {
  width: min(680px, 92%);
  padding: 22px 24px 20px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(8, 17, 34, 0.92), rgba(10, 25, 52, 0.88));
  border: 1px solid rgba(116, 197, 255, 0.28);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(76, 180, 255, 0.12) inset;
}

.ai-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #eaf6ff;
  text-shadow: 0 0 18px rgba(72, 187, 255, 0.25);
}

.ai-subtitle {
  margin-top: 8px;
  font-size: 13px;
  color: rgba(214, 238, 255, 0.72);
}

.ai-progress-shell {
  margin-top: 18px;
}

.ai-progress-track {
  position: relative;
  height: 14px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(116, 197, 255, 0.18);
}

.ai-progress-glow {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent);
  animation: scanMove 1.8s linear infinite;
}

.ai-progress-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #2dd4ff 0%, #1677ff 48%, #9b5cff 100%);
  box-shadow: 0 0 18px rgba(45, 212, 255, 0.45);
  transition: width 0.25s ease;
}

.ai-progress-text {
  margin-top: 10px;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: rgba(215, 238, 255, 0.82);
  text-align: center;
}

@keyframes scanMove {
  0% { transform: translateX(-45%); }
  100% { transform: translateX(145%); }
}

@media (max-width: 768px) {
  .facade-canvas-wrap {
    min-height: 200px;
    border-radius: 12px;
  }
  .facade-overlay-canvas { cursor: pointer; }
  .grid-tooltip {
    right: 8px;
    bottom: 8px;
    padding: 6px 10px;
    font-size: 12px;
  }
  .ai-card { padding: 18px 16px 16px; }
  .ai-title { font-size: 16px; }
  .ai-subtitle { font-size: 12px; }
}

@media (hover: none) and (pointer: coarse) {
  .grid-tooltip { display: none; }
}
</style>
