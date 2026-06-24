/**
 * 立面病害热力图：正射底图 + heatmap.js 点阵热力层 + Alpha 混合
 */
import h337 from '../vendor/heatmap.js'

export interface SeverityDetection {
  class?: string
  severity?: string
  confidence?: number
  areaM2?: number
  globalBbox?: number[]
  bbox?: number[]
  globalPolygon?: Array<{ x: number; y: number }>
}

export type HeatmapWeightMode = 'confidence' | 'area' | 'severity'

/** 默认热力点渲染半径（px） */
export const DEFAULT_HEAT_RADIUS = 180

/** 默认叠加强度（0–1） */
export const DEFAULT_OVERLAY_OPACITY = 0.5

export interface SeverityHeatmapOptions {
  maxSide?: number
  overlayOpacity?: number
  pureBackground?: string
  weightMode?: HeatmapWeightMode
  radius?: number
  /** 病害坐标所在区域宽（通常为 ROI / 拼合图宽，默认与底图一致） */
  coordWidth?: number
  /** 病害坐标所在区域高 */
  coordHeight?: number
  /** 从全景正射图裁切分析区的起点 X（像素） */
  cropOffsetX?: number
  cropOffsetY?: number
}

export interface SeverityHeatmapOutput {
  pure: HTMLCanvasElement
  overlay: HTMLCanvasElement
  width: number
  height: number
  /** 原始权重（置信度/面积比/严重度） */
  valueMin: number
  valueMax: number
  /** 送入 heatmap.js 的归一化权重 1–100 */
  normMin: number
  normMax: number
  pointCount: number
  radius: number
}

interface HeatPoint {
  x: number
  y: number
  value: number
}

const HEATMAP_JS_GRADIENT: Record<string, string> = {
  '0.0': 'rgba(0,0,255,0)',
  '0.15': 'rgb(0,80,255)',
  '0.35': 'rgb(0,200,255)',
  '0.5': 'rgb(0,255,120)',
  '0.65': 'rgb(255,255,0)',
  '0.8': 'rgb(255,160,0)',
  '0.92': 'rgb(255,60,0)',
  '1.0': 'rgb(220,0,0)',
}

export function heatColormap(t: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, t))
  if (v < 0.25) {
    const u = v / 0.25
    return [Math.round(60 + u * 40), Math.round(40 + u * 100), Math.round(180 + u * 75)]
  }
  if (v < 0.5) {
    const u = (v - 0.25) / 0.25
    return [Math.round(100 - u * 80), Math.round(140 + u * 115), Math.round(255 * (1 - u))]
  }
  if (v < 0.75) {
    const u = (v - 0.5) / 0.25
    return [Math.round(20 + u * 235), Math.round(255 * (1 - u * 0.2)), 0]
  }
  const u = (v - 0.75) / 0.25
  return [255, Math.round(204 * (1 - u)), 0]
}

function getBbox(det: SeverityDetection): [number, number, number, number] | null {
  const b = det.globalBbox || det.bbox
  if (!b || b.length < 4) return null
  return [b[0], b[1], b[2], b[3]]
}

/** 后端 globalBbox 固定为 [x, y, w, h]（整墙/全景像素坐标） */
function detectionCenter(
  det: SeverityDetection,
  scale: number,
  coordW: number,
  coordH: number,
  cropOffsetX: number,
  cropOffsetY: number
): { x: number; y: number } | null {
  const poly = det.globalPolygon
  if (poly && poly.length >= 3) {
    let sx = 0
    let sy = 0
    poly.forEach(p => {
      sx += p.x - cropOffsetX
      sy += p.y - cropOffsetY
    })
    const cx = (sx / poly.length) * scale
    const cy = (sy / poly.length) * scale
    if (cx < -2 || cy < -2) return null
    return { x: cx, y: cy }
  }
  const raw = getBbox(det)
  if (!raw) return null
  const [bx, by, bw, bh] = raw
  if (bw <= 0 || bh <= 0) return null
  const cx = (bx + bw / 2 - cropOffsetX) * scale
  const cy = (by + bh / 2 - cropOffsetY) * scale
  if (cx < -2 || cy < -2) return null
  return { x: cx, y: cy }
}

const SEVERITY_WEIGHT: Record<string, number> = {
  轻度: 0.35,
  中度: 0.55,
  较重: 0.72,
  严重: 0.88,
  极严重: 1,
}

function computePointWeight(
  det: SeverityDetection,
  mode: HeatmapWeightMode,
  areaMax: number
): number {
  const conf = Math.max(0, Math.min(1, det.confidence ?? 0.5))
  if (mode === 'confidence') return conf
  if (mode === 'severity') return SEVERITY_WEIGHT[det.severity || ''] ?? conf
  if (det.areaM2 && det.areaM2 > 0 && areaMax > 0) {
    return Math.max(0.05, Math.min(1, det.areaM2 / areaMax))
  }
  const bbox = getBbox(det)
  if (bbox) {
    const pxArea = bbox[2] * bbox[3]
    return Math.max(0.05, Math.min(1, pxArea / 12000))
  }
  return conf
}

function collectHeatmapPoints(
  detections: SeverityDetection[],
  scale: number,
  w: number,
  h: number,
  weightMode: HeatmapWeightMode,
  coordW: number,
  coordH: number,
  cropOffsetX: number,
  cropOffsetY: number
): { points: HeatPoint[]; valueMin: number; valueMax: number; normMin: number; normMax: number } {
  const areaMax = detections.reduce((m, d) => Math.max(m, d.areaM2 || 0), 0)
  const points: HeatPoint[] = []
  let valueMin = Infinity
  let valueMax = -Infinity

  detections.forEach(det => {
    const center = detectionCenter(det, scale, coordW, coordH, cropOffsetX, cropOffsetY)
    if (!center) return
    const x = Math.max(0, Math.min(w - 1, Math.round(center.x)))
    const y = Math.max(0, Math.min(h - 1, Math.round(center.y)))
    const value = computePointWeight(det, weightMode, areaMax)
    if (value <= 0) return
    points.push({ x, y, value })
    valueMin = Math.min(valueMin, value)
    valueMax = Math.max(valueMax, value)
  })

  if (!points.length) {
    return { points: [], valueMin: 0, valueMax: 1, normMin: 1, normMax: 100 }
  }
  if (valueMin === valueMax) valueMin = Math.max(0, valueMax - 0.01)
  return { points, valueMin, valueMax, normMin: 1, normMax: 100 }
}

/** 将权重线性拉伸到 1–100，增强三种权重模式的可视差异 */
function normalizePointsForHeatmap(
  points: HeatPoint[],
  valueMin: number,
  valueMax: number
): HeatPoint[] {
  const span = valueMax - valueMin || 1
  return points.map(p => ({
    x: p.x,
    y: p.y,
    value: Math.max(1, Math.round(((p.value - valueMin) / span) * 100)),
  }))
}

function defaultHeatRadius(w: number, h: number): number {
  const { min, max } = getHeatRadiusRange(w, h)
  return Math.max(min, Math.min(max, DEFAULT_HEAT_RADIUS))
}

/** 根据输出画布尺寸给出半径滑动条范围（供 UI 使用） */
export function getHeatRadiusRange(imageWidth = 2048, imageHeight = 2048, maxSide = 4096) {
  let w = imageWidth
  let h = imageHeight
  if (Math.max(w, h) > maxSide) {
    const s = maxSide / Math.max(w, h)
    w = Math.round(w * s)
    h = Math.round(h * s)
  }
  const shortSide = Math.min(w, h)
  const min = 4
  const max = Math.max(DEFAULT_HEAT_RADIUS + 20, Math.min(600, Math.round(shortSide * 0.15)))
  const auto = Math.max(min, Math.min(max, DEFAULT_HEAT_RADIUS))
  const suggested = auto
  return { min, max, auto, suggested }
}

function renderHeatmapLayerWithLibrary(
  w: number,
  h: number,
  points: HeatPoint[],
  valueMin: number,
  valueMax: number,
  radius: number
): HTMLCanvasElement {
  const container = document.createElement('div')
  container.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${w}px`,
    `height:${h}px`,
    'opacity:0',
    'pointer-events:none',
    'z-index:-9999',
    'overflow:hidden',
  ].join(';')
  document.body.appendChild(container)

  try {
    const instance = h337.create({
      container,
      width: w,
      height: h,
      radius,
      maxOpacity: 0.9,
      minOpacity: 0.08,
      blur: 0.88,
      gradient: HEATMAP_JS_GRADIENT,
    })

    const normalized = normalizePointsForHeatmap(points, valueMin, valueMax)
    instance.setData({ max: 100, min: 1, data: normalized })
    instance.repaint()

    const srcCanvas = container.querySelector('canvas')
    if (!srcCanvas) {
      throw new Error('heatmap.js 未创建画布')
    }

    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('无法创建 Canvas 2D 上下文')
    ctx.drawImage(srcCanvas, 0, 0, w, h)
    return out
  } finally {
    if (container.parentNode) document.body.removeChild(container)
  }
}

function parseBgColor(bg: string): [number, number, number] {
  if (bg.startsWith('#') && bg.length >= 7) {
    return [
      parseInt(bg.slice(1, 3), 16),
      parseInt(bg.slice(3, 5), 16),
      parseInt(bg.slice(5, 7), 16),
    ]
  }
  return [13, 17, 23]
}

function composePureHeatmap(
  heatLayer: HTMLCanvasElement,
  w: number,
  h: number,
  background: string
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  const [r, g, b] = parseBgColor(background)
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(heatLayer, 0, 0)
  return out
}

function composeOverlay(
  baseImage: HTMLImageElement,
  heatLayer: HTMLCanvasElement,
  w: number,
  h: number,
  opacity: number,
  crop: { x: number; y: number; sw: number; sh: number }
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  ctx.drawImage(baseImage, crop.x, crop.y, crop.sw, crop.sh, 0, 0, w, h)
  ctx.globalAlpha = opacity
  ctx.drawImage(heatLayer, 0, 0, w, h)
  ctx.globalAlpha = 1
  return out
}

function drawColorLegend(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  barW: number,
  barH: number,
  valueMin: number,
  valueMax: number,
  label: string
) {
  const grad = ctx.createLinearGradient(x, y, x + barW, y)
  ;[0, 0.25, 0.5, 0.75, 1].forEach(t => {
    const [r, g, b] = heatColormap(t)
    grad.addColorStop(t, `rgb(${r},${g},${b})`)
  })
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillRect(x - 8, y - 28, barW + 16, barH + 44)
  ctx.fillStyle = '#303133'
  ctx.font = 'bold 12px "Microsoft YaHei", sans-serif'
  ctx.fillText(label, x, y - 10)
  ctx.fillStyle = grad
  ctx.fillRect(x, y, barW, barH)
  ctx.strokeStyle = '#909399'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, barW, barH)
  ctx.fillStyle = '#606266'
  ctx.font = '10px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(valueMin.toFixed(0), x, y + barH + 14)
  ctx.textAlign = 'right'
  ctx.fillText(valueMax.toFixed(0), x + barW, y + barH + 14)
  ctx.textAlign = 'left'
}

function attachLegend(
  canvas: HTMLCanvasElement,
  valueMin: number,
  valueMax: number,
  label: string
): HTMLCanvasElement {
  const w = canvas.width
  const h = canvas.height
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  ctx.drawImage(canvas, 0, 0)
  drawColorLegend(ctx, 14, h - 52, Math.min(260, w * 0.34), 12, valueMin, valueMax, label)
  return out
}

export function renderSeverityHeatmaps(
  image: HTMLImageElement,
  detections: SeverityDetection[],
  options: SeverityHeatmapOptions = {}
): SeverityHeatmapOutput {
  const maxSide = options.maxSide ?? 4096
  const overlayOpacity = options.overlayOpacity ?? DEFAULT_OVERLAY_OPACITY
  const pureBg = options.pureBackground ?? '#0d1117'
  const weightMode = options.weightMode ?? 'confidence'

  const srcW = image.naturalWidth || image.width
  const srcH = image.naturalHeight || image.height
  if (!srcW || !srcH) {
    throw new Error('底图尺寸无效')
  }

  const coordW = options.coordWidth ?? srcW
  const coordH = options.coordHeight ?? srcH
  const cropX = Math.max(0, options.cropOffsetX ?? 0)
  const cropY = Math.max(0, options.cropOffsetY ?? 0)
  const cropSw = Math.min(coordW, Math.max(1, srcW - cropX))
  const cropSh = Math.min(coordH, Math.max(1, srcH - cropY))

  let w = coordW
  let h = coordH
  let scale = 1
  if (Math.max(w, h) > maxSide) {
    scale = maxSide / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }

  const { points, valueMin, valueMax, normMin, normMax } = collectHeatmapPoints(
    detections,
    scale,
    w,
    h,
    weightMode,
    coordW,
    coordH,
    cropX,
    cropY
  )

  if (!points.length) {
    throw new Error(`没有有效的病害坐标点（检测 ${detections.length} 条）`)
  }

  const radius = options.radius ?? defaultHeatRadius(w, h)
  const heatLayer = renderHeatmapLayerWithLibrary(w, h, points, valueMin, valueMax, radius)

  const weightLabel =
    weightMode === 'confidence'
      ? '相对权重·置信度（归一化）'
      : weightMode === 'area'
        ? '相对权重·面积（归一化）'
        : '相对权重·严重程度（归一化）'

  const pure = attachLegend(composePureHeatmap(heatLayer, w, h, pureBg), normMin, normMax, weightLabel)
  const overlay = attachLegend(
    composeOverlay(image, heatLayer, w, h, overlayOpacity, {
      x: cropX,
      y: cropY,
      sw: cropSw,
      sh: cropSh,
    }),
    normMin,
    normMax,
    weightLabel
  )

  return {
    pure,
    overlay,
    width: w,
    height: h,
    valueMin,
    valueMax,
    normMin,
    normMax,
    pointCount: points.length,
    radius,
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('导出图片失败'))), type, quality)
  })
}
