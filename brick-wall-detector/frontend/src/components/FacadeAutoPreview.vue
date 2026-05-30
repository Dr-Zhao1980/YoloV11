<template>
  <div class="fap-wrap">
    <!-- Header -->
    <div class="fap-header">
      <span class="fap-title">智能切片预览</span>
      <span v-if="estimatedTileCount > 0" class="fap-badge">
        约 <b>{{ estimatedTileCount }}</b> 块切片
      </span>
      <span v-if="tileSizeNative > 0" class="fap-hint">
        每块 ≈ {{ tileSizeNative }}×{{ tileSizeNative }} px
        （真实 {{ Math.round(zoneSizeMm + 2 * overlapMm) }}mm 方形）
      </span>
      <div style="flex:1" />
      <el-button size="small" @click="resetFrame" :icon="FullScreen" plain>全图</el-button>
    </div>

    <!-- Interactive canvas -->
    <div class="fap-container" ref="containerRef" :style="containerStyle">
      <img
        ref="imgRef"
        :src="imageUrl"
        class="fap-img"
        draggable="false"
        @load="onLoad"
      />

      <!-- Dark overlays outside frame -->
      <div class="fap-mask fap-mask-top"    :style="{ height: p(frame.top) }" />
      <div class="fap-mask fap-mask-bottom" :style="{ top: p(frame.bottom) }" />
      <div class="fap-mask fap-mask-left"
        :style="{ top: p(frame.top), bottom: p(1 - frame.bottom), width: p(frame.left) }" />
      <div class="fap-mask fap-mask-right"
        :style="{ top: p(frame.top), bottom: p(1 - frame.bottom), left: p(frame.right) }" />

      <!-- Tile grid overlay (within frame, display space) -->
      <template v-if="dispW > 0 && scaleDisplay > 0 && tileSizeDisplay > 0">
        <div
          v-for="(t, i) in visibleTiles"
          :key="i"
          class="fap-tile"
          :style="t.style"
        >
          <span class="fap-tile-idx">{{ t.idx }}</span>
        </div>
        <!-- "+N more" badge -->
        <div v-if="hiddenCount > 0" class="fap-more">
          +{{ hiddenCount }} 块未显示
        </div>
      </template>

      <!-- No-scale hint -->
      <div v-else-if="dispW > 0 && (!wallWidthM || !zoneSizeMm)" class="fap-hint-overlay">
        请填写墙面宽度和区域边长 C 以预览切片网格
      </div>

      <!-- Frame border -->
      <div class="fap-frame" :style="frameStyle" />

      <!-- 8 resize handles -->
      <div v-for="h in HANDLES" :key="h.id"
        class="fap-handle"
        :style="handleStyle(h)"
        @mousedown.prevent.stop="startDrag('frame', 0, $event, h.id)"
      />
    </div>

    <!-- Footer -->
    <div class="fap-footer">
      <el-icon color="#52c41a"><InfoFilled /></el-icon>
      <span>
        拖动<b>外边框控制点</b>限定分析区域；
        <template v-if="scaleNative > 0">
          比例尺 <b>{{ scaleNative.toFixed(3) }}</b> px/mm；
          切片步长 <b>{{ stepSizeNative }}</b> px；
          重叠 <b>{{ Math.round(overlapMm) }}</b> mm 每侧
        </template>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { InfoFilled, FullScreen } from '@element-plus/icons-vue'

const props = defineProps<{
  imageFile?: File | null
  previewImageUrl?: string
  wallWidthM: number
  wallHeightM?: number
  zoneSizeMm: number
  overlapMm: number
  scalePxPerMm?: number
}>()

const emit = defineEmits<{
  'update:frame': [f: { left: number; top: number; right: number; bottom: number }]
  'update:imageSize': [w: number, h: number]
}>()

// ── Helpers ────────────────────────────────────────────────────
const p = (v: number) => `${v * 100}%`
const MAX_DISPLAY_TILES = 120

// ── Image ──────────────────────────────────────────────────────
const containerRef = ref<HTMLDivElement | null>(null)
const imgRef       = ref<HTMLImageElement | null>(null)
const imageUrl     = ref('')
const imgNW = ref(0)  // native width
const imgNH = ref(0)  // native height
const dispW = ref(0)  // display width
const dispH = ref(0)  // display height
const selfCreatedUrl = ref('')

watch(() => [props.imageFile, props.previewImageUrl], ([f, url]) => {
  if (selfCreatedUrl.value) {
    URL.revokeObjectURL(selfCreatedUrl.value)
    selfCreatedUrl.value = ''
  }
  imageUrl.value = ''
  if (typeof url === 'string' && url) {
    imageUrl.value = url
  } else if (f instanceof File) {
    imageUrl.value = URL.createObjectURL(f)
    selfCreatedUrl.value = imageUrl.value
  }
  imgNW.value = 0; imgNH.value = 0
  dispW.value = 0; dispH.value = 0
}, { immediate: true })

function onLoad() {
  const img = imgRef.value!
  imgNW.value = img.naturalWidth
  imgNH.value = img.naturalHeight
  dispW.value = img.clientWidth
  dispH.value = img.clientHeight
  emit('update:imageSize', imgNW.value, imgNH.value)
  resetFrame()
}

onBeforeUnmount(() => {
  if (selfCreatedUrl.value) {
    URL.revokeObjectURL(selfCreatedUrl.value)
    selfCreatedUrl.value = ''
  }
  window.removeEventListener('mousemove', onGlobalMove)
  window.removeEventListener('mouseup', onGlobalUp)
})

// ── Scale computations ─────────────────────────────────────────
// scale in NATIVE pixel space
const scaleNative = computed<number>(() => {
  if (props.scalePxPerMm && props.scalePxPerMm > 0) return props.scalePxPerMm
  if (!imgNW.value || !props.wallWidthM || props.wallWidthM <= 0) return 0
  return imgNW.value / (props.wallWidthM * 1000)
})

// scale in DISPLAY pixel space
const scaleDisplay = computed<number>(() => {
  // Priority: external scale > calculate from wall dimensions
  if (props.scalePxPerMm && props.scalePxPerMm > 0) {
    // scalePxPerMm is px/mm, need to account for display scaling
    return props.scalePxPerMm * (dispW.value / imgNW.value || 1)
  }
  if (!dispW.value || !props.wallWidthM || props.wallWidthM <= 0) return 0
  return dispW.value / (props.wallWidthM * 1000)
})

// Tile dimensions
const tileSizeDisplay = computed<number>(() => {
  const s = scaleDisplay.value
  if (!s || !props.zoneSizeMm) return 0
  return (props.zoneSizeMm + 2 * props.overlapMm) * s
})

const stepDisplay = computed<number>(() => {
  const s = scaleDisplay.value
  if (!s || !props.zoneSizeMm) return 0
  return props.zoneSizeMm * s
})

const tileSizeNative = computed<number>(() => {
  const s = scaleNative.value
  if (!s || !props.zoneSizeMm) return 0
  return Math.round((props.zoneSizeMm + 2 * props.overlapMm) * s)
})

const stepSizeNative = computed<number>(() => {
  const s = scaleNative.value
  if (!s || !props.zoneSizeMm) return 0
  return Math.round(props.zoneSizeMm * s)
})

// ── Frame (fraction of full image) ────────────────────────────
interface Frame { left: number; top: number; right: number; bottom: number }
const frame = ref<Frame>({ left: 0, top: 0, right: 1, bottom: 1 })
const MIN_FRAME = 0.05

function resetFrame() {
  frame.value = { left: 0, top: 0, right: 1, bottom: 1 }
  emit('update:frame', { ...frame.value })
}

const frameStyle = computed(() => ({
  left:   p(frame.value.left),
  top:    p(frame.value.top),
  width:  p(frame.value.right  - frame.value.left),
  height: p(frame.value.bottom - frame.value.top)
}))

// ── Tile grid (display pixel coordinates) ─────────────────────
const estimatedTileCount = computed<number>(() => {
  const step = stepDisplay.value
  const tSize = tileSizeDisplay.value
  if (!step || !tSize || !dispW.value || !dispH.value) return 0
  const f = frame.value
  const x0 = f.left * dispW.value
  const y0 = f.top * dispH.value
  const x1 = f.right * dispW.value
  const y1 = f.bottom * dispH.value
  let count = 0
  for (let ty = y0; ty < y1; ty += step) {
    for (let tx = x0; tx < x1; tx += step) {
      const w = Math.min(tSize, x1 - tx)
      const h = Math.min(tSize, y1 - ty)
      if (w >= step * 0.3 && h >= step * 0.3) {
        count++
      }
    }
  }
  return count
})

const visibleTiles = computed<{ style: Record<string,string>; idx: number }[]>(() => {
  const step = stepDisplay.value
  const tSize = tileSizeDisplay.value
  if (!step || !tSize || !dispW.value || !dispH.value) return []

  const f = frame.value
  const x0 = f.left  * dispW.value
  const y0 = f.top   * dispH.value
  const x1 = f.right * dispW.value
  const y1 = f.bottom * dispH.value

  const tiles: { style: Record<string,string>; idx: number }[] = []
  let idx = 1
  for (let ty = y0; ty < y1; ty += step) {
    for (let tx = x0; tx < x1; tx += step) {
      if (tiles.length >= MAX_DISPLAY_TILES) {
        return tiles
      }
      // Clip to frame
      const w = Math.min(tSize, x1 - tx)
      const h = Math.min(tSize, y1 - ty)
      if (w < step * 0.3 || h < step * 0.3) { idx++; continue }

      tiles.push({
        idx: idx++,
        style: {
          left:   `${tx}px`,
          top:    `${ty}px`,
          width:  `${Math.min(tSize, x1 - tx + (tSize - step))}px`,
          height: `${Math.min(tSize, y1 - ty + (tSize - step))}px`,
          maxWidth: `${x1 - tx}px`,
          maxHeight: `${y1 - ty}px`,
        }
      })
    }
  }
  return tiles
})

const hiddenCount = computed(() => Math.max(0, estimatedTileCount.value - visibleTiles.value.length))

// ── Frame handles ──────────────────────────────────────────────
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
  const xFrac = h.cx === 'left' ? f.left : h.cx === 'right' ? f.right : (f.left + f.right) / 2
  const yFrac = h.cy === 'top'  ? f.top  : h.cy === 'bottom' ? f.bottom : (f.top + f.bottom) / 2
  return {
    left:   `calc(${p(xFrac)} - 6px)`,
    top:    `calc(${p(yFrac)} - 6px)`,
    cursor: h.cursor
  }
}

// ── Drag state ─────────────────────────────────────────────────
interface DragState { type: 'frame'; handle: string }
const dragState = ref<DragState | null>(null)

const cursorStyle = computed(() => {
  if (!dragState.value) return {}
  const h = HANDLES.find(x => x.id === dragState.value!.handle)
  return h ? { cursor: h.cursor } : {}
})

const containerStyle = computed(() => {
  const base = { ...cursorStyle.value } as Record<string, string>
  if (imgNW.value && imgNH.value)
    base.aspectRatio = `${imgNW.value} / ${imgNH.value}`
  return base
})

function startDrag(_type: string, _idx: number, _e: MouseEvent, handle = '') {
  dragState.value = { type: 'frame', handle }
}

function onGlobalMove(e: MouseEvent) {
  if (!dragState.value || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const fx = Math.max(0, Math.min(1, (e.clientX - rect.left)  / rect.width))
  const fy = Math.max(0, Math.min(1, (e.clientY - rect.top)   / rect.height))
  const hDesc = HANDLES.find(x => x.id === dragState.value!.handle)
  if (!hDesc) return
  const f = { ...frame.value }
  if (hDesc.movesL) f.left   = Math.max(0, Math.min(f.right  - MIN_FRAME, fx))
  if (hDesc.movesR) f.right  = Math.min(1, Math.max(f.left   + MIN_FRAME, fx))
  if (hDesc.movesT) f.top    = Math.max(0, Math.min(f.bottom - MIN_FRAME, fy))
  if (hDesc.movesB) f.bottom = Math.min(1, Math.max(f.top    + MIN_FRAME, fy))
  frame.value = f
}

function onGlobalUp() {
  if (dragState.value) {
    emit('update:frame', { ...frame.value })
    dragState.value = null
  }
}

onMounted(() => {
  window.addEventListener('mousemove', onGlobalMove)
  window.addEventListener('mouseup',   onGlobalUp)
})
</script>

<style scoped>
.fap-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
  user-select: none;
}

/* ── Header ── */
.fap-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.fap-title { font-size: 14px; font-weight: 600; color: #303133; }
.fap-badge {
  font-size: 12px; color: #fff; background: #52c41a;
  padding: 2px 10px; border-radius: 10px;
}
.fap-hint { font-size: 11px; color: #888; }

/* ── Container ── */
.fap-container {
  position: relative;
  width: 100%;
  max-height: 560px;
  background: #111;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid #dcdfe6;
}

.fap-img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 560px;
  object-fit: contain;
}

/* ── Masks ── */
.fap-mask {
  position: absolute;
  left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.52);
  pointer-events: none;
  z-index: 3;
}
.fap-mask-top    { bottom: auto; }
.fap-mask-bottom { top: auto; }
.fap-mask-left   { top: auto; bottom: auto; right: auto; }
.fap-mask-right  { top: auto; bottom: auto; left: auto; }

/* ── Tile grid ── */
.fap-tile {
  position: absolute;
  box-sizing: border-box;
  border: 1.5px dashed rgba(82, 196, 26, 0.70);
  background: rgba(82, 196, 26, 0.05);
  z-index: 5;
  pointer-events: none;
  overflow: hidden;
}
.fap-tile-idx {
  position: absolute;
  top: 3px; left: 5px;
  font-size: 10px; font-weight: 700;
  color: rgba(255,255,255,0.9);
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
}

.fap-more {
  position: absolute;
  bottom: 12px;
  right: 12px;
  background: rgba(82, 196, 26, 0.85);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
  z-index: 10;
  pointer-events: none;
}

.fap-hint-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: rgba(255,255,255,0.7);
  z-index: 5;
  pointer-events: none;
}

/* ── Frame border ── */
.fap-frame {
  position: absolute;
  box-sizing: border-box;
  border: 2.5px solid #52c41a;
  box-shadow: 0 0 0 1px rgba(82,196,26,0.3), inset 0 0 0 1px rgba(82,196,26,0.2);
  pointer-events: none;
  z-index: 9;
  border-radius: 2px;
}

/* ── Handles ── */
.fap-handle {
  position: absolute;
  width: 12px; height: 12px;
  background: #fff;
  border: 2px solid #52c41a;
  border-radius: 3px;
  z-index: 12;
  transition: transform 0.1s, background 0.1s;
}
.fap-handle:hover {
  background: #95de64;
  transform: scale(1.3);
}

/* ── Footer ── */
.fap-footer {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
}
</style>
