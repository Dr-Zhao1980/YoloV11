<template>
  <div ref="wrapRef" class="facade-canvas-wrap">
    <div v-if="isAnalyzing" class="ai-overlay">
      <div class="ai-card">
        <div class="ai-title">AI 深度普查诊断中，请稍候...</div>
        <div class="ai-subtitle">正在建立砖缝比例尺、分块识别并汇总整墙病害</div>
        <div class="ai-progress-shell">
          <div class="ai-progress-track">
            <div class="ai-progress-glow"></div>
            <div class="ai-progress-fill" :style="{ width: `${progressPct}%` }"></div>
          </div>
          <div class="ai-progress-text">{{ progressLabel }}</div>
        </div>
      </div>
    </div>
    <canvas
      ref="canvasRef"
      class="facade-canvas"
      @click="handleCanvasClick"
      @mousemove="handleCanvasMove"
      @mouseleave="hoverGrid = null"
    />

    <div v-if="hoverGrid" class="grid-tooltip">
      <div>{{ hoverGrid.gridId }}</div>
      <div>病害 {{ hoverGrid.totalCount }} 处</div>
      <div>面积 {{ hoverGrid.totalAreaM2 }} m²</div>
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

interface FacadeDetection {
  id: number
  class: string
  confidence: number
  globalBbox: number[]
  globalPolygon?: Array<{ x: number; y: number }>
}

const props = defineProps<{
  imageUrl: string
  imageWidth: number
  imageHeight: number
  wallWidthM: number
  wallHeightM: number
  grids: FacadeGrid[]
  detections?: FacadeDetection[]
  isAnalyzing?: boolean
  progress?: number
  progressText?: string
}>()

const emit = defineEmits<{
  (event: 'select-grid', grid: FacadeGrid): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLDivElement | null>(null)
const imageObj = ref<HTMLImageElement | null>(null)
const hoverGrid = ref<FacadeGrid | null>(null)
const containerWidth = ref(0)
const progressPct = computed(() => Math.max(0, Math.min(100, props.progress ?? 0)))
const progressLabel = computed(() => props.progressText || '正在执行 AI 诊断')

const displayScale = computed(() => {
  const w = containerWidth.value || 980
  // 视口高度的 70% 作为最大渲染高度，手机竖屏时图像也不会太高
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 680
  const maxHeight = Math.max(360, Math.min(680, viewportH * 0.7))
  return Math.min(w / props.imageWidth, maxHeight / props.imageHeight, 2)
})

function loadImage() {
  if (!props.imageUrl) return
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.onload = () => {
    imageObj.value = image
    drawCanvas()
  }
  image.src = props.imageUrl
}

function drawCanvas() {
  const canvas = canvasRef.value
  const image = imageObj.value
  if (!canvas || !image) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const scale = displayScale.value
  const canvasWidth = props.imageWidth * scale
  const canvasHeight = props.imageHeight * scale

  canvas.width = canvasWidth
  canvas.height = canvasHeight

  ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  ctx.drawImage(image, 0, 0, canvasWidth, canvasHeight)

  drawHeatmap(ctx, scale)
  drawGridLines(ctx, scale)
  drawDetectionBoxes(ctx, scale)
}

function drawHeatmap(ctx: CanvasRenderingContext2D, scale: number) {
  props.grids.forEach(grid => {
    if (!grid.intensity || grid.intensity <= 0) return

    const x = (grid.xM / props.wallWidthM) * props.imageWidth * scale
    const y = (grid.yM / props.wallHeightM) * props.imageHeight * scale
    const w = (grid.widthM / props.wallWidthM) * props.imageWidth * scale
    const h = (grid.heightM / props.wallHeightM) * props.imageHeight * scale

    const alpha = Math.min(0.72, 0.18 + grid.intensity * 0.54)
    ctx.fillStyle = `rgba(231, 76, 60, ${alpha})`
    ctx.fillRect(x, y, w, h)
  })
}

function drawGridLines(ctx: CanvasRenderingContext2D, scale: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)'
  ctx.lineWidth = 1

  props.grids.forEach(grid => {
    const x = (grid.xM / props.wallWidthM) * props.imageWidth * scale
    const y = (grid.yM / props.wallHeightM) * props.imageHeight * scale
    const w = (grid.widthM / props.wallWidthM) * props.imageWidth * scale
    const h = (grid.heightM / props.wallHeightM) * props.imageHeight * scale
    ctx.strokeRect(x, y, w, h)
  })

  ctx.restore()
}

const DISEASE_COLORS: Record<string, string> = {
  '风化': '#e74c3c',
  '泛碱': '#3498db',
  '裂缝': '#f39c12',
  '植物附着': '#9b59b6',
  '缺损': '#1abc9c'
}

function drawDetectionBoxes(ctx: CanvasRenderingContext2D, scale: number) {
  if (!props.detections || props.detections.length === 0) return

  ctx.save()
  ctx.lineWidth = Math.max(2, Math.min(4, 2 / scale))
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 4

  props.detections.forEach(det => {
    const bbox = det.globalBbox
    if (!bbox || bbox.length < 4) return

    const x = bbox[0] * scale
    const y = bbox[1] * scale
    const w = bbox[2] * scale
    const h = bbox[3] * scale

    const color = DISEASE_COLORS[det.class] || '#ffffff'
    ctx.strokeStyle = color
    if (det.globalPolygon && det.globalPolygon.length >= 3) {
      ctx.beginPath()
      det.globalPolygon.forEach((point, index) => {
        const px = point.x * scale
        const py = point.y * scale
        if (index === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()
      ctx.stroke()
    } else {
      ctx.strokeRect(x, y, w, h)
    }

    ctx.shadowBlur = 0
    ctx.fillStyle = color
    const labelY = Math.max(0, y - 18)
    ctx.fillRect(x, labelY, Math.max(72, Math.min(w, 120)), 18)

    ctx.fillStyle = '#ffffff'
    ctx.font = '11px sans-serif'
    const label = `${det.class} ${(det.confidence * 100).toFixed(0)}%`
    ctx.fillText(label, x + 4, labelY + 14)
    ctx.shadowBlur = 4
  })

  ctx.restore()
}

function locateGridByEvent(event: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return null

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height

  const canvasX = (event.clientX - rect.left) * scaleX
  const canvasY = (event.clientY - rect.top) * scaleY

  const imageX = canvasX / displayScale.value
  const imageY = canvasY / displayScale.value

  const wallXM = imageX / props.imageWidth * props.wallWidthM
  const wallYM = imageY / props.imageHeight * props.wallHeightM

  return props.grids.find(grid => {
    return wallXM >= grid.xM
      && wallXM < grid.xM + grid.widthM
      && wallYM >= grid.yM
      && wallYM < grid.yM + grid.heightM
  }) || null
}

function handleCanvasClick(event: MouseEvent) {
  const grid = locateGridByEvent(event)
  if (grid) emit('select-grid', grid)
}

function handleCanvasMove(event: MouseEvent) {
  hoverGrid.value = locateGridByEvent(event)
}

watch(
  () => [props.imageUrl, props.grids, props.detections],
  async () => {
    await nextTick()
    loadImage()
  },
  { deep: true }
)

watch(containerWidth, () => {
  if (imageObj.value) drawCanvas()
})

let resizeObserver: ResizeObserver | null = null
const handleWindowResize = () => {
  if (wrapRef.value) containerWidth.value = wrapRef.value.clientWidth
}

onMounted(() => {
  if (wrapRef.value) {
    containerWidth.value = wrapRef.value.clientWidth
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          containerWidth.value = entry.contentRect.width
        }
      })
      resizeObserver.observe(wrapRef.value)
    }
  }
  window.addEventListener('orientationchange', handleWindowResize)
  window.addEventListener('resize', handleWindowResize, { passive: true })
  loadImage()
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

.facade-canvas {
  display: block;
  width: 100%;
  cursor: crosshair;
  touch-action: manipulation;
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
  .facade-canvas { cursor: pointer; }
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
