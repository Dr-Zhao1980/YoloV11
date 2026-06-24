/**
 * 历史工业建筑外立面病害检测模型注册表（固定两个逻辑版本）
 *
 * v1 → brick-wall-v1.onnx
 * v2 → brick-wall-v2.onnx（优先）或 brick-wall-v2.pt（Plus.pt 源权重）
 */
import fs from 'fs';
import path from 'path';

/** 第二版源权重原始文件名 */
export const V2_SOURCE_WEIGHT = 'Plus.pt';

/** 仅两个可选版本；不再按磁盘文件逐条扫描以免 .pt/.onnx 重复出现 */
export const MODEL_CATALOG = [
  {
    version: 'v1',
    label: '第一版 · 基础检测',
    shortLabel: 'v1',
    recommended: false,
    description: '第一版 ONNX 实例分割模型（固定 640px 输入）',
    inferImgsz: 640,
    candidates: ['brick-wall-v1.onnx'],
  },
  {
    version: 'v2',
    label: '第二版 · Plus 增强',
    shortLabel: 'v2',
    recommended: true,
    sourceWeight: V2_SOURCE_WEIGHT,
    description: '第二版增强模型（Plus.pt 导出，固定 640px 输入，推荐）',
    inferImgsz: 640,
    candidates: ['brick-wall-v2.onnx', 'brick-wall-v2.pt'],
  },
];

export const MODEL_ALIASES = {
  'best.onnx': 'brick-wall-v1.onnx',
  'best.pt': 'brick-wall-v1.onnx',
  'best2.pt': 'brick-wall-v2.onnx',
  'Plus.pt': 'brick-wall-v2.onnx',
  'Plus': 'brick-wall-v2.onnx',
  'brick-wall-v2.pt': 'brick-wall-v2.onnx',
  'YOLOv11-BrickWall-v1.0': 'brick-wall-v1.onnx',
  'YOLOv11-BrickWall-Plus-v1.0': 'brick-wall-v2.onnx',
};

export function normalizeModelId(modelId) {
  if (!modelId) return modelId;
  return MODEL_ALIASES[modelId] || modelId;
}

export function formatModelSize(size) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${size}B`;
}

function resolveCatalogEntry(modelsDir, entry) {
  for (const file of entry.candidates) {
    const fullPath = path.join(modelsDir, file);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      const ext = path.extname(file).slice(1).toLowerCase();
      return {
        id: file,
        name: entry.label,
        label: entry.label,
        file,
        type: ext,
        version: entry.version,
        shortLabel: entry.shortLabel,
        inferImgsz: entry.inferImgsz || (ext === 'onnx' ? 640 : null),
        sourceWeight: entry.sourceWeight || null,
        description: entry.description,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        recommended: !!entry.recommended,
      };
    }
  }
  return null;
}

export function createModelRegistry(modelsDir) {
  function getAvailableModels() {
    return MODEL_CATALOG
      .map(entry => resolveCatalogEntry(modelsDir, entry))
      .filter(Boolean);
  }

  function resolveModelPath(modelId) {
    const available = getAvailableModels();
    if (!available.length) return null;

    const normalized = normalizeModelId(modelId);
    const selected =
      available.find(m => m.id === normalized) ||
      available.find(m => m.id === modelId) ||
      available.find(m => m.version === normalized) ||
      available.find(m => m.recommended) ||
      available[0];

    if (!selected) return null;
    return {
      ...selected,
      path: path.join(modelsDir, selected.file),
    };
  }

  function getDefaultModelId(settingsModelVersion) {
    const available = getAvailableModels();
    if (!available.length) return null;

    if (settingsModelVersion) {
      const normalized = normalizeModelId(settingsModelVersion);
      const fromSettings =
        available.find(m => m.id === normalized) ||
        available.find(m => m.id === settingsModelVersion) ||
        available.find(m => m.version === settingsModelVersion);
      if (fromSettings) return fromSettings.id;
    }

    const rec = available.find(m => m.recommended);
    return rec ? rec.id : available[0].id;
  }

  function getModelOptionsForSettings() {
    return getAvailableModels().map(m => ({
      label: m.recommended ? `${m.label}（推荐）` : m.label,
      value: m.id,
    }));
  }

  return {
    getAvailableModels,
    resolveModelPath,
    getDefaultModelId,
    getModelOptionsForSettings,
  };
}
