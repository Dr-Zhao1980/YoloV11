<template>
  <div ref="wrapRef" class="facade-canvas-wrap">
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

const props = defineProps<{
  imageUrl: string
  imageWidth: number
  imageHeight: number
  wallWidthM: number
  wallHeightM: number
  grids: FacadeGrid[]
}>()

const emit = defineEmits<{
  (event: 'select-grid', grid: FacadeGrid): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLDivElement | null>(null)
const imageObj = ref<HTMLImageElement | null>(null)
const hoverGrid = ref<FacadeGrid | null>(null)
const containerWidth = ref(0)

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
  () => [props.imageUrl, props.grids],
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
}

@media (hover: none) and (pointer: coarse) {
  /* 触屏设备隐藏 hover tooltip，避免与点击手势重叠 */
  .grid-tooltip { display: none; }
}
</style>
