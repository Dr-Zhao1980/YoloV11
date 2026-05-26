<template>
  <div class="fgp-wrap">
    <!-- ── Toolbar ── -->
    <div class="fgp-header">
      <span class="fgp-title">切片区域设置</span>
      <span class="fgp-badge">
        {{ gridMode }}×{{ gridMode }} = <b>{{ gridMode * gridMode }}</b> 块
      </span>
      <span class="fgp-size-hint" v-if="!isFullFrame">
        选区 {{ Math.round((frame.right-frame.left)*100) }}% × {{ Math.round((frame.bottom-frame.top)*100) }}%
      </span>
      <div style="flex:1" />
      <el-button size="small" @click="resetFrame" :icon="FullScreen" plain>全图</el-button>
      <el-button size="small" @click="resetUniform" :icon="RefreshRight" plain>均匀</el-button>
    </div>

    <!-- ── Interactive canvas ── -->
    <div class="fgp-container" ref="containerRef" :style="cursorStyle">
      <!-- Base image -->
      <img ref="imgRef" :src="imageUrl" class="fgp-img" draggable="false" @load="onLoad" />

      <!-- ── Dark overlay: 4 panels outside the frame ── -->
      <div class="fgp-mask fgp-mask-top"
        :style="{ height: p(frame.top) }" />
      <div class="fgp-mask fgp-mask-bottom"
        :style="{ top: p(frame.bottom) }" />
      <div class="fgp-mask fgp-mask-left"
        :style="{ top: p(frame.top), bottom: p(1-frame.bottom), width: p(frame.left) }" />
      <div class="fgp-mask fgp-mask-right"
        :style="{ top: p(frame.top), bottom: p(1-frame.bottom), left: p(frame.right) }" />

      <!-- ── Cell backgrounds ── -->
      <div
        v-for="(cell, idx) in cells" :key="`cell-${idx}`"
        class="fgp-cell"
        :style="cell.style"
        @mouseenter="hoveredCell = idx"
        @mouseleave="hoveredCell = -1"
      >
        <span class="fgp-cell-num">{{ idx + 1 }}</span>
        <span v-if="hoveredCell === idx" class="fgp-cell-size">
          {{ cell.wPct }}%×{{ cell.hPct }}%
        </span>
      </div>

      <!-- ── Inner vertical dividers (within frame) ── -->
      <div
        v-for="(frac, i) in vDivs" :key="`vd-${i}`"
        class="fgp-divider fgp-divider-v"
        :class="{ 'is-active': isDragging('v', i) }"
        :style="vDivStyle(frac)"
        @mousedown.prevent.stop="startDrag('v', i, $event)"
      ><span class="fgp-div-icon">⋮</span></div>

      <!-- ── Inner horizontal dividers (within frame) ── -->
      <div
        v-for="(frac, i) in hDivs" :key="`hd-${i}`"
        class="fgp-divider fgp-divider-h"
        :class="{ 'is-active': isDragging('h', i) }"
        :style="hDivStyle(frac)"
        @mousedown.prevent.stop="startDrag('h', i, $event)"
      ><span class="fgp-div-icon">⋯</span></div>

      <!-- ── Outer frame border ── -->
      <div class="fgp-frame" :style="frameStyle" />

      <!-- ── 8 resize handles on the frame ── -->
      <div v-for="h in HANDLES" :key="h.id"
        class="fgp-handle"
        :class="`fgp-handle-${h.id}`"
        :style="handleStyle(h)"
        @mousedown.prevent.stop="startDrag('frame', 0, $event, h.id)"
      />
    </div>

    <!-- ── Footer ── -->
    <div class="fgp-footer">
      <el-icon color="#0070C0"><InfoFilled /></el-icon>
      <span>
        拖动<b>外边框控制点</b>调整分析区域；拖动<b>内部分割线</b>调整切片大小；
        AI 诊断共 <b>{{ gridMode * gridMode }}</b> 次推理后拼合呈现
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { InfoFilled, RefreshRight, FullScreen } from '@element-plus/icons-vue'

const props = defineProps<{
  imageFile: File
  gridMode: number
}>()

const emit = defineEmits<{
  'update:vDividers': [fracs: number[]]
  'update:hDividers': [fracs: number[]]
  'update:frame':     [f: { left: number; top: number; right: number; bottom: number }]
}>()

// ── Helpers ──────────────────────────────────────────────────
const p = (v: number) => `${v * 100}%`

// ── Image ────────────────────────────────────────────────────
const imgRef       = ref<HTMLImageElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const imageUrl     = ref('')

function makeUrl(f: File) {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = URL.createObjectURL(f)
}
onMounted(() => makeUrl(props.imageFile))
onBeforeUnmount(() => { if (imageUrl.value) URL.revokeObjectURL(imageUrl.value) })
watch(() => props.imageFile, makeUrl)
function onLoad() {}

// ── Frame (outer crop boundary) ───────────────────────────────
interface Frame { left: number; top: number; right: number; bottom: number }
const frame = ref<Frame>({ left: 0, top: 0, right: 1, bottom: 1 })
const MIN_FRAME = 0.10

const isFullFrame = computed(() =>
  frame.value.left < 0.005 && frame.value.top < 0.005 &&
  frame.value.right > 0.995 && frame.value.bottom > 0.995
)

function resetFrame() {
  frame.value = { left: 0, top: 0, right: 1, bottom: 1 }
  emitAll()
}

const frameStyle = computed(() => ({
  left:   p(frame.value.left),
  top:    p(frame.value.top),
  width:  p(frame.value.right  - frame.value.left),
  height: p(frame.value.bottom - frame.value.top)
}))

// ── 8 resize handle descriptors ──────────────────────────────
// cx/cy: handle center as fraction of full image (computed live)
// movesL/R/T/B: which frame edges this handle moves
const HANDLES = [
  { id: 'tl', cx: 'left',  cy: 'top',    cursor: 'nwse-resize', movesL: true,  movesR: false, movesT: true,  movesB: false },
  { id: 't',  cx: 'mid-x', cy: 'top',    cursor: 'ns-resize',   movesL: false, movesR: false, movesT: true,  movesB: false },
  { id: 'tr', cx: 'right', cy: 'top',    cursor: 'nesw-resize', movesL: false, movesR: true,  movesT: true,  movesB: false },
  { id: 'r',  cx: 'right', cy: 'mid-y',  cursor: 'ew-resize',   movesL: false, movesR: true,  movesT: false, movesB: false },
  { id: 'br', cx: 'right', cy: 'bottom', cursor: 'nwse-resize', movesL: false, movesR: true,  movesT: false, movesB: true  },
  { id: 'b',  cx: 'mid-x', cy: 'bottom', cursor: 'ns-resize',   movesL: false, movesR: false, movesT: false, movesB: true  },
  { id: 'bl', cx: 'left',  cy: 'bottom', cursor: 'nesw-resize', movesL: true,  movesR: false, movesT: false, movesB: true  },
  { id: 'l',  cx: 'left',  cy: 'mid-y',  cursor: 'ew-resize',   movesL: true,  movesR: false, movesT: false, movesB: false },
] as const

function handleStyle(h: typeof HANDLES[number]) {
  const f = frame.value
  const xFrac = h.cx === 'left'  ? f.left
              : h.cx === 'right' ? f.right
              : (f.left + f.right) / 2
  const yFrac = h.cy === 'top'    ? f.top
              : h.cy === 'bottom' ? f.bottom
              : (f.top + f.bottom) / 2
  return {
    left:   `calc(${p(xFrac)} - 6px)`,
    top:    `calc(${p(yFrac)} - 6px)`,
    cursor: h.cursor
  }
}

// ── Dividers (fractions of frame interior 0..1) ───────────────
const vDivs = ref<number[]>([])
const hDivs = ref<number[]>([])
const MIN_CELL_FRAC = 0.04

function uniformDivs(N: number) {
  return Array.from({ length: N - 1 }, (_, i) => (i + 1) / N)
}

function resetUniform() {
  vDivs.value = uniformDivs(props.gridMode)
  hDivs.value = uniformDivs(props.gridMode)
  emitAll()
}

watch(() => props.gridMode, () => resetUniform(), { immediate: true })

function emitAll() {
  emit('update:vDividers', [...vDivs.value])
  emit('update:hDividers', [...hDivs.value])
  emit('update:frame',     { ...frame.value })
}

// ── Divider CSS positioning (relative to frame) ──────────────
function vDivStyle(frac: number) {
  const f = frame.value
  const absX = f.left + frac * (f.right - f.left)
  return {
    left:   `calc(${p(absX)} - 2px)`,
    top:    p(f.top),
    bottom: p(1 - f.bottom),
    height: 'auto'
  }
}
function hDivStyle(frac: number) {
  const f = frame.value
  const absY = f.top + frac * (f.bottom - f.top)
  return {
    top:   `calc(${p(absY)} - 2px)`,
    left:  p(f.left),
    right: p(1 - f.right),
    width: 'auto'
  }
}

// ── Cells ─────────────────────────────────────────────────────
const hoveredCell = ref(-1)
const cells = computed(() => {
  const N = props.gridMode
  const f = frame.value
  const fw = f.right - f.left
  const fh = f.bottom - f.top
  const cols = [0, ...vDivs.value, 1]
  const rows = [0, ...hDivs.value, 1]
  const result = []
  let idx = 0
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const l  = f.left + cols[c]     * fw
      const r2 = f.left + cols[c + 1] * fw
      const t  = f.top  + rows[r]     * fh
      const b  = f.top  + rows[r + 1] * fh
      result.push({
        style: { left: p(l), top: p(t), width: p(r2 - l), height: p(b - t) },
        wPct: Math.round((cols[c+1] - cols[c]) * 100),
        hPct: Math.round((rows[r+1] - rows[r]) * 100),
        idx: ++idx
      })
    }
  }
  return result
})

// ── Drag state ────────────────────────────────────────────────
type DragType = 'v' | 'h' | 'frame'
interface DragState {
  type: DragType
  index: number
  handle: string
}
const dragState = ref<DragState | null>(null)

const cursorStyle = computed(() => {
  const ds = dragState.value
  if (!ds) return {}
  if (ds.type === 'v') return { cursor: 'col-resize' }
  if (ds.type === 'h') return { cursor: 'row-resize' }
  const h = HANDLES.find(x => x.id === ds.handle)
  return h ? { cursor: h.cursor } : {}
})

function isDragging(type: DragType, index: number) {
  return dragState.value?.type === type && dragState.value.index === index
}

function startDrag(type: DragType, index: number, e: MouseEvent, handle = '') {
  dragState.value = { type, index, handle }
}

function onGlobalMouseMove(e: MouseEvent) {
  if (!dragState.value || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const fy = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height))
  const { type, index, handle } = dragState.value

  if (type === 'v') {
    const list = [...vDivs.value]
    const f = frame.value
    // Convert absolute frac → relative to frame
    const relFrac = (fx - f.left) / (f.right - f.left)
    const lo = index === 0             ? MIN_CELL_FRAC               : list[index - 1] + MIN_CELL_FRAC
    const hi = index === list.length-1 ? 1 - MIN_CELL_FRAC           : list[index + 1] - MIN_CELL_FRAC
    list[index] = Math.max(lo, Math.min(hi, relFrac))
    vDivs.value = list
  } else if (type === 'h') {
    const list = [...hDivs.value]
    const f = frame.value
    const relFrac = (fy - f.top) / (f.bottom - f.top)
    const lo = index === 0             ? MIN_CELL_FRAC               : list[index - 1] + MIN_CELL_FRAC
    const hi = index === list.length-1 ? 1 - MIN_CELL_FRAC           : list[index + 1] - MIN_CELL_FRAC
    list[index] = Math.max(lo, Math.min(hi, relFrac))
    hDivs.value = list
  } else {
    // Frame resize
    const hDesc = HANDLES.find(x => x.id === handle)
    if (!hDesc) return
    const f = { ...frame.value }
    if (hDesc.movesL) f.left   = Math.max(0,                         Math.min(f.right  - MIN_FRAME, fx))
    if (hDesc.movesR) f.right  = Math.min(1,                         Math.max(f.left   + MIN_FRAME, fx))
    if (hDesc.movesT) f.top    = Math.max(0,                         Math.min(f.bottom - MIN_FRAME, fy))
    if (hDesc.movesB) f.bottom = Math.min(1,                         Math.max(f.top    + MIN_FRAME, fy))
    frame.value = f
  }
}

function onGlobalMouseUp() {
  if (dragState.value) {
    emitAll()
    dragState.value = null
  }
}

onMounted(() => {
  window.addEventListener('mousemove', onGlobalMouseMove)
  window.addEventListener('mouseup',   onGlobalMouseUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onGlobalMouseMove)
  window.removeEventListener('mouseup',   onGlobalMouseUp)
})
</script>

<style scoped>
.fgp-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
  user-select: none;
}

/* ── Header ── */
.fgp-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fgp-title  { font-size: 14px; font-weight: 600; color: #303133; }
.fgp-badge  {
  font-size: 12px; color: #fff; background: #0070C0;
  padding: 2px 10px; border-radius: 10px;
}
.fgp-size-hint {
  font-size: 11px; color: #e6a23c;
  background: #fdf6ec; border: 1px solid #f5dab1;
  padding: 1px 7px; border-radius: 8px;
}

/* ── Container ── */
.fgp-container {
  position: relative;
  width: 100%;
  background: #111;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid #dcdfe6;
}

/* Image: full width, natural aspect ratio */
.fgp-img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 560px;
  object-fit: cover;
}

/* ── Mask overlays ── */
.fgp-mask {
  position: absolute;
  left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.52);
  pointer-events: none;
  z-index: 3;
}
.fgp-mask-top    { bottom: auto; }
.fgp-mask-bottom { top:    auto; }
.fgp-mask-left   { top: auto; bottom: auto; right: auto; }
.fgp-mask-right  { top: auto; bottom: auto; left: auto; }

/* ── Cells ── */
.fgp-cell {
  position: absolute;
  box-sizing: border-box;
  border: 1.5px solid rgba(255,255,255,0.25);
  z-index: 4;
  overflow: hidden;
  transition: background 0.1s;
}
.fgp-cell:hover { background: rgba(255,255,255,0.10); }
.fgp-cell-num {
  position: absolute; top: 4px; left: 6px;
  font-size: 12px; font-weight: 700;
  color: rgba(255,255,255,0.95);
  text-shadow: 0 1px 4px rgba(0,0,0,0.8);
  pointer-events: none;
}
.fgp-cell-size {
  position: absolute; bottom: 4px; right: 5px;
  font-size: 10px; background: rgba(0,0,0,0.55); color: #fff;
  padding: 1px 4px; border-radius: 3px;
  pointer-events: none;
}

/* ── Inner dividers ── */
.fgp-divider { position: absolute; z-index: 8; }

.fgp-divider-v {
  width: 4px;
  background: rgba(255,255,255,0.65);
  cursor: col-resize;
  transition: background 0.1s, box-shadow 0.1s;
  display: flex; align-items: center; justify-content: center;
}
.fgp-divider-v::before {
  content: ''; position: absolute; left: -7px; right: -7px; top: 0; bottom: 0;
}
.fgp-divider-v:hover, .fgp-divider-v.is-active {
  background: #ffdd57;
  box-shadow: 0 0 6px rgba(255,221,87,0.6);
}

.fgp-divider-h {
  height: 4px;
  background: rgba(255,255,255,0.65);
  cursor: row-resize;
  transition: background 0.1s, box-shadow 0.1s;
  display: flex; align-items: center; justify-content: center;
}
.fgp-divider-h::before {
  content: ''; position: absolute; top: -7px; bottom: -7px; left: 0; right: 0;
}
.fgp-divider-h:hover, .fgp-divider-h.is-active {
  background: #ffdd57;
  box-shadow: 0 0 6px rgba(255,221,87,0.6);
}

.fgp-div-icon {
  font-size: 11px; color: rgba(255,255,255,0.9);
  background: rgba(0,0,0,0.5); border-radius: 2px; padding: 0 2px;
  pointer-events: none;
}

/* ── Outer frame border ── */
.fgp-frame {
  position: absolute;
  box-sizing: border-box;
  border: 2.5px solid #4fc3f7;
  box-shadow: 0 0 0 1px rgba(79,195,247,0.35), inset 0 0 0 1px rgba(79,195,247,0.2);
  pointer-events: none;
  z-index: 9;
  border-radius: 2px;
}

/* ── Resize handles ── */
.fgp-handle {
  position: absolute;
  width: 12px; height: 12px;
  background: #fff;
  border: 2px solid #0070C0;
  border-radius: 3px;
  z-index: 12;
  transition: transform 0.1s, background 0.1s;
}
.fgp-handle:hover {
  background: #4fc3f7;
  transform: scale(1.3);
}

/* ── Footer ── */
.fgp-footer {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 12px; color: #606266; line-height: 1.5;
}
</style>
