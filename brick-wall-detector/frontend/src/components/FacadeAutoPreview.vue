<template>
  <div class="fap-wrap">
    <!-- Header -->
    <div class="fap-header">
      <span class="fap-title">智能切片预览</span>
      <span v-if="estimatedTileCount > 0" class="fap-badge">
        约 <b>{{ estimatedTileCount }}</b> 块切片
      </span>
      <span v-if="tileMetrics.corePx > 0" class="fap-hint">
        核心 {{ tileMetrics.corePx }}×{{ tileMetrics.corePx }} px = {{ Math.round(zoneSizeMm) }}mm 方形
        <template v-if="overlapMm > 0"> · 推理裁切 {{ tileMetrics.extractPx }}px（含每侧 {{ Math.round(overlapMm) }}mm 重叠，预览按核心格显示）</template>
      </span>
      <div style="flex:1" />
      <el-button size="small" @click="fitContentFrame" :icon="Crop" plain>适配有效区域</el-button>
      <el-button size="small" @click="resetFrame" :icon="FullScreen" plain>整张原图</el-button>
    </div>

    <!-- Interactive canvas -->
    <div class="fap-container" ref="containerRef">
      <div ref="stageRef" class="fap-stage" :style="stageStyle">
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

      <!-- Tile grid overlay: 统一核心格（步长 C），与后端切片步长一致 -->
      <template v-if="stageW > 0 && scaleDisplay > 0 && tileMetrics.stepPxExact > 0 && !scaleInvalid">
        <div
          v-for="(t, i) in visibleTiles"
          :key="i"
          class="fap-tile"
          :class="{ 'fap-tile-edge': t.edge, 'fap-tile-animate': animateTiles }"
          :style="t.style"
        >
          <span class="fap-tile-idx">{{ t.idx }}</span>
        </div>
        <!-- "+N more" badge -->
        <div v-if="hiddenCount > 0" class="fap-more">
          +{{ hiddenCount }} 块未显示
        </div>
      </template>

      <!-- No-scale / abnormal step hint -->
      <div v-else-if="stageW > 0 && scaleInvalid" class="fap-hint-overlay">
        {{ scaleInvalidMessage }}
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
    </div>

    <!-- Footer -->
    <div class="fap-footer">
      <el-icon color="#52c41a"><InfoFilled /></el-icon>
      <span>
        加载后已自动贴合有效画面；拖动<b>外边框</b>可微调，切片网格铺满框内区域；
        <template v-if="scaleNative > 0">
          比例尺 <b>{{ scaleNative.toFixed(3) }}</b> px/mm；
          核心边长 <b>{{ tileMetrics.corePx }}</b> px（{{ Math.round(zoneSizeMm) }}mm）；
          步长 <b>{{ Math.round(tileMetrics.stepPxExact) }}</b> px；
          <template v-if="overlapMm > 0">重叠 <b>{{ Math.round(overlapMm) }}</b> mm 每侧</template>
        </template>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { InfoFilled, FullScreen, Crop } from '@element-plus/icons-vue'
import { computeTileMetrics, countTilesInRegion } from '../utils/facadeTileMetrics'
import { detectImageContentBounds, type ContentBounds } from '../utils/imageContentBounds'

const props = defineProps<{
  imageFile?: File | null
  previewImageUrl?: string
  wallWidthM: number
  wallHeightM?: number
  zoneSizeMm: number
  overlapMm: number
  scalePxPerMm?: number
  /** 微调时网格尺寸过渡动画 */
  animateTiles?: boolean
}>()

const emit = defineEmits<{
  'update:frame': [f: { left: number; top: number; right: number; bottom: number }]
  'update:imageSize': [w: number, h: number]
  'update:tileCount': [count: number]
}>()

// ── Helpers ────────────────────────────────────────────────────
const p = (v: number) => `${v * 100}%`
const MAX_DISPLAY_TILES = 120
/** 显示空间下过小的步长会导致密集错乱网格 */
const MIN_STEP_DISPLAY_PX = 48

// ── Image ──────────────────────────────────────────────────────
const containerRef = ref<HTMLDivElement | null>(null)
const stageRef     = ref<HTMLDivElement | null>(null)
const imgRef       = ref<HTMLImageElement | null>(null)
const imageUrl     = ref('')
const imgNW = ref(0)  // native width
const imgNH = ref(0)  // native height
const stageW = ref(0) // displayed image width (stage)
const stageH = ref(0) // displayed image height (stage)
const selfCreatedUrl = ref('')
let resizeObserver: ResizeObserver | null = null

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
  stageW.value = 0; stageH.value = 0
}, { immediate: true })

function syncStageSize() {
  const img = imgRef.value
  if (!img) return
  stageW.value = img.clientWidth
  stageH.value = img.clientHeight
}

function snapFrameToGrid(f: Frame): Frame {
  const step = tileMetrics.value.stepPxExact
  if (!step || !imgNW.value || !imgNH.value) return f

  const leftPx = f.left * imgNW.value
  const rightPx = f.right * imgNW.value
  const topPx = f.top * imgNH.value
  const bottomPx = f.bottom * imgNH.value
  const snappedLeft = Math.floor(leftPx / step) * step / imgNW.value
  const snappedRight = Math.min(1, Math.max(snappedLeft + MIN_FRAME, Math.ceil(rightPx / step) * step / imgNW.value))
  const snappedTop = Math.floor(topPx / step) * step / imgNH.value
  const snappedBottom = Math.min(1, Math.max(snappedTop + MIN_FRAME, Math.ceil(bottomPx / step) * step / imgNH.value))
  return {
    left: snappedLeft,
    top: snappedTop,
    right: snappedRight,
    bottom: snappedBottom,
  }
}

function applyFrame(f: ContentBounds, emitUpdate = true, snapGrid = false) {
  const next = snapGrid && tileMetrics.value.stepPxExact > 0
    ? snapFrameToGrid(f)
    : { ...f }
  frame.value = next
  if (emitUpdate) emit('update:frame', { ...frame.value })
}

async function fitContentFrame() {
  const img = imgRef.value
  if (!img?.naturalWidth) return
  const bounds = await detectImageContentBounds(img)
  applyFrame(bounds, true, true)
}

function onLoad() {
  const img = imgRef.value!
  imgNW.value = img.naturalWidth
  imgNH.value = img.naturalHeight
  syncStageSize()
  emit('update:imageSize', imgNW.value, imgNH.value)
  if (resizeObserver) resizeObserver.disconnect()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => syncStageSize())
    resizeObserver.observe(img)
  }
  void fitContentFrame()
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (selfCreatedUrl.value) {
    URL.revokeObjectURL(selfCreatedUrl.value)
    selfCreatedUrl.value = ''
  }
  window.removeEventListener('mousemove', onGlobalMove)
  window.removeEventListener('mouseup', onGlobalUp)
})

// ── Scale computations ─────────────────────────────────────────
// 仅使用已确认的比例尺（px/mm），不再用墙面宽度反推，避免与标定结果冲突
const scaleNative = computed<number>(() => {
  if (props.scalePxPerMm && props.scalePxPerMm > 0) return props.scalePxPerMm
  return 0
})

const scaleDisplay = computed<number>(() => {
  if (!scaleNative.value || !imgNW.value || !stageW.value) return 0
  return scaleNative.value * (stageW.value / imgNW.value)
})

const scaleInvalid = computed(() => {
  if (!props.zoneSizeMm || props.zoneSizeMm <= 0) return true
  if (!scaleNative.value) return true
  const step = stepDisplay.value
  return step > 0 && step < MIN_STEP_DISPLAY_PX
})

const scaleInvalidMessage = computed(() => {
  if (!props.zoneSizeMm || props.zoneSizeMm <= 0) return '请设置区域边长 C 以预览切片网格'
  if (!scaleNative.value) return '请先完成砖块画线标定并确认比例尺'
  return '比例尺异常（切片步长过小），请重新画线标定或微调比例尺'
})

// Tile dimensions（严格 mm↔px：核心 C×scale，裁切 (C+2D)×scale，步长 C×scale）
const tileMetrics = computed(() => {
  const s = scaleNative.value
  if (!s || !props.zoneSizeMm) {
    return computeTileMetrics(0, props.zoneSizeMm || 0, props.overlapMm || 0)
  }
  return computeTileMetrics(s, props.zoneSizeMm, props.overlapMm || 0)
})

const scaleToDisplay = computed(() => (imgNW.value > 0 && stageW.value > 0 ? stageW.value / imgNW.value : 1))

const stepDisplay = computed(() => tileMetrics.value.stepPxExact * scaleToDisplay.value)

const stageStyle = computed(() => {
  if (!imgNW.value || !imgNH.value) return {}
  return { aspectRatio: `${imgNW.value} / ${imgNH.value}` }
})

// ── Frame (fraction of full image) ────────────────────────────
interface Frame { left: number; top: number; right: number; bottom: number }
const frame = ref<Frame>({ left: 0, top: 0, right: 1, bottom: 1 })
const MIN_FRAME = 0.05

function resetFrame() {
  applyFrame({ left: 0, top: 0, right: 1, bottom: 1 })
}

const frameStyle = computed(() => ({
  left:   p(frame.value.left),
  top:    p(frame.value.top),
  width:  p(frame.value.right  - frame.value.left),
  height: p(frame.value.bottom - frame.value.top)
}))

// ── Tile grid (display pixel coordinates) ─────────────────────
const estimatedTileCount = computed<number>(() => {
  const metrics = tileMetrics.value
  if (!metrics.stepPxExact || !metrics.extractPxExact || !stageW.value || !stageH.value) return 0
  const f = frame.value
  const roiW = (f.right - f.left) * imgNW.value
  const roiH = (f.bottom - f.top) * imgNH.value
  return countTilesInRegion(roiW, roiH, metrics)
})

const visibleTiles = computed<{ style: Record<string,string>; idx: number; edge: boolean }[]>(() => {
  const step = stepDisplay.value
  if (!step || !stageW.value || !stageH.value) return []

  const f = frame.value
  const x0 = f.left  * stageW.value
  const y0 = f.top   * stageH.value
  const x1 = f.right * stageW.value
  const y1 = f.bottom * stageH.value

  const roiW = x1 - x0
  const roiH = y1 - y0
  if (roiW < 8 || roiH < 8) return []

  const tiles: { style: Record<string,string>; idx: number; edge: boolean }[] = []
  let idx = 1
  let ty = y0
  while (ty < y1 - 0.5) {
    const remainY = y1 - ty
    let tx = x0
    while (tx < x1 - 0.5) {
      if (tiles.length >= MAX_DISPLAY_TILES) return tiles
      const remainX = x1 - tx
      const w = Math.min(step, remainX)
      const h = Math.min(step, remainY)
      if (w >= 4 && h >= 4) {
        const edge = remainX <= step * 1.05 || remainY <= step * 1.05
        tiles.push({
          idx: idx++,
          edge,
          style: {
            left: `${tx}px`,
            top: `${ty}px`,
            width: `${w}px`,
            height: `${h}px`,
          },
        })
      } else {
        idx++
      }
      tx += remainX <= step * 1.05 ? remainX : step
    }
    ty += remainY <= step * 1.05 ? remainY : step
  }
  return tiles
})

const hiddenCount = computed(() => Math.max(0, estimatedTileCount.value - visibleTiles.value.length))

watch(estimatedTileCount, (n) => {
  emit('update:tileCount', n)
}, { immediate: true })

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

function startDrag(_type: string, _idx: number, _e: MouseEvent, handle = '') {
  dragState.value = { type: 'frame', handle }
}

function onGlobalMove(e: MouseEvent) {
  if (!dragState.value || !stageRef.value) return
  const rect = stageRef.value.getBoundingClientRect()
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
    frame.value = snapFrameToGrid(frame.value)
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.fap-stage {
  position: relative;
  width: 100%;
  max-height: 560px;
  line-height: 0;
}

.fap-img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 560px;
  vertical-align: top;
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
  border: 1.5px solid rgba(82, 196, 26, 0.85);
  background: rgba(82, 196, 26, 0.06);
  z-index: 5;
  pointer-events: none;
  overflow: hidden;
}
.fap-tile-edge {
  border-style: dashed;
  background: rgba(82, 196, 26, 0.03);
}
.fap-tile-animate {
  transition: left 0.15s ease, top 0.15s ease, width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease;
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
