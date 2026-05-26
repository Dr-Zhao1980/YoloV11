<template>
  <div class="roi-selector-wrap">
    <!-- Toolbar -->
    <div class="roi-toolbar">
      <el-button-group size="small">
        <el-button :type="mode === 'draw' ? 'primary' : 'default'" @click="setMode('draw')">
          <el-icon><ScaleToOriginal /></el-icon> 框选区域
        </el-button>
        <el-button @click="resetToFull">
          <el-icon><FullScreen /></el-icon> 全图选择
        </el-button>
        <el-button v-if="sel" @click="clearSel" plain>
          <el-icon><Delete /></el-icon> 清除
        </el-button>
      </el-button-group>
      <span v-if="sel" class="roi-info-text">
        选区：{{ Math.round(emitRoi.width) }} × {{ Math.round(emitRoi.height) }} px
        （{{ Math.round(emitRoi.width / imgNW * 100) }}% 宽）
      </span>
      <span v-else class="roi-info-text roi-hint">
        {{ mode === 'draw' ? '在图像上拖拽绘制选区' : '点击"框选区域"后在图上拖拽' }}
      </span>
    </div>

    <!-- Image + Overlay -->
    <div
      ref="containerRef"
      class="roi-container"
      :class="{ 'cursor-crosshair': mode === 'draw', 'cursor-default': mode === 'idle' }"
      @mousedown.prevent="onMouseDown"
      @mousemove.prevent="onMouseMove"
      @mouseup.prevent="onMouseUp"
      @mouseleave="onMouseLeave"
      @touchstart.prevent="onTouchStart"
      @touchmove.prevent="onTouchMove"
      @touchend.prevent="onTouchEnd"
    >
      <img
        ref="imgRef"
        :src="imgUrl"
        class="roi-img"
        draggable="false"
        @load="onImgLoad"
      />

      <!-- Selection overlay -->
      <div v-if="sel" class="roi-overlay" :style="overlayStyle">
        <!-- Move handle (inner area) -->
        <div
          class="roi-move-area"
          @mousedown.stop.prevent="startMove"
        />
        <!-- Edge + corner resize handles -->
        <div v-for="h in HANDLES" :key="h"
          :class="`roi-handle roi-handle-${h}`"
          @mousedown.stop.prevent="startResize(h, $event)"
        />
        <!-- Dimension badge -->
        <div class="roi-dim-badge">
          {{ Math.round(emitRoi.width) }}×{{ Math.round(emitRoi.height) }}
        </div>
      </div>

      <!-- Grid overlay showing N×N tiles -->
      <div v-if="sel && gridMode" class="roi-grid-overlay" :style="overlayStyle">
        <div
          v-for="r in gridMode" :key="`r${r}`"
          class="roi-grid-row"
          :style="{ height: `${100 / gridMode}%` }"
        >
          <div
            v-for="c in gridMode" :key="`c${c}`"
            class="roi-grid-cell"
            :style="{ width: `${100 / gridMode}%` }"
          >
            <span class="roi-grid-label">{{ (r-1)*gridMode + c }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ScaleToOriginal, FullScreen, Delete } from '@element-plus/icons-vue'

interface Roi { x: number; y: number; width: number; height: number }
interface SelRect { x: number; y: number; w: number; h: number } // display pixels

const props = defineProps<{
  modelValue: Roi | null
  imageFile: File | null
  gridMode?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', roi: Roi | null): void
}>()

// ── Image display ──────────────────────────────────────────────────────────
const containerRef = ref<HTMLDivElement | null>(null)
const imgRef       = ref<HTMLImageElement | null>(null)
const imgUrl       = ref('')
const imgNW        = ref(1)  // native width
const imgNH        = ref(1)  // native height
const dispW        = ref(1)  // display width
const dispH        = ref(1)  // display height

watch(() => props.imageFile, (f) => {
  if (imgUrl.value) URL.revokeObjectURL(imgUrl.value)
  imgUrl.value = f ? URL.createObjectURL(f) : ''
  sel.value = null
  emit('update:modelValue', null)
}, { immediate: true })

function onImgLoad() {
  const img = imgRef.value!
  imgNW.value = img.naturalWidth
  imgNH.value = img.naturalHeight
  dispW.value = img.clientWidth
  dispH.value = img.clientHeight
  // default to full image
  resetToFull()
}

onBeforeUnmount(() => {
  if (imgUrl.value) URL.revokeObjectURL(imgUrl.value)
  window.removeEventListener('mousemove', onWinMove)
  window.removeEventListener('mouseup',   onWinUp)
})

// ── Selection state (display-pixel space) ──────────────────────────────────
const sel  = ref<SelRect | null>(null)
const mode = ref<'idle' | 'draw'>('draw')

const HANDLES = ['n','s','e','w','ne','nw','se','sw'] as const
type Handle = typeof HANDLES[number]

function setMode(m: 'idle' | 'draw') { mode.value = m }

function resetToFull() {
  const img = imgRef.value
  if (!img) return
  dispW.value = img.clientWidth
  dispH.value = img.clientHeight
  sel.value = { x: 0, y: 0, w: dispW.value, h: dispH.value }
  emitCurrent()
}

function clearSel() {
  sel.value = null
  emit('update:modelValue', null)
}

// ── Overlay style ───────────────────────────────────────────────────────────
const overlayStyle = computed(() => {
  if (!sel.value) return {}
  const s = sel.value
  return {
    left:   `${s.x}px`,
    top:    `${s.y}px`,
    width:  `${s.w}px`,
    height: `${s.h}px`
  }
})

// ── Emit ROI in native image pixels ────────────────────────────────────────
const emitRoi = computed<Roi>(() => {
  const s = sel.value
  if (!s) return { x: 0, y: 0, width: imgNW.value, height: imgNH.value }
  const sx = dispW.value / imgNW.value
  const sy = dispH.value / imgNH.value
  return {
    x:      Math.round(s.x / sx),
    y:      Math.round(s.y / sy),
    width:  Math.round(s.w / sx),
    height: Math.round(s.h / sy)
  }
})

function emitCurrent() {
  emit('update:modelValue', sel.value ? { ...emitRoi.value } : null)
}

// ── Drag state ──────────────────────────────────────────────────────────────
type DragMode = 'drawing' | 'moving' | Handle | null
const dragMode  = ref<DragMode>(null)
const dragStart = ref({ mx: 0, my: 0, sx: 0, sy: 0, sw: 0, sh: 0 })

function getRelPos(e: MouseEvent | Touch) {
  const rect = containerRef.value!.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(dispW.value,  e.clientX - rect.left)),
    y: Math.max(0, Math.min(dispH.value,  e.clientY - rect.top))
  }
}

// ── Draw new selection ──────────────────────────────────────────────────────
function onMouseDown(e: MouseEvent) {
  if (mode.value !== 'draw') return
  const { x, y } = getRelPos(e)
  dragMode.value  = 'drawing'
  dragStart.value = { mx: x, my: y, sx: x, sy: y, sw: 0, sh: 0 }
  sel.value = { x, y, w: 1, h: 1 }
  window.addEventListener('mousemove', onWinMove)
  window.addEventListener('mouseup',   onWinUp)
}

function onMouseMove(e: MouseEvent) { /* handled by window listener */ }
function onMouseUp(e: MouseEvent)   { /* handled by window listener */ }
function onMouseLeave()             { /* keep drag alive via window listener */ }

function onWinMove(e: MouseEvent) {
  if (!dragMode.value) return
  const { x, y } = getRelPos(e)
  applyDrag(x, y)
}

function onWinUp(e: MouseEvent) {
  finishDrag()
  window.removeEventListener('mousemove', onWinMove)
  window.removeEventListener('mouseup',   onWinUp)
}

// ── Move ─────────────────────────────────────────────────────────────────────
function startMove(e: MouseEvent) {
  if (!sel.value) return
  const { x, y } = getRelPos(e)
  dragMode.value  = 'moving'
  dragStart.value = { mx: x, my: y, sx: sel.value.x, sy: sel.value.y, sw: sel.value.w, sh: sel.value.h }
  window.addEventListener('mousemove', onWinMove)
  window.addEventListener('mouseup',   onWinUp)
}

// ── Resize ───────────────────────────────────────────────────────────────────
function startResize(handle: Handle, e: MouseEvent) {
  if (!sel.value) return
  const { x, y } = getRelPos(e)
  dragMode.value  = handle
  dragStart.value = { mx: x, my: y, sx: sel.value.x, sy: sel.value.y, sw: sel.value.w, sh: sel.value.h }
  window.addEventListener('mousemove', onWinMove)
  window.addEventListener('mouseup',   onWinUp)
}

// ── Apply drag ───────────────────────────────────────────────────────────────
const MIN_SIZE = 20
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

function applyDrag(cx: number, cy: number) {
  const dm = dragMode.value
  const ds = dragStart.value
  const s  = sel.value
  if (!dm || !s) return

  if (dm === 'drawing') {
    const x = Math.min(cx, ds.mx)
    const y = Math.min(cy, ds.my)
    const w = Math.abs(cx - ds.mx)
    const h = Math.abs(cy - ds.my)
    sel.value = {
      x: clamp(x, 0, dispW.value - 1),
      y: clamp(y, 0, dispH.value - 1),
      w: clamp(w, 1, dispW.value),
      h: clamp(h, 1, dispH.value)
    }
    return
  }

  if (dm === 'moving') {
    sel.value = {
      x: clamp(ds.sx + cx - ds.mx, 0, dispW.value - ds.sw),
      y: clamp(ds.sy + cy - ds.my, 0, dispH.value - ds.sh),
      w: ds.sw,
      h: ds.sh
    }
    return
  }

  // Resize by handle
  let { x, y, w, h } = { x: ds.sx, y: ds.sy, w: ds.sw, h: ds.sh }
  const dx = cx - ds.mx
  const dy = cy - ds.my

  if (dm.includes('e')) { w = clamp(ds.sw + dx, MIN_SIZE, dispW.value - ds.sx) }
  if (dm.includes('s')) { h = clamp(ds.sh + dy, MIN_SIZE, dispH.value - ds.sy) }
  if (dm.includes('w')) {
    const newX = clamp(ds.sx + dx, 0, ds.sx + ds.sw - MIN_SIZE)
    w = ds.sw + (ds.sx - newX)
    x = newX
  }
  if (dm.includes('n')) {
    const newY = clamp(ds.sy + dy, 0, ds.sy + ds.sh - MIN_SIZE)
    h = ds.sh + (ds.sy - newY)
    y = newY
  }
  sel.value = { x, y, w, h }
}

function finishDrag() {
  dragMode.value = null
  emitCurrent()
}

// ── Touch support ─────────────────────────────────────────────────────────────
function onTouchStart(e: TouchEvent) {
  const t = e.touches[0]
  onMouseDown({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => {} } as any)
}
function onTouchMove(e: TouchEvent) {
  const t = e.touches[0]
  const { x, y } = getRelPos(t)
  if (dragMode.value) applyDrag(x, y)
}
function onTouchEnd() { finishDrag() }
</script>

<style scoped>
.roi-selector-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.roi-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.roi-info-text {
  font-size: 12px;
  color: #0070C0;
  font-weight: 500;
}
.roi-hint { color: #888; }

.roi-container {
  position: relative;
  display: inline-block;
  width: 100%;
  overflow: hidden;
  border-radius: 8px;
  border: 2px dashed #cbd5e1;
  background: #f8fafc;
  user-select: none;
}

.cursor-crosshair { cursor: crosshair; }
.cursor-default   { cursor: default; }

.roi-img {
  display: block;
  width: 100%;
  max-height: 480px;
  object-fit: contain;
  pointer-events: none;
  border-radius: 6px;
}

/* ── Selection overlay ── */
.roi-overlay {
  position: absolute;
  border: 2px solid #0070C0;
  background: rgba(0, 112, 192, 0.08);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.roi-move-area {
  position: absolute;
  inset: 10px;
  cursor: move;
  pointer-events: all;
}

/* ── Resize handles ── */
.roi-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #fff;
  border: 2px solid #0070C0;
  border-radius: 2px;
  pointer-events: all;
}
.roi-handle-n  { top:-5px;    left:50%;    transform:translateX(-50%); cursor: n-resize;  }
.roi-handle-s  { bottom:-5px; left:50%;    transform:translateX(-50%); cursor: s-resize;  }
.roi-handle-w  { left:-5px;   top:50%;     transform:translateY(-50%); cursor: w-resize;  }
.roi-handle-e  { right:-5px;  top:50%;     transform:translateY(-50%); cursor: e-resize;  }
.roi-handle-nw { top:-5px;    left:-5px;   cursor: nw-resize; }
.roi-handle-ne { top:-5px;    right:-5px;  cursor: ne-resize; }
.roi-handle-sw { bottom:-5px; left:-5px;   cursor: sw-resize; }
.roi-handle-se { bottom:-5px; right:-5px;  cursor: se-resize; }

/* ── Dimension badge ── */
.roi-dim-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 112, 192, 0.85);
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  pointer-events: none;
  white-space: nowrap;
}

/* ── Grid overlay ── */
.roi-grid-overlay {
  position: absolute;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}
.roi-grid-row {
  display: flex;
  flex: 1;
}
.roi-grid-cell {
  flex: 1;
  border: 1px dashed rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}
.roi-grid-label {
  font-size: 11px;
  color: rgba(255,255,255,0.85);
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
}
</style>
