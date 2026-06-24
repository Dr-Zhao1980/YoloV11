/**
 * 五类病害荧光色配色（与 backend/segment_utils.py 一致）
 *
 * 色彩设计参考：
 * - 荧光渗透检测（FPI）：高亮度、高饱和荧光色在砖红底色上形成强对比（NDT 可视化惯例）
 * - 遗产砖面病害叠加：半透明填充 + 细轮廓线，利于低对比裂缝/风化边界辨识
 * - 五色相角间隔约 72°，降低类别混淆
 */
export const DISEASE_COLORS: Readonly<Record<string, string>> = Object.freeze({
  风化: '#FF1F8F',     // 荧光品红
  泛碱: '#00F0FF',     // 荧光青
  裂缝: '#FFF200',     // 荧光黄
  植物附着: '#D400FF', // 荧光紫
  缺损: '#00FF7A',     // 荧光绿
})

/** 荧光填充不透明度（兼顾底纹可见与边界醒目） */
export const DISEASE_FILL_OPACITY = 0.52

/** 极细黑边描边色 */
export const DISEASE_STROKE_COLOR = '#000000'

/** 屏幕叠加层描边宽度（px，非缩放） */
export const DISEASE_STROKE_WIDTH = 0.5

export function diseaseColor(name: string): string {
  return DISEASE_COLORS[name] || '#FF2D9A'
}

export function diseaseFill(name: string, opacity = DISEASE_FILL_OPACITY): string {
  const hex = diseaseColor(name).replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

export function diseaseStroke(opacity = 0.92): string {
  return `rgba(0,0,0,${opacity})`
}

/** 标签文字色：荧光底上用深色字保证可读 */
export function diseaseLabelTextColor(name: string): string {
  const hex = diseaseColor(name).replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 185 ? '#111111' : '#ffffff'
}
