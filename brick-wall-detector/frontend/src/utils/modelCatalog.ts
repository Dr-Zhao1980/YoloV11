import type { AvailableModel } from '../api'

/** 与后端 MODEL_CATALOG 一致的两个版本展示名 */
export const MODEL_DISPLAY: Record<string, { label: string; badge: string; recommended?: boolean }> = {
  v1: { label: '第一版 · 基础检测', badge: 'V1' },
  v2: { label: '第二版 · Plus 增强', badge: 'V2', recommended: true },
}

/** 从 id / file / name 解析逻辑版本号 v1 | v2 */
export function resolveModelVersion(model: Pick<AvailableModel, 'id' | 'file' | 'name' | 'version'>): string {
  if (model.version === 'v1' || model.version === 'v2') return model.version
  const raw = `${model.id || ''} ${model.file || ''} ${model.name || ''}`
  const m = raw.match(/brick-wall-v(\d+)/i) || raw.match(/\bv(\d+)\b/i)
  return m ? `v${m[1]}` : model.id || model.name || 'unknown'
}

export function modelDisplayLabel(model: AvailableModel): string {
  const ver = resolveModelVersion(model)
  const preset = MODEL_DISPLAY[ver]
  if (preset) {
    return preset.recommended || model.recommended ? `${preset.label}（推荐）` : preset.label
  }
  const title = model.label || model.name
  return model.recommended ? `${title}（推荐）` : title
}

export function modelDisplayBadge(model: AvailableModel): string {
  const ver = resolveModelVersion(model)
  return MODEL_DISPLAY[ver]?.badge || ver.toUpperCase()
}

/** 强制只保留 v1、v2 各一项；优先 ONNX */
export function normalizeModelList(models: AvailableModel[]): AvailableModel[] {
  const byVersion = new Map<string, AvailableModel>()
  for (const m of models) {
    const key = resolveModelVersion(m)
    if (key !== 'v1' && key !== 'v2') continue
    const prev = byVersion.get(key)
    if (!prev) {
      byVersion.set(key, m)
      continue
    }
    const rank = (x: AvailableModel) => (x.type === 'onnx' ? 4 : 0) + (x.recommended ? 2 : 0)
    if (rank(m) > rank(prev)) byVersion.set(key, m)
  }
  return ['v2', 'v1'].map(v => byVersion.get(v)).filter(Boolean) as AvailableModel[]
}
