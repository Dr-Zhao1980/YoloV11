/** 五类病害固定配色（与后端 segment_utils.py 一致） */
export const DISEASE_COLORS: Readonly<Record<string, string>> = Object.freeze({
  裂缝: '#f39c12',
  缺损: '#1abc9c',
  植物附着: '#9b59b6',
  风化: '#e74c3c',
  泛碱: '#3498db',
})

export const DISEASE_FILL_OPACITY = 0.42

export function diseaseColor(name: string): string {
  return DISEASE_COLORS[name] || '#909399'
}

export function diseaseFill(name: string, opacity = DISEASE_FILL_OPACITY): string {
  const hex = diseaseColor(name).replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${opacity})`
}
