/**
 * YOLOv11 ONNX 推理模块（纯 Node.js，无需 Python）
 * 依赖: onnxruntime-node, sharp
 *
 * 使用前需先运行 export_onnx.py 生成 best.onnx
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_PATH = process.env.YOLO_ONNX_PATH ||
  path.join(__dirname, 'models', 'best.onnx');

let ort = null;
let session = null;
let modelReady = false;

// 病害类别名（按 YOLOv11 模型训练顺序）
// 若模型输出名不同，可通过 session.inputNames / session.outputNames 确认
// 按模型实际训练类别顺序: 01:LF 02:QS 03:P 04:B-FH 05:B-FJ
const DISEASE_CLASSES = {
  0: '裂缝', 1: '缺损', 2: '植物附着', 3: '风化', 4: '泛碱'
};

async function loadModel() {
  if (modelReady) return true;
  if (!fs.existsSync(MODEL_PATH)) {
    console.log(`[ONNX] 模型文件不存在: ${MODEL_PATH}`);
    console.log('[ONNX] 请先运行: python3 backend/export_onnx.py');
    return false;
  }

  try {
    ort = await import('onnxruntime-node').catch(() => null);
    if (!ort) {
      console.log('[ONNX] onnxruntime-node 未安装，跳过');
      return false;
    }

    session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all'
    });
    modelReady = true;
    console.log(`[ONNX] 模型加载成功: ${MODEL_PATH}`);
    console.log(`[ONNX] 输入: ${session.inputNames}, 输出: ${session.outputNames}`);

    // 写入就绪标志
    const flagPath = path.join(__dirname, 'data', 'model_ready.flag');
    fs.mkdirSync(path.dirname(flagPath), { recursive: true });
    fs.writeFileSync(flagPath, 'onnx-ready');
    return true;
  } catch (err) {
    console.error('[ONNX] 模型加载失败:', err.message);
    return false;
  }
}

/**
 * 预处理图片为 640×640 letterbox
 */
async function preprocessImage(imagePath) {
  const INPUT_SIZE = 640;

  const img = sharp(imagePath);
  const meta = await img.metadata();
  const origW = meta.width;
  const origH = meta.height;

  // letterbox resize 保持比例
  const scale = Math.min(INPUT_SIZE / origW, INPUT_SIZE / origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);
  const padX = Math.round((INPUT_SIZE - newW) / 2);
  const padY = Math.round((INPUT_SIZE - newH) / 2);

  const resized = await sharp(imagePath)
    .resize(newW, newH)
    .extend({ top: padY, bottom: INPUT_SIZE - newH - padY, left: padX, right: INPUT_SIZE - newW - padX, background: { r: 114, g: 114, b: 114 } })
    .removeAlpha()
    .raw()
    .toBuffer();

  // HWC -> CHW, normalize [0,255] -> [0,1]
  const chw = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
    chw[i] = resized[i * 3] / 255.0;
    chw[INPUT_SIZE * INPUT_SIZE + i] = resized[i * 3 + 1] / 255.0;
    chw[2 * INPUT_SIZE * INPUT_SIZE + i] = resized[i * 3 + 2] / 255.0;
  }

  return { tensor: chw, origW, origH, scale, padX, padY };
}

/**
 * NMS (Non-Maximum Suppression)
 */
function nms(boxes, iouThreshold = 0.45) {
  boxes.sort((a, b) => b.confidence - a.confidence);
  const keep = [];

  for (let i = 0; i < boxes.length; i++) {
    let suppressed = false;
    for (const j of keep) {
      if (iou(boxes[i].xyxy, boxes[j].xyxy) > iouThreshold) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) keep.push(boxes[i]);
  }
  return keep;
}

function iou(a, b) {
  const ix1 = Math.max(a[0], b[0]);
  const iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[2], b[2]);
  const iy2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (areaA + areaB - inter + 1e-6);
}

/**
 * 主推理函数
 * @param {string} imagePath 图片绝对路径
 * @param {number} confThreshold 置信度阈值
 * @returns {object} { success, detections, model_names, image_width, image_height }
 */
export async function runInference(imagePath, confThreshold = 0.30) {
  if (!modelReady) {
    const ok = await loadModel();
    if (!ok) return { success: false, message: 'ONNX 模型未就绪' };
  }

  const { tensor, origW, origH, scale, padX, padY } = await preprocessImage(imagePath);

  const inputName = session.inputNames[0];
  const feeds = {
    [inputName]: new ort.Tensor('float32', tensor, [1, 3, 640, 640])
  };

  const results = await session.run(feeds);
  const outputName = session.outputNames[0];
  const output = results[outputName].data; // shape: [1, 84, 8400] or [1, num_det, 6]

  // YOLOv8/v11 输出格式: [batch, 4+num_classes, 8400] (transposed)
  const outputShape = results[outputName].dims;
  const detections = [];

  if (outputShape.length === 3) {
    // YOLO11-seg output: [1, rows, 8400]
    // rows = 4 (xywh) + num_classes + 32 (mask coefficients)
    // For best.pt: rows=41, num_classes=5 (风化泛碱裂缝脱落缺损), mask_coeff=32
    const [, rows, cols] = outputShape;
    const numClasses = Object.keys(DISEASE_CLASSES).length; // 5
    // class scores start at index 4, mask coefficients at 4+numClasses

    for (let i = 0; i < cols; i++) {
      const cx = output[0 * cols + i];
      const cy = output[1 * cols + i];
      const w  = output[2 * cols + i];
      const h  = output[3 * cols + i];

      let maxConf = 0;
      let classId = 0;
      for (let c = 0; c < numClasses; c++) {
        const conf = output[(4 + c) * cols + i];
        if (conf > maxConf) { maxConf = conf; classId = c; }
      }

      if (maxConf < confThreshold) continue;

      // decode letterbox → original image coords
      const x1 = Math.max(0,     Math.round(((cx - w / 2) - padX) / scale));
      const y1 = Math.max(0,     Math.round(((cy - h / 2) - padY) / scale));
      const x2 = Math.min(origW, Math.round(((cx + w / 2) - padX) / scale));
      const y2 = Math.min(origH, Math.round(((cy + h / 2) - padY) / scale));

      if (x2 <= x1 || y2 <= y1) continue;

      detections.push({
        id: detections.length + 1,
        class_id: classId,
        class_name: DISEASE_CLASSES[classId] || `class_${classId}`,
        confidence: Math.round(maxConf * 10000) / 10000,
        bbox: [x1, y1, x2 - x1, y2 - y1],
        xyxy: [x1, y1, x2, y2]
      });
    }
  }

  const kept = nms(detections);

  return {
    success: true,
    total_detections: kept.length,
    detections: kept,
    model_names: DISEASE_CLASSES,
    image_width: origW,
    image_height: origH
  };
}

// 启动时尝试预加载模型
loadModel().catch(() => {});
