<template>
  <div class="fms-wrap">
    <!-- Header -->
    <div class="fms-header">
      <span class="fms-title">手动框选砖块标定比例尺</span>
      <div style="flex:1" />
      <el-button-group size="small">
        <el-button @click="zoomOut" :icon="ZoomOut" plain :disabled="zoom <= 0.5">缩小</el-button>
        <el-button plain disabled>{{ Math.round(zoom * 100) }}%</el-button>
        <el-button @click="zoomIn" :icon="ZoomIn" plain :disabled="zoom >= 3">放大</el-button>
        <el-button @click="resetZoom" :icon="RefreshRight" plain>适应</el-button>
      </el-button-group>
      <el-button size="small" @click="resetAll" :icon="RefreshRight" plain style="margin-left:8px">重置</el-button>
    </div>

    <!-- Step indicator -->
    <div class="fms-steps">
      <div class="fms-step" :class="{ active: currentStep === 1, done: currentStep > 1 }">
        <div class="fms-step-num">1</div>
        <div class="fms-step-text">框选长砖块<br><small>长度方向 (A={{ brickLengthMm }}mm)</small></div>
      </div>
      <div class="fms-step-line" :class="{ done: currentStep > 1 }" />
      <div class="fms-step" :class="{ active: currentStep === 2 }">
        <div class="fms-step-num">2</div>
        <div class="fms-step-text">计算比例尺<br><small>完成标定</small></div>
      </div>
    </div>

    <!-- Image container with selection overlay - Scrollable -->
    <div class="fms-scroll-container" ref="scrollContainerRef">
      <div
        class="fms-container"
        ref="containerRef"
        :style="containerStyle"
        @wheel.prevent="onWheel"
      >
        <img
          ref="imgRef"
          :src="imageUrl"
          class="fms-img"
          draggable="false"
          @load="onLoad"
        />

        <!-- Selection overlays -->
        <template v-if="imgLoaded">
          <!-- Long brick selection (A) -->
          <div
            v-if="longBrickRect"
            class="fms-selection fms-selection-long"
            :style="getSelectionStyle(longBrickRect)"
          >
            <span class="fms-label">长砖块 A={{ brickLengthMm }}mm</span>
            <span class="fms-dims">{{ Math.round(longBrickRect.w / zoom) }}×{{ Math.round(longBrickRect.h / zoom) }}px</span>
            <div class="fms-handle fms-handle-tl" @mousedown.prevent.stop="startResize($event, 'long', 'tl')" />
            <div class="fms-handle fms-handle-tr" @mousedown.prevent.stop="startResize($event, 'long', 'tr')" />
            <div class="fms-handle fms-handle-bl" @mousedown.prevent.stop="startResize($event, 'long', 'bl')" />
            <div class="fms-handle fms-handle-br" @mousedown.prevent.stop="startResize($event, 'long', 'br')" />
          </div>

          <!-- Drawing mask -->
          <div
            v-if="isDrawing"
            class="fms-drawing"
            :style="drawingStyle"
          />
        </template>

        <!-- Hint overlay -->
        <div v-if="currentStep === 1 && !isDrawing && imgLoaded" class="fms-hint-overlay">
          <el-icon :size="20" color="#fff"><InfoFilled /></el-icon>
          <span>{{ hintText }}</span>
          <span class="fms-hint-pan">（按住空格键或中键拖动图片）</span>
        </div>
      </div>
    </div>

    <!-- Results panel -->
    <div v-if="calculatedScale > 0" class="fms-results">
      <div class="fms-result-row">
        <span class="fms-result-label">长砖像素尺寸:</span>
        <span class="fms-result-value">{{ longBrickPx }} px = {{ brickLengthMm }} mm</span>
      </div>
      <div class="fms-result-row highlight">
        <span class="fms-result-label">计算比例尺:</span>
        <span class="fms-result-value">{{ calculatedScale.toFixed(4) }} px/mm</span>
      </div>
      <div class="fms-actions">
        <el-button type="primary" size="small" @click="applyScale">
          <el-icon><Check /></el-icon> 应用此比例尺
        </el-button>
        <el-button size="small" @click="recalibrate">
          <el-icon><RefreshLeft /></el-icon> 重新标定
        </el-button>
      </div>
    </div>

    <!-- Footer controls -->
    <div class="fms-footer">
      <el-button
        v-if="currentStep === 1"
        type="primary"
        size="small"
        :disabled="!longBrickRect"
        @click="nextStep"
      >
        计算比例尺 <el-icon><Check /></el-icon>
      </el-button>
      <el-tag v-if="currentStep === 2" type="success">标定完成</el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { InfoFilled, Check, RefreshLeft, RefreshRight, ZoomIn, ZoomOut } from '@element-plus/icons-vue'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const props = defineProps<{
  imageFile?: File | null
  previewImageUrl?: string
  brickLengthMm: number  // A - 砖块实际长度
  brickWidthMm: number   // B - 砖块实际宽度
}>()

const emit = defineEmits<{
  'update:scale': [scale: number]
  'apply': [scale: number, longBrickPx: number, shortBrickPx: number]
}>()

// ── Image handling ──────────────────────────────────────────────
const containerRef = ref<HTMLDivElement | null>(null)
const scrollContainerRef = ref<HTMLDivElement | null>(null)
const imgRef = ref<HTMLImageElement | null>(null)
const imageUrl = ref('')
const imgNW = ref(0)  // native width
const imgNH = ref(0)  // native height
const baseW = ref(0)  // base display width (at zoom=1)
const baseH = ref(0)  // base display height (at zoom=1)
const imgLoaded = ref(false)
const selfCreatedUrl = ref('')  // track URLs we created ourselves

// ── Zoom handling ───────────────────────────────────────────────
const zoom = ref(1)
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3

function zoomIn() {
  if (zoom.value < MAX_ZOOM) {
    zoom.value = Math.min(MAX_ZOOM, zoom.value + 0.25)
  }
}

function zoomOut() {
  if (zoom.value > MIN_ZOOM) {
    zoom.value = Math.max(MIN_ZOOM, zoom.value - 0.25)
  }
}

function resetZoom() {
  zoom.value = 1
}

function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    if (e.deltaY < 0) zoomIn()
    else zoomOut()
  }
}

watch(() => [props.imageFile, props.previewImageUrl], ([f, url]) => {
  if (selfCreatedUrl.value) {
    URL.revokeObjectURL(selfCreatedUrl.value)
    selfCreatedUrl.value = ''
  }
  let targetUrl = ''
  if (f instanceof File) {
    targetUrl = URL.createObjectURL(f)
    selfCreatedUrl.value = targetUrl
  } else if (typeof url === 'string' && url) {
    targetUrl = url
  }
  if (targetUrl !== imageUrl.value) {
    imageUrl.value = ''
    imgNW.value = 0; imgNH.value = 0
    baseW.value = 0; baseH.value = 0
    imgLoaded.value = false
    zoom.value = 1
    imageUrl.value = targetUrl
  }
}, { immediate: true })

function onLoad() {
  const img = imgRef.value!
  imgNW.value = img.naturalWidth
  imgNH.value = img.naturalHeight
  // Calculate base size to fit within max dimensions
  const maxW = 820  // dialog width minus padding
  const maxH = 520  // max height
  const ratio = Math.min(maxW / imgNW.value, maxH / imgNH.value, 1)
  baseW.value = imgNW.value * ratio
  baseH.value = imgNH.value * ratio
  imgLoaded.value = true
}

onBeforeUnmount(() => {
  if (selfCreatedUrl.value) {
    URL.revokeObjectURL(selfCreatedUrl.value)
    selfCreatedUrl.value = ''
  }
  window.removeEventListener('mousemove', onGlobalMove)
  window.removeEventListener('mouseup', onGlobalUp)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})

// ── Scale conversion ────────────────────────────────────────────
// Current display size at current zoom
const dispW = computed(() => baseW.value * zoom.value)
const dispH = computed(() => baseH.value * zoom.value)
// Scale from native to current display
const scaleX = computed(() => dispW.value / imgNW.value || 1)
const scaleY = computed(() => dispH.value / imgNH.value || 1)

// ── Step management ───────────────────────────────────────────
const currentStep = ref(1)  // 1=long brick, 2=done
const hintText = computed(() => {
  if (currentStep.value === 1) return '拖动鼠标框选一块完整的长砖块（沿长度方向A）'
  return ''
})

function nextStep() {
  if (currentStep.value === 1 && longBrickRect.value) {
    calculateScale()
  }
}

function recalibrate() {
  currentStep.value = 1
  longBrickRect.value = null
  calculatedScale.value = 0
}

function resetAll() {
  recalibrate()
}

// ── Selection state ────────────────────────────────────────────
const longBrickRect = ref<Rect | null>(null)

const isDrawing = ref(false)
const drawStart = ref({ x: 0, y: 0 })
const drawCurrent = ref({ x: 0, y: 0 })

const drawingStyle = computed(() => {
  if (!isDrawing.value) return {}
  const x = Math.min(drawStart.value.x, drawCurrent.value.x)
  const y = Math.min(drawStart.value.y, drawCurrent.value.y)
  const w = Math.abs(drawCurrent.value.x - drawStart.value.x)
  const h = Math.abs(drawCurrent.value.y - drawStart.value.y)
  return {
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
    borderColor: '#409eff',
    backgroundColor: 'rgba(64, 158, 255, 0.15)'
  }
})

function getSelectionStyle(rect: Rect) {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.w}px`,
    height: `${rect.h}px`
  }
}

// ── Mouse interactions ─────────────────────────────────────────
type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br'
const isResizing = ref(false)
const resizeTarget = ref<'long' | null>(null)
const resizeHandle = ref<ResizeHandle | null>(null)
const resizeStart = ref({ x: 0, y: 0, rect: {} as Rect })

// ── Pan/Drag state ────────────────────────────────────────────
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const scrollStart = ref({ x: 0, y: 0 })
const isSpacePressed = ref(false)

// Get mouse position relative to the image at current zoom level
function getRelPos(e: MouseEvent) {
  const container = containerRef.value!
  const rect = container.getBoundingClientRect()
  // Calculate position relative to the container
  const rawX = e.clientX - rect.left
  const rawY = e.clientY - rect.top
  // Clamp to container bounds
  return {
    x: Math.max(0, Math.min(dispW.value, rawX)),
    y: Math.max(0, Math.min(dispH.value, rawY))
  }
}

// Start drawing new selection (or panning with middle button / space key)
function startDrawing(e: MouseEvent) {
  // Middle mouse button (1) or space key triggers panning
  if (e.button === 1 || (isSpacePressed.value && e.button === 0)) {
    e.preventDefault()
    isPanning.value = true
    panStart.value = { x: e.clientX, y: e.clientY }
    const scrollContainer = scrollContainerRef.value
    if (scrollContainer) {
      scrollStart.value = { x: scrollContainer.scrollLeft, y: scrollContainer.scrollTop }
    }
    return
  }
  if (currentStep.value > 2) return
  if (isResizing.value) return
  if (e.button !== 0) return // Only left click for drawing
  const pos = getRelPos(e)
  isDrawing.value = true
  drawStart.value = pos
  drawCurrent.value = pos
}

function onMouseMove(e: MouseEvent) {
  // Handle panning
  if (isPanning.value) {
    const dx = e.clientX - panStart.value.x
    const dy = e.clientY - panStart.value.y
    const scrollContainer = scrollContainerRef.value
    if (scrollContainer) {
      scrollContainer.scrollLeft = scrollStart.value.x - dx
      scrollContainer.scrollTop = scrollStart.value.y - dy
    }
    return
  }
  if (isDrawing.value) {
    drawCurrent.value = getRelPos(e)
  } else if (isResizing.value && resizeTarget.value && resizeHandle.value) {
    const pos = getRelPos(e)
    const start = resizeStart.value
    const rect = { ...start.rect }
    const dx = pos.x - start.x
    const dy = pos.y - start.y

    if (resizeHandle.value.includes('l')) {
      rect.x = Math.min(start.rect.x + dx, rect.x + rect.w - 20)
      rect.w = Math.max(20, start.rect.w - dx + (start.rect.x - rect.x))
    }
    if (resizeHandle.value.includes('r')) {
      rect.w = Math.max(20, start.rect.w + dx)
    }
    if (resizeHandle.value.includes('t')) {
      rect.y = Math.min(start.rect.y + dy, rect.y + rect.h - 20)
      rect.h = Math.max(20, start.rect.h - dy + (start.rect.y - rect.y))
    }
    if (resizeHandle.value.includes('b')) {
      rect.h = Math.max(20, start.rect.h + dy)
    }

    if (resizeTarget.value === 'long') {
      longBrickRect.value = rect
    }
  }
}

function finishDrawing() {
  if (!isDrawing.value) return
  isDrawing.value = false

  const x = Math.min(drawStart.value.x, drawCurrent.value.x)
  const y = Math.min(drawStart.value.y, drawCurrent.value.y)
  const w = Math.abs(drawCurrent.value.x - drawStart.value.x)
  const h = Math.abs(drawCurrent.value.y - drawStart.value.y)

  // Minimum size check
  if (w < 10 || h < 10) return

  const rect: Rect = { x, y, w, h }

  if (currentStep.value === 1) {
    longBrickRect.value = rect
  }
}

// Resize existing selection
function startResize(e: MouseEvent, target: 'long', handle: ResizeHandle) {
  e.stopPropagation()
  isResizing.value = true
  resizeTarget.value = target
  resizeHandle.value = handle
  resizeStart.value = {
    x: e.clientX,
    y: e.clientY,
    rect: { ...longBrickRect.value! }
  }
}

function onGlobalMove(e: MouseEvent) {
  if (isPanning.value || isDrawing.value || isResizing.value) {
    onMouseMove(e)
  }
}

function onGlobalUp() {
  if (isDrawing.value) {
    finishDrawing()
  }
  isResizing.value = false
  resizeTarget.value = null
  resizeHandle.value = null
  isPanning.value = false
}

// Mouse events on container
onMounted(() => {
  const container = containerRef.value
  if (container) {
    container.addEventListener('mousedown', startDrawing)
    container.addEventListener('mousemove', onMouseMove)
  }
  window.addEventListener('mousemove', onGlobalMove)
  window.addEventListener('mouseup', onGlobalUp)
  // Keyboard events for space key panning
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' && !isSpacePressed.value) {
    e.preventDefault()
    isSpacePressed.value = true
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') {
    e.preventDefault()
    isSpacePressed.value = false
    // Stop panning if space is released during pan
    if (isPanning.value) {
      isPanning.value = false
    }
  }
}

// ── Scale calculation ──────────────────────────────────────────
const calculatedScale = ref(0)
const longBrickPx = ref(0)
const shortBrickPx = ref(0)

function calculateScale() {
  if (!longBrickRect.value) return

  const longW = Math.round(longBrickRect.value.w / scaleX.value)
  const longH = Math.round(longBrickRect.value.h / scaleY.value)

  const rectLongPx = Math.max(longW, longH)
  const rectShortPx = Math.min(longW, longH)

  longBrickPx.value = rectLongPx
  shortBrickPx.value = rectShortPx

  const scaleFromLength = rectLongPx / props.brickLengthMm
  const scaleFromWidth = rectShortPx / props.brickWidthMm

  calculatedScale.value = (scaleFromLength + scaleFromWidth) / 2

  currentStep.value = 2
}

function applyScale() {
  if (calculatedScale.value > 0) {
    emit('update:scale', calculatedScale.value)
    emit('apply', calculatedScale.value, longBrickPx.value, shortBrickPx.value)
  }
}

// ── Styles ─────────────────────────────────────────────────────
const containerStyle = computed(() => {
  const base: Record<string, string> = {}
  if (baseW.value && baseH.value) {
    base.width = `${dispW.value}px`
    base.height = `${dispH.value}px`
  }
  if (isPanning.value) {
    base.cursor = 'grabbing'
  } else if (isSpacePressed.value) {
    base.cursor = 'grab'
  } else {
    base.cursor = 'crosshair'
  }
  return base
})
</script>

<style scoped>
.fms-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 12px 0;
  user-select: none;
}

/* ── Header ── */
.fms-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fms-title { font-size: 14px; font-weight: 600; color: #303133; }

/* ── Steps ── */
.fms-steps {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 8px;
}
.fms-step {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fms-step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #dcdfe6;
  color: #606266;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}
.fms-step.active .fms-step-num {
  background: #409eff;
  color: #fff;
}
.fms-step.done .fms-step-num {
  background: #67c23a;
  color: #fff;
}
.fms-step-text {
  font-size: 12px;
  color: #606266;
  line-height: 1.3;
}
.fms-step-text small {
  color: #909399;
}
.fms-step.active .fms-step-text {
  color: #303133;
  font-weight: 500;
}
.fms-step-line {
  flex: 1;
  height: 2px;
  background: #dcdfe6;
  max-width: 40px;
}
.fms-step-line.done {
  background: #67c23a;
}

/* ── Scroll Container ── */
.fms-scroll-container {
  width: 100%;
  max-height: 520px;
  overflow: auto;
  background: #1a1a1a;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
}

/* ── Container ── */
.fms-container {
  position: relative;
  display: inline-block;
  background: #111;
  cursor: crosshair;
  transform-origin: top left;
}

.fms-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
}

/* ── Selections ── */
.fms-selection {
  position: absolute;
  box-sizing: border-box;
  pointer-events: auto;
  z-index: 10;
}
.fms-selection-long {
  border: 0.5px solid #409eff;
  background: rgba(64, 158, 255, 0.06);
  box-shadow: 0 0 0 0.5px rgba(64, 158, 255, 0.5);
}

.fms-label {
  position: absolute;
  top: -20px;
  left: 0;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.7);
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
  line-height: 1.4;
}
.fms-selection-long .fms-label {
  background: rgba(64, 158, 255, 0.9);
}

.fms-dims {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 9px;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  padding: 1px 4px;
  border-radius: 2px;
}

/* ── Handles ── */
.fms-handle {
  position: absolute;
  width: 6px;
  height: 6px;
  background: #fff;
  border: 0.5px solid currentColor;
  border-radius: 1px;
  z-index: 11;
  box-shadow: 0 1px 2px rgba(0,0,0,0.4);
}
.fms-selection-long .fms-handle { border-color: #409eff; }

.fms-handle-tl { top: -3px; left: -3px; cursor: nwse-resize; }
.fms-handle-tr { top: -3px; right: -3px; cursor: nesw-resize; }
.fms-handle-bl { bottom: -3px; left: -3px; cursor: nesw-resize; }
.fms-handle-br { bottom: -3px; right: -3px; cursor: nwse-resize; }

.fms-handle:hover {
  background: #ffd04b;
  transform: scale(1.4);
}

/* ── Drawing ── */
.fms-drawing {
  position: absolute;
  border: 0.5px dashed;
  pointer-events: none;
  z-index: 9;
}

/* ── Hint overlay ── */
.fms-hint-overlay {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 12px;
  z-index: 20;
  pointer-events: none;
  white-space: nowrap;
}
.fms-hint-pan {
  color: #a0cfff;
  font-size: 11px;
}

/* ── Results ── */
.fms-results {
  background: #f0f9ff;
  border: 1px solid #b3d8ff;
  border-radius: 8px;
  padding: 12px 16px;
}
.fms-result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
}
.fms-result-row.highlight {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #b3d8ff;
}
.fms-result-row.highlight .fms-result-value {
  font-size: 15px;
  font-weight: 600;
  color: #409eff;
}
.fms-result-label { color: #606266; }
.fms-result-value { color: #303133; font-weight: 500; }

.fms-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

/* ── Footer ── */
.fms-footer {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}
</style>
