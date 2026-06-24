<template>
  <div class="dmo-wrap" :style="wrapStyle">
    <svg
      v-if="width > 0 && height > 0"
      class="dmo-svg"
      :viewBox="`0 0 ${width} ${height}`"
      preserveAspectRatio="xMidYMid meet"
    >
      <polygon
        v-for="(det, i) in detections"
        :key="det.id ?? i"
        :points="polygonAttr(det)"
        :fill="diseaseFill(det.class)"
        :stroke="DISEASE_STROKE_COLOR"
        :stroke-width="DISEASE_STROKE_WIDTH"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
        shape-rendering="geometricPrecision"
      />
    </svg>
    <div
      v-for="(det, i) in detections"
      :key="'lbl-' + (det.id ?? i)"
      class="dmo-label"
      :style="labelStyle(det)"
    >
      {{ det.rawClassName || det.class }} {{ det.confidence.toFixed(2) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  diseaseFill,
  diseaseLabelTextColor,
  DISEASE_STROKE_COLOR,
  DISEASE_STROKE_WIDTH,
} from '../utils/diseaseColors'

export interface MaskDetection {
  id?: number
  class: string
  rawClassName?: string
  confidence: number
  bbox: number[]
  polygon?: number[][]
}

const props = defineProps<{
  detections: MaskDetection[]
  width: number
  height: number
  displayWidth: number
  displayHeight: number
}>()

const wrapStyle = {
  width: `${props.displayWidth}px`,
  height: `${props.displayHeight}px`,
}

function polygonAttr(det: MaskDetection): string {
  const poly = det.polygon
  if (poly && poly.length >= 3) {
    return poly.map(p => `${p[0]},${p[1]}`).join(' ')
  }
  const [x, y, w, h] = det.bbox
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`
}

function labelStyle(det: MaskDetection) {
  const poly = det.polygon
  let lx: number
  let ly: number
  if (poly && poly.length >= 3) {
    lx = poly.reduce((s, p) => s + p[0], 0) / poly.length
    ly = poly.reduce((s, p) => s + p[1], 0) / poly.length
  } else {
    const [x, y, w] = det.bbox
    lx = x + w * 0.05
    ly = y
  }
  const scaleX = props.displayWidth / (props.width || 1)
  const scaleY = props.displayHeight / (props.height || 1)
  return {
    left: `${lx * scaleX}px`,
    top: `${Math.max(0, ly * scaleY - 22)}px`,
    background: diseaseFill(det.class, 0.9),
    color: diseaseLabelTextColor(det.class),
    border: '0.5px solid rgba(0,0,0,0.85)',
  }
}
</script>

<style scoped>
.dmo-wrap {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}
.dmo-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.dmo-label {
  position: absolute;
  transform: translateX(-2px);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  line-height: 1.3;
  z-index: 2;
}
</style>
