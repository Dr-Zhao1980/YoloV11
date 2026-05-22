import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initAuth } from './auth.js';
import { runInference as onnxInfer } from './onnx_infer.js';

const execFileAsync = promisify(execFile);

const uuidv4 = () => randomUUID();

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 项目根目录：兼容 server.js 在根目录或 backend/ 子目录两种部署形态
const repoRoot = fs.existsSync(path.join(__dirname, '..', 'package.json'))
  ? path.join(__dirname, '..')
  : __dirname;

const app = express();
const PORT = process.env.PORT || 3000;
const DEBUG_MODE = process.env.DEBUG_MODE === '1' || process.env.NODE_ENV === 'development';

// CORS：放行所有来源，避免跨域引发 Network Error
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// 请求 / 响应日志（DEBUG 模式下额外打印 body 摘要，便于排查 Network Error）
app.use((req, res, next) => {
  const start = Date.now();
  const ts = () => new Date().toISOString();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const lvl = res.statusCode >= 500 ? '❌' : res.statusCode >= 400 ? '⚠️' : '✅';
    console.log(`[${ts()}] ${lvl} ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
    if (DEBUG_MODE && req.method !== 'GET') {
      const ct = req.headers['content-type'] || '';
      if (ct.includes('multipart/form-data')) {
        console.log(`           [multipart] file=${req.file?.originalname || 'n/a'} size=${req.file?.size || 0}B body=${JSON.stringify(req.body || {}).slice(0, 240)}`);
      } else if (ct.includes('json')) {
        console.log(`           [json] ${JSON.stringify(req.body || {}).slice(0, 240)}`);
      }
    }
  });
  next();
});

// 静态资源：__dirname 下找不到 dist/uploads 时回退到 repoRoot
const uploadsDir = fs.existsSync(path.join(__dirname, 'uploads'))
  ? path.join(__dirname, 'uploads')
  : path.join(repoRoot, 'uploads');
const distDir = fs.existsSync(path.join(__dirname, 'dist'))
  ? path.join(__dirname, 'dist')
  : path.join(repoRoot, 'dist');
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(distDir));

// 运行目录初始化（基于 server.js 同级，便于在 backend/ 中持久化数据）
const runtimeBase = __dirname;
const runtimeDirs = [
  path.join(runtimeBase, 'uploads'),
  path.join(runtimeBase, 'uploads/single'),
  path.join(runtimeBase, 'uploads/panoramas'),
  path.join(runtimeBase, 'uploads/tiles'),
  path.join(runtimeBase, 'data'),
  path.join(runtimeBase, 'data/facade-jobs')
];
runtimeDirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 初始化认证与系统管理模块
const { authMiddleware: requireAuth, optionalAuth, addLog: logAction, addHistoryRecord } = initAuth(app, __dirname);

// 单图上传存储（原有 /api/detect 使用）
const singleStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, 'uploads/single')),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: singleStorage, limits: { fileSize: 10 * 1024 * 1024 } });
const modelsDir = path.join(__dirname, 'models');
const supportedModelExts = new Set(['.pt', '.onnx']);

function getAvailableModels() {
  if (!fs.existsSync(modelsDir)) return [];
  return fs.readdirSync(modelsDir)
    .filter(file => supportedModelExts.has(path.extname(file).toLowerCase()))
    .sort((a, b) => {
      if (a === 'best.onnx') return -1;
      if (b === 'best.onnx') return 1;
      if (a === 'best.pt') return -1;
      if (b === 'best.pt') return 1;
      return a.localeCompare(b);
    })
    .map(file => {
      const fullPath = path.join(modelsDir, file);
      const stat = fs.statSync(fullPath);
      const ext = path.extname(file).toLowerCase();
      return {
        id: file,
        name: path.basename(file, ext),
        file,
        type: ext.slice(1),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        recommended: file === 'best.onnx'
      };
    });
}

function resolveModelPath(modelId) {
  const available = getAvailableModels();
  const selected = available.find(model => model.id === modelId) || available[0];
  if (!selected) return null;
  return {
    ...selected,
    path: path.join(modelsDir, selected.file)
  };
}

// 全景大图上传存储（立面普查模式使用）
const panoramaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, 'uploads/panoramas')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});
const panoramaUpload = multer({
  storage: panoramaStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'image/tif', 'image/webp', 'application/octet-stream'];
    const allowedExts = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mimeOk = allowedTypes.includes((file.mimetype || '').toLowerCase());
    const extOk = allowedExts.includes(ext);
    if (!mimeOk && !extOk) {
      return cb(new Error('仅支持 JPG、PNG、TIFF、WEBP 格式的立面影像'));
    }
    cb(null, true);
  }
});

const DISEASE_COLORS = {
  '风化': '#e74c3c',
  '泛碱': '#3498db',
  '裂缝': '#f39c12',
  '植物附着': '#9b59b6',
  '缺损': '#1abc9c'
};

const REPAIR_RECOMMENDATIONS = {
  '风化': {
    description: '砖体表面因长期暴露于自然环境中，受风吹、日晒、雨淋等因素影响，导致表面材料逐渐脱落、疏松的现象。',
    severity: '表层风化（<5mm）为轻度，中层风化（5-15mm）为中度，深层风化（>15mm）为重度。',
    repairMethod: [
      '轻度风化：清理表面松散物，涂刷有机硅防护剂进行封护处理',
      '中度风化：清除风化层，采用与原砖材质相近的砖粉砂浆修补，表面做防护处理',
      '重度风化：拆除严重风化砖块，选用同规格、同材质的新砖替换，灌浆填充，做整体防护'
    ],
    materials: '有机硅防护剂、砖粉砂浆、同规格替换砖、环氧树脂灌浆料',
    preventionMeasures: '定期检查，及时修补微小破损；涂刷防护剂延缓风化；改善排水，减少积水浸泡'
  },
  '泛碱': {
    description: '砖体内部可溶性盐类随水分迁移至砖表面，水分蒸发后盐类结晶析出，在砖表面形成白色粉末或结晶体的现象。',
    severity: '轻度泛碱表现为表面少量白色粉末；中度泛碱表面白色结晶面积较大；重度泛碱可能导致砖体膨胀开裂。',
    repairMethod: [
      '轻度泛碱：用清水或稀盐酸溶液清洗表面，待干燥后涂刷防水剂',
      '中度泛碱：使用专业泛碱清洗剂处理，配合高压水枪冲洗，干燥后做防水憎水处理',
      '重度泛碱：分析泛碱成因，从源头解决水分问题；清除泛碱层，修补砖体，做系统防水处理'
    ],
    materials: '泛碱清洗剂、防水憎水剂、硅烷浸渍剂、防水砂浆',
    preventionMeasures: '做好墙体防水层；改善通风条件；避免使用含碱量高的水泥砂浆'
  },
  '裂缝': {
    description: '砖体或砌体出现线状开裂，可能由温度变化、不均匀沉降、外力作用等因素引起。',
    severity: '微裂缝（<0.3mm）为轻度，中裂缝（0.3-1.0mm）为中度，大裂缝（>1.0mm）为重度。',
    repairMethod: [
      '微裂缝：注入环氧树脂或聚氨酯灌浆料封闭裂缝',
      '中等裂缝：沿裂缝凿V型槽，清理后用弹性密封材料填充',
      '贯穿裂缝：分析裂缝成因，采用钢筋网片加固或化学锚栓固定，灌注结构胶修补'
    ],
    materials: '环氧树脂灌浆料、聚氨酯密封胶、碳纤维布、化学锚栓',
    preventionMeasures: '监测裂缝发展趋势；设置合理的伸缩缝；控制墙体荷载'
  },
  '植物附着': {
    description: '砖墙表面有植物（苔藓、地衣、蒿类等）附着生长，植物根系可能导致砖缝扮大、表面分层及结构损伤。',
    severity: '少量藓类附生为轻度，植物已覆盖大片墙面为中度，根系已渗入砖缝导致明显灯裂为重度。',
    repairMethod: [
      '轻度：手工或使用低压清洗去除植物，干燥后涂刷防徹处理',
      '中度：彻底清除植物及残留根系，射入除草剂，修补砖缝',
      '重度：清除植物后检查砖缝损伤，修补开裂砖缝，贴筑流失砖块'
    ],
    materials: '底部防毒处理剂、砖缝修补砂浆、防郁涂料',
    preventionMeasures: '定期清理墙面植物；改善局部排水和通风；定期涂刷防腕保护表面'
  },
  '缺损': {
    description: '砖块出现缺角、破碎、缺失等损坏现象，可能由外力冲击、材料老化或施工不当引起。',
    severity: '小范围缺角为轻度，较大面积破碎为中度，砖块完全缺失为重度。',
    repairMethod: [
      '小范围缺损：用砖粉修补砂浆修复原有外形',
      '较大缺损：凿除损坏部分，用同材质砖块切割拼接修补',
      '砖块缺失：选用同规格、同色泽新砖替换，砌筑砂浆勾缝'
    ],
    materials: '砖粉修补砂浆、同规格替换砖、砌筑砂浆、勾缝剂',
    preventionMeasures: '避免外力撞击；加强日常巡查；设置防护措施'
  }
};

function generateDemoResults(imagePath, brickLengthMm = 240) {
  // 基于红砖长度计算像素到米的换算
  const imageWidth = 800;
  const estimatedBrickPixels = imageWidth / 6;
  const pixelToMeter = (brickLengthMm / 1000) / estimatedBrickPixels;
  
  const rawDetections = [
    { id: 1, class: '风化', confidence: 0.94, bbox: [52, 38, 245, 180], severity: '中度' },
    { id: 2, class: '风化', confidence: 0.87, bbox: [480, 320, 180, 150], severity: '轻度' },
    { id: 3, class: '泛碱', confidence: 0.91, bbox: [310, 85, 210, 165], severity: '中度' },
    { id: 4, class: '泛碱', confidence: 0.82, bbox: [60, 380, 155, 120], severity: '轻度' },
    { id: 5, class: '裂缝', confidence: 0.96, bbox: [380, 200, 45, 180], severity: '中度' },
    { id: 6, class: '裂缝', confidence: 0.78, bbox: [150, 290, 35, 120], severity: '轻度' },
    { id: 7, class: '植物附着', confidence: 0.89, bbox: [560, 120, 130, 110], severity: '中度' },
    { id: 8, class: '缺损', confidence: 0.85, bbox: [680, 400, 90, 85], severity: '轻度' }
  ];
  
  // 计算面积和网格编号
  const detections = rawDetections.map(d => {
    let area = null;
    if (d.class === '风化' || d.class === '泛碱') {
      area = Math.round(d.bbox[2] * d.bbox[3] * pixelToMeter * pixelToMeter * 100) / 100;
    }
    const gridX = Math.floor(d.bbox[0] / (imageWidth / 4));
    const gridY = Math.floor(d.bbox[1] / (imageWidth / 4));
    return { ...d, area, gridId: `G${gridY + 1}-${gridX + 1}` };
  });

  const summary = {};
  detections.forEach(d => {
    if (!summary[d.class]) {
      summary[d.class] = { count: 0, totalArea: 0, maxSeverity: '轻度', items: [] };
    }
    summary[d.class].count++;
    if (d.area) summary[d.class].totalArea += d.area;
    summary[d.class].items.push(d);
    const order = { '轻度': 1, '中度': 2, '重度': 3 };
    if ((order[d.severity] || 0) > (order[summary[d.class].maxSeverity] || 0)) {
      summary[d.class].maxSeverity = d.severity;
    }
  });

  return {
    success: true,
    imagePath,
    imageWidth: 800,
    imageHeight: 600,
    totalDetections: detections.length,
    detections,
    summary,
    timestamp: new Date().toISOString(),
    modelInfo: { name: 'YOLOv11-BrickWall', version: '1.0', platform: '阿里云PAI' }
  };
}

// 干扰项类别 ID（电线、管线、阴影等）- 需要过滤
const INTERFERENCE_CLASSES = new Set([6, '6', 'NONE', 'none', 'interference', '干扰']);

function parsePAIResponse(paiResult, imagePath, brickLengthMm = 240, imageWidth = 800) {
  const detections = [];
  const classMap = {
    0: '裂缝', 1: '缺损', 2: '植物附着', 3: '风化', 4: '泛碱',
    'weathering': '风化', 'efflorescence': '泛碱', 'crack': '裂缝',
    'spalling': '植物附着', 'missing': '缺损',
    '风化': '风化', '泛碱': '泛碱', '裂缝': '裂缝', '植物附着': '植物附着', '缺损': '缺损'
  };

  const rawDetections = paiResult.detections || paiResult.results || paiResult.boxes || [];
  
  // 估算像素到米的换算比例（基于红砖长度）
  // 假设图中红砖约占图像宽度的 1/8 ~ 1/4
  const estimatedBrickPixels = imageWidth / 6; // 假设一块砖约占图像宽度的 1/6
  const pixelToMeter = (brickLengthMm / 1000) / estimatedBrickPixels;

  let validId = 0;
  rawDetections.forEach((det) => {
    const rawClass = det.class ?? det.label ?? det.category ?? det.name ?? det.id;
    
    // 过滤干扰项 (ID 06: NONE - 电线、管线、阴影)
    if (INTERFERENCE_CLASSES.has(rawClass)) {
      console.log(`[Filter] 过滤干扰项: class=${rawClass}`);
      return; // 跳过干扰项
    }
    
    const className = classMap[rawClass] || String(rawClass);
    // 如果映射后仍然不是有效病害类别，跳过
    if (!['风化', '泛碱', '裂缝', '植物附着', '缺损'].includes(className)) {
      console.log(`[Filter] 过滤未知类别: ${rawClass} -> ${className}`);
      return;
    }
    
    const bbox = det.bbox || det.box || [0, 0, 0, 0];
    const confidence = det.confidence || det.score || det.prob || 0;

    // 计算物理面积（仅对风化和泛碱）
    let area = null;
    if (className === '风化' || className === '泛碱') {
      area = Math.round(bbox[2] * bbox[3] * pixelToMeter * pixelToMeter * 100) / 100;
    }

    let severity = '轻度';
    if (confidence >= 0.9) severity = '重度';
    else if (confidence >= 0.7) severity = '中度';

    validId++;
    // 计算网格编号（用于 QGIS 导出）
    const gridX = Math.floor(bbox[0] / (imageWidth / 4)); // 4列网格
    const gridY = Math.floor(bbox[1] / (imageWidth / 4)); // 假设正方形区域
    const gridId = `G${gridY + 1}-${gridX + 1}`;

    detections.push({ 
      id: validId, 
      class: className, 
      confidence: Math.round(confidence * 100) / 100, 
      bbox, 
      area, 
      severity,
      gridId // 网格编号，供 QGIS 使用
    });
  });

  const summary = {};
  detections.forEach(d => {
    if (!summary[d.class]) {
      summary[d.class] = { count: 0, totalArea: 0, maxSeverity: '轻度', items: [] };
    }
    summary[d.class].count++;
    if (d.area) summary[d.class].totalArea += d.area;
    summary[d.class].items.push(d);
    const order = { '轻度': 1, '中度': 2, '重度': 3 };
    if ((order[d.severity] || 0) > (order[summary[d.class].maxSeverity] || 0)) {
      summary[d.class].maxSeverity = d.severity;
    }
  });

  return {
    success: true,
    imagePath,
    imageWidth,
    imageHeight: imageWidth * 0.75, // 默认 4:3 比例
    totalDetections: detections.length,
    detections,
    summary,
    timestamp: new Date().toISOString(),
    modelInfo: { name: 'YOLOv11-BrickWall', version: '1.0', platform: '阿里云PAI' }
  };
}

// ==================== 本地模型响应解析 ====================

/**
 * 解析本地 Python YOLOv11 模型服务的返回结果
 * 将原始类别名称映射到系统内部病害类别
 */
function parseLocalModelResponse(localResult, imagePath, brickLengthMm = 240, imageWidth = 800, imageHeight = 600) {
  const detections = [];
  const rawDetections = localResult.detections || [];
  const modelNames = localResult.model_names || {};
  
  // 模型真实类别名 -> 系统病害显示名
  const MODEL_CLASS_MAP = {
    '01:LF':  '裂缝',
    '02:QS':  '缺损',
    '03:P':   '植物附着',
    '04:B-FH':'风化',
    '05:B-FJ':'泛碱',
    // 数字 ID 兜底
    0: '裂缝', 1: '缺损', 2: '植物附着', 3: '风化', 4: '泛碱'
  };

  const diseaseMapping = {};
  for (const [id, name] of Object.entries(modelNames)) {
    const displayName = MODEL_CLASS_MAP[name] || MODEL_CLASS_MAP[parseInt(id)] || String(name);
    diseaseMapping[id] = displayName;
    diseaseMapping[name] = displayName;
  }
  console.log('[LocalModel] 类别映射:', diseaseMapping);

  const estimatedBrickPixels = imageWidth / 6;
  const pixelToMeter = (brickLengthMm / 1000) / estimatedBrickPixels;

  let validId = 0;
  rawDetections.forEach(det => {
    const rawClass = det.class_name || det.class_id;
    const className = diseaseMapping[rawClass] || diseaseMapping[det.class_id] || String(rawClass);

    // 过滤无效类别
    if (!['风化', '泛碱', '裂缝', '植物附着', '缺损'].includes(className)) {
      console.log(`[LocalModel] 过滤未知类别: ${rawClass} -> ${className}`);
      return;
    }

    const bbox = det.bbox || [0, 0, 0, 0]; // [x, y, w, h]
    const confidence = det.confidence || 0;

    let area = null;
    if (className === '风化' || className === '泛碱') {
      area = Math.round(bbox[2] * bbox[3] * pixelToMeter * pixelToMeter * 100) / 100;
    }

    let severity = '轻度';
    if (confidence >= 0.9) severity = '重度';
    else if (confidence >= 0.7) severity = '中度';

    validId++;
    const gridX = Math.floor(bbox[0] / (imageWidth / 4));
    const gridY = Math.floor(bbox[1] / (imageHeight / 4));
    const gridId = `G${gridY + 1}-${gridX + 1}`;

    detections.push({
      id: validId,
      class: className,
      rawClassName: det.raw_class_name || String(rawClass),
      confidence: Math.round(confidence * 100) / 100,
      bbox,
      area,
      severity,
      gridId
    });
  });

  const summary = {};
  detections.forEach(d => {
    if (!summary[d.class]) {
      summary[d.class] = { count: 0, totalArea: 0, maxSeverity: '轻度', items: [] };
    }
    summary[d.class].count++;
    if (d.area) summary[d.class].totalArea += d.area;
    summary[d.class].items.push(d);
    const order = { '轻度': 1, '中度': 2, '重度': 3 };
    if ((order[d.severity] || 0) > (order[summary[d.class].maxSeverity] || 0)) {
      summary[d.class].maxSeverity = d.severity;
    }
  });

  return {
    success: true,
    imagePath,
    imageWidth,
    imageHeight,
    totalDetections: detections.length,
    detections,
    summary,
    timestamp: new Date().toISOString(),
    modelInfo: { name: 'YOLOv11-BrickWall', version: '1.0', platform: '本地推理' }
  };
}

// ==================== API Routes ====================

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/models', (_req, res) => {
  res.json({ success: true, models: getAvailableModels() });
});

app.post('/api/detect', optionalAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传图片' });
    }

    const imagePath = `/uploads/single/${req.file.filename}`;
    const brickLengthMm = parseInt(req.body.brickLengthMm) || 240;
    const selectedModel = resolveModelPath(req.body.modelId);
    if (!selectedModel) {
      return res.status(500).json({ success: false, message: '未找到可用模型文件' });
    }

    // 前端传入的模型推理参数（带合理范围限制）
    const modelConf = Math.max(0.05, Math.min(0.95,
      parseFloat(req.body.modelConf) || parseFloat(process.env.YOLO_CONFIDENCE) || 0.30
    ));
    const iouThreshold = Math.max(0.10, Math.min(0.90,
      parseFloat(req.body.iouThreshold) || 0.45
    ));
    const inferImgsz = [320, 416, 640, 1024, 1280].includes(parseInt(req.body.imageSize))
      ? parseInt(req.body.imageSize) : 640;

    // 获取图片尺寸
    const sizeOf = await import('image-size').then(m => m.default).catch(() => null);
    let imageWidth = 800, imageHeight = 600;
    if (sizeOf) {
      try {
        const dimensions = sizeOf(req.file.path);
        imageWidth = dimensions.width || 800;
        imageHeight = dimensions.height || 600;
      } catch (e) { /* 使用默认值 */ }
    }

    let result;
    let usedLocalModel = false;
    let isDemo = false;

    // 强制模型推理（Python 子进程 + ONNX Runtime + best.onnx）
    {
      try {
        const inferScript = path.join(__dirname, 'run_inference.py');
        const { stdout } = await execFileAsync(
          'python3',
          [inferScript, req.file.path, String(modelConf), String(iouThreshold), String(inferImgsz), selectedModel.path],
          { timeout: 90000, maxBuffer: 1024 * 1024 * 10 }
        );
        const localResult = JSON.parse(stdout.trim());
        if (localResult.success) {
          usedLocalModel = true;
          imageWidth = localResult.image_width || imageWidth;
          imageHeight = localResult.image_height || imageHeight;
          result = parseLocalModelResponse(localResult, imagePath, brickLengthMm, imageWidth, imageHeight);

          // 标注图 URL（Python 保存到上传目录同名 _annotated 文件）
          if (localResult.annotated_image_path) {
            const annotatedFilename = path.basename(localResult.annotated_image_path);
            result.annotatedImageUrl = `/uploads/single/${annotatedFilename}`;
          }
          // 坐标 TXT 内容（参考格式）
          if (localResult.coord_txt_content) {
            result.coordTxtContent = localResult.coord_txt_content;
          }
          result.modelInfo = {
            ...result.modelInfo,
            name: selectedModel.name,
            version: selectedModel.file,
            platform: localResult.engine === 'ultralytics' ? '本地PyTorch推理' : '本地ONNX推理'
          };
          result.selectedModel = {
            id: selectedModel.id,
            name: selectedModel.name,
            file: selectedModel.file,
            type: selectedModel.type
          };
          result.inferenceParams = { modelConf, iouThreshold, inferImgsz, modelId: selectedModel.id };
          console.log(`[Detect] Python子进程推理完成，模型=${selectedModel.file}，检出 ${result.totalDetections} 处病害 (conf=${modelConf} iou=${iouThreshold} imgsz=${inferImgsz})`);
        }
      } catch (localErr) {
        console.error('[Detect] Python推理失败:');
        console.error('  message:', localErr.message);
        if (localErr.stderr) console.error('  stderr:', String(localErr.stderr).slice(0, 800));
        if (localErr.stdout) console.error('  stdout:', String(localErr.stdout).slice(0, 400));
        if (localErr.code) console.error('  exit code:', localErr.code);
        if (localErr.signal) console.error('  signal:', localErr.signal);
      }
    }

    // 模型推理失败时直接返回错误，不使用演示数据
    if (!result) {
      return res.json({
        code: 500,
        message: '模型推理失败，请检查服务器日志',
        data: null
      });
    }

    result.isDemo = isDemo;
    result.inferenceParams = result.inferenceParams || { modelConf, iouThreshold, inferImgsz, modelId: selectedModel.id };

    result.brickLengthMm = brickLengthMm;

    // 保存检测历史记录
    try {
      const diseaseTypes = [...new Set((result.detections || []).map(d => d.class))];
      addHistoryRecord({
        projectName: req.body.projectName || '单图检测',
        imageName: req.file.originalname,
        wallSize: `${imageWidth}x${imageHeight}`,
        diseaseTypes,
        diseaseCount: result.totalDetections || 0,
        resultImageUrl: imagePath,
        reportUrl: null
      });
    } catch (histErr) {
      console.error('保存历史记录失败:', histErr.message);
    }

    // 记录操作日志
    try {
      const username = req.user?.username || '匿名';
      logAction({
        username,
        logType: 'DETECTION',
        operation: `上传图片 ${req.file.originalname} 进行病害检测，检出 ${result.totalDetections || 0} 处病害`,
        ipAddress: req.ip || req.connection.remoteAddress,
        status: 'success',
        message: usedLocalModel ? '使用本地YOLOv11模型' : (paiApiUrl ? '使用PAI模型' : '演示模式'),
        requestUrl: '/api/detect',
        requestMethod: 'POST'
      });
    } catch (logErr) {
      console.error('记录日志失败:', logErr.message);
    }

    res.json(result);
  } catch (error) {
    console.error('Detection error:', error);
    res.status(500).json({ success: false, message: '检测失败: ' + error.message });
  }
});

// 工程量单价估算（元/m² 或 元/处）
const REPAIR_UNIT_COSTS = {
  '风化': { unit: 'm²', lightCost: 80, mediumCost: 150, severeCost: 280 },
  '泛碱': { unit: 'm²', lightCost: 60, mediumCost: 120, severeCost: 200 },
  '裂缝': { unit: '处', lightCost: 50, mediumCost: 150, severeCost: 350 },
  '植物附着': { unit: '处', lightCost: 100, mediumCost: 250, severeCost: 500 },
  '缺损': { unit: '处', lightCost: 80, mediumCost: 200, severeCost: 400 }
};

app.post('/api/report/generate', (req, res) => {
  try {
    const { detectionResult } = req.body;
    if (!detectionResult) {
      return res.status(400).json({ success: false, message: '缺少检测结果数据' });
    }

    const { summary, timestamp, imagePath, totalDetections, detections, brickLengthMm } = detectionResult;

    // 网格病害分析
    const gridAnalysis = {};
    (detections || []).forEach(det => {
      const gridId = det.gridId || 'G1-1';
      if (!gridAnalysis[gridId]) {
        gridAnalysis[gridId] = { total: 0, diseases: {}, severity: '轻度', priority: 3 };
      }
      gridAnalysis[gridId].total++;
      gridAnalysis[gridId].diseases[det.class] = (gridAnalysis[gridId].diseases[det.class] || 0) + 1;
      
      // 更新网格严重程度
      const severityOrder = { '轻度': 1, '中度': 2, '重度': 3 };
      if (severityOrder[det.severity] > severityOrder[gridAnalysis[gridId].severity]) {
        gridAnalysis[gridId].severity = det.severity;
        gridAnalysis[gridId].priority = 4 - severityOrder[det.severity]; // 1=最高优先级
      }
    });

    // 按优先级排序网格
    const sortedGrids = Object.entries(gridAnalysis)
      .map(([id, data]) => ({ gridId: id, ...data }))
      .sort((a, b) => a.priority - b.priority);

    const diseaseDetails = [];
    const allDiseases = ['风化', '泛碱', '裂缝', '植物附着', '缺损'];
    allDiseases.forEach(disease => {
      const data = summary[disease];
      const recommendation = REPAIR_RECOMMENDATIONS[disease];
      const unitCost = REPAIR_UNIT_COSTS[disease];

      diseaseDetails.push({
        name: disease,
        color: DISEASE_COLORS[disease],
        detected: !!data,
        count: data ? data.count : 0,
        totalArea: data ? (data.totalArea || null) : null,
        maxSeverity: data ? data.maxSeverity : '-',
        estimatedCost: null,
        quantity: data ? (unitCost.unit === 'm²' ? data.totalArea : data.count) : 0,
        unit: unitCost.unit,
        ...recommendation
      });
    });

    const totalDiseaseTypes = Object.keys(summary || {}).length;
    let overallRisk = '低风险';
    if (totalDetections > 6 || totalDiseaseTypes >= 4) overallRisk = '高风险';
    else if (totalDetections > 3 || totalDiseaseTypes >= 2) overallRisk = '中风险';

    const weatheringArea = summary?.['风化'] ? summary['风化'].totalArea : 0;
    const efflorescenceArea = summary?.['泛碱'] ? summary['泛碱'].totalArea : 0;

    const report = {
      title: '红砖墙病害检测修缮报告',
      generatedAt: new Date().toISOString(),
      detectionTime: timestamp,
      imagePath,
      brickLengthMm: brickLengthMm || 240,
      professionalNote: '基于专业级病害阈值法，已滤除历史自然纹理干扰',
      overallAssessment: {
        totalDiseaseTypes,
        totalDetections,
        overallRisk,
        weatheringArea: weatheringArea.toFixed(2),
        efflorescenceArea: efflorescenceArea.toFixed(2),
        totalEstimatedCost: null,
        recommendation: overallRisk === '高风险'
          ? '建议立即开展修缮工作，优先处理严重病害区域'
          : overallRisk === '中风险'
            ? '建议尽快制定修缮计划，定期监测病害发展'
            : '建议定期巡检，做好预防性维护'
      },
      gridAnalysis: sortedGrids,
      diseaseDetails,
      repairPlan: {
        urgentItems: diseaseDetails.filter(d => d.detected && d.maxSeverity === '重度'),
        importantItems: diseaseDetails.filter(d => d.detected && d.maxSeverity === '中度'),
        routineItems: diseaseDetails.filter(d => d.detected && d.maxSeverity === '轻度')
      }
    };

    res.json({ success: true, report });
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ success: false, message: '报告生成失败' });
  }
});

// ===================== AI 智能分析 API =====================

/**
 * 调用 AI 大模型进行智能分析
 * 优先级: PAI_LLM > SiliconFlow > 规则引擎
 */
async function callAIModel(prompt, systemPrompt = '') {
  const paiLlmUrl = process.env.PAI_LLM_URL;
  const paiLlmToken = process.env.PAI_LLM_TOKEN;
  const siliconflowUrl = process.env.SILICONFLOW_URL;
  const siliconflowKey = process.env.SILICONFLOW_KEY;
  const siliconflowModel = process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3-8B';

  // 优先使用 PAI LLM
  if (paiLlmUrl && paiLlmToken) {
    try {
      const response = await fetch(paiLlmUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${paiLlmToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [
            { role: 'system', content: systemPrompt || '你是一位专业的建筑病害分析专家。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });
      if (response.ok) {
        const data = await response.json();
        return { 
          success: true, 
          content: data.choices?.[0]?.message?.content || '',
          provider: 'PAI-LLM'
        };
      }
    } catch (e) {
      console.error('PAI LLM 调用失败:', e.message);
    }
  }

  // 回退到 SiliconFlow
  if (siliconflowUrl && siliconflowKey) {
    try {
      const response = await fetch(siliconflowUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${siliconflowKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: siliconflowModel,
          messages: [
            { role: 'system', content: systemPrompt || '你是一位专业的建筑病害分析专家。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return { 
          success: true, 
          content: data.choices?.[0]?.message?.content || '',
          provider: 'SiliconFlow'
        };
      } else {
        const errorText = await response.text();
        console.error('SiliconFlow API 错误:', response.status, errorText);
      }
    } catch (e) {
      console.error('SiliconFlow 调用失败:', e.message);
    }
  }

  // 都失败则返回空
  return { success: false, content: '', provider: 'none' };
}

/**
 * AI 智能分析接口 - 根据检测结果生成专业分析
 */
app.post('/api/ai/analyze', async (req, res) => {
  try {
    const { detectionResult, analysisType = 'comprehensive' } = req.body;
    
    if (!detectionResult) {
      return res.status(400).json({ success: false, message: '缺少检测结果数据' });
    }

    const { summary, totalDetections, detections } = detectionResult;
    
    // 构建分析提示词
    const diseaseList = Object.entries(summary || {})
      .map(([name, data]) => `- ${name}: ${data.count}处, 最高严重程度: ${data.maxSeverity}${data.totalArea ? `, 总面积约${data.totalArea.toFixed(2)}m²` : ''}`)
      .join('\n');

    let prompt = '';
    let systemPrompt = '你是一位拥有20年经验的古建筑保护专家和结构工程师，擅长红砖墙病害诊断与修缮方案制定。请用专业但易懂的语言回答。';

    switch (analysisType) {
      case 'cause':
        prompt = `基于以下红砖墙病害检测结果，请分析可能的病害成因：

检测到 ${totalDetections} 处病害：
${diseaseList}

请从以下角度分析：
1. 环境因素（气候、湿度、温差等）
2. 材料因素（砖体质量、砂浆配比等）
3. 结构因素（荷载、沉降、应力等）
4. 人为因素（使用不当、维护缺失等）

请给出专业的成因分析，每个病害类型单独分析。`;
        break;

      case 'repair':
        prompt = `基于以下红砖墙病害检测结果，请制定详细的修缮方案：

检测到 ${totalDetections} 处病害：
${diseaseList}

请提供：
1. 修缮优先级排序及理由
2. 每种病害的具体修缮工艺步骤
3. 推荐使用的材料及规格
4. 施工注意事项
5. 预计工期估算`;
        break;

      case 'prevention':
        prompt = `基于以下红砖墙病害检测结果，请提供预防性维护建议：

检测到 ${totalDetections} 处病害：
${diseaseList}

请提供：
1. 日常巡检要点
2. 季节性维护措施
3. 环境改善建议
4. 长期保护策略`;
        break;

      case 'comprehensive':
      default:
        prompt = `请对以下红砖墙病害检测结果进行综合专业分析：

检测到 ${totalDetections} 处病害：
${diseaseList}

请提供：
1. 整体病害评估（100字以内）
2. 主要风险点（列出3-5个关键风险）
3. 紧急处理建议（需要立即处理的事项）
4. 修缮优先级建议
5. 预防措施建议

请用专业但简洁的语言回答，适合写入正式报告。`;
        break;
    }

    const aiResult = await callAIModel(prompt, systemPrompt);

    if (aiResult.success && aiResult.content) {
      res.json({
        success: true,
        analysis: aiResult.content,
        provider: aiResult.provider,
        analysisType,
        timestamp: new Date().toISOString()
      });
    } else {
      // AI 不可用时，使用规则引擎生成基础分析
      const fallbackAnalysis = generateRuleBasedAnalysis(summary, totalDetections);
      res.json({
        success: true,
        analysis: fallbackAnalysis,
        provider: 'rule-engine',
        analysisType,
        timestamp: new Date().toISOString(),
        note: 'AI 服务暂不可用，已使用规则引擎生成分析'
      });
    }
  } catch (error) {
    console.error('AI Analysis error:', error);
    res.status(500).json({ success: false, message: 'AI 分析失败: ' + error.message });
  }
});

/**
 * AI 对话接口 - 支持用户追问
 */
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, message: '请输入问题' });
    }

    const systemPrompt = `你是红砖墙病害智能检测系统的 AI 助手。你拥有丰富的古建筑保护、砖石结构病害诊断、修缮工艺方面的专业知识。

${context ? `当前检测上下文：${JSON.stringify(context)}` : ''}

请用专业但易懂的语言回答用户问题。如果问题超出你的专业范围，请诚实说明。`;

    const aiResult = await callAIModel(message, systemPrompt);

    if (aiResult.success) {
      res.json({
        success: true,
        reply: aiResult.content,
        provider: aiResult.provider,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: true,
        reply: '抱歉，AI 服务暂时不可用。您可以查看系统生成的规则分析报告，或稍后再试。',
        provider: 'fallback',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('AI Chat error:', error);
    res.status(500).json({ success: false, message: 'AI 对话失败: ' + error.message });
  }
});

/**
 * 规则引擎生成基础分析（AI 不可用时的回退方案）
 */
function generateRuleBasedAnalysis(summary, totalDetections) {
  const diseases = Object.entries(summary || {});
  if (diseases.length === 0) {
    return '未检测到明显病害，建议定期巡检以预防潜在问题。';
  }

  let analysis = `## 病害检测分析报告\n\n`;
  analysis += `### 一、整体评估\n`;
  analysis += `本次检测共发现 **${totalDetections}** 处病害，涉及 **${diseases.length}** 种类型。`;
  
  const hasSevere = diseases.some(([_, d]) => d.maxSeverity === '重度');
  const hasMedium = diseases.some(([_, d]) => d.maxSeverity === '中度');
  
  if (hasSevere) {
    analysis += `存在重度病害，建议**立即**安排专业人员现场勘查并制定修缮方案。\n\n`;
  } else if (hasMedium) {
    analysis += `存在中度病害，建议**尽快**制定修缮计划，避免病害进一步发展。\n\n`;
  } else {
    analysis += `病害程度较轻，建议做好日常维护，定期监测病害发展。\n\n`;
  }

  analysis += `### 二、病害详情\n`;
  diseases.forEach(([name, data]) => {
    analysis += `\n**${name}**：检测到 ${data.count} 处，最高严重程度为${data.maxSeverity}`;
    if (data.totalArea) {
      analysis += `，总面积约 ${data.totalArea.toFixed(2)} m²`;
    }
    analysis += `。\n`;
    
    // 添加基础建议
    const recommendations = {
      '风化': '建议清理松散物后涂刷防护剂，严重处需更换砖块。',
      '泛碱': '建议清洗表面盐类结晶，做好防水处理，改善通风条件。',
      '裂缝': '建议监测裂缝发展，使用灌浆或密封材料修补。',
      '植物附着': '建议彻底清除植物及根系，处理受损砖缝，涂刷防霉防蔓延处理。',
      '缺损': '建议使用同材质砖块修补或更换，确保结构完整性。'
    };
    analysis += `- ${recommendations[name] || '建议咨询专业人员制定修缮方案。'}\n`;
  });

  analysis += `\n### 三、后续建议\n`;
  analysis += `1. 建立病害档案，定期复检对比\n`;
  analysis += `2. 优先处理结构性病害（裂缝、植物附着）\n`;
  analysis += `3. 改善排水和通风条件\n`;
  analysis += `4. 选用与原材料相容的修缮材料\n`;

  return analysis;
}

/**
 * 获取 AI 服务状态
 */
app.get('/api/ai/status', (_req, res) => {
  const paiLlmConfigured = !!(process.env.PAI_LLM_URL && process.env.PAI_LLM_TOKEN);
  const siliconflowConfigured = !!(process.env.SILICONFLOW_URL && process.env.SILICONFLOW_KEY);
  
  res.json({
    success: true,
    aiServices: {
      paiLlm: {
        configured: paiLlmConfigured,
        priority: 1,
        description: '阿里云 PAI 大模型（生产环境）'
      },
      siliconflow: {
        configured: siliconflowConfigured,
        model: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3-8B',
        priority: 2,
        description: 'SiliconFlow API（测试环境）'
      },
      ruleEngine: {
        configured: true,
        priority: 3,
        description: '规则引擎（兜底方案）'
      }
    },
    activeProvider: paiLlmConfigured ? 'PAI-LLM' : (siliconflowConfigured ? 'SiliconFlow' : 'rule-engine')
  });
});

// ===================== 立面普查 API =====================

// --- 立面任务 JSON 持久化 ---
function getFacadeJobPath(jobId) {
  return path.join(__dirname, 'data/facade-jobs', `${jobId}.json`);
}

function saveFacadeJob(job) {
  job.updatedAt = new Date().toISOString();
  fs.writeFileSync(getFacadeJobPath(job.jobId), JSON.stringify(job, null, 2), 'utf-8');
}

function loadFacadeJob(jobId) {
  const jobPath = getFacadeJobPath(jobId);
  if (!fs.existsSync(jobPath)) return null;
  return JSON.parse(fs.readFileSync(jobPath, 'utf-8'));
}

// --- 立面任务数据结构 ---
function createFacadeJobRecord(params) {
  const now = new Date().toISOString();
  return {
    jobId: params.jobId,
    projectName: params.projectName || '静安别墅红砖墙立面普查',
    wallName: params.wallName || '静安别墅矮墙立面',
    sourceImagePath: params.sourceImagePath,
    sourceImageUrl: params.sourceImageUrl,
    imageWidth: params.imageWidth,
    imageHeight: params.imageHeight,
    wallWidthM: params.wallWidthM,
    wallHeightM: params.wallHeightM,
    pixelToMeterX: params.wallWidthM / params.imageWidth,
    pixelToMeterY: params.wallHeightM / params.imageHeight,
    gridSizeM: params.gridSizeM || 1,
    tileSize: params.tileSize || 1280,
    overlapRatio: params.overlapRatio || 0.15,
    status: 'uploaded',
    progress: 0,
    tiles: [],
    detections: [],
    grids: [],
    summary: {},
    createdAt: now,
    updatedAt: now
  };
}

// --- 大图切片 ---
async function createFacadeTiles(job) {
  const tileRecords = [];
  const tileSize = job.tileSize;
  const overlap = Math.floor(tileSize * job.overlapRatio);
  const step = tileSize - overlap;
  let rowIndex = 0;

  for (let y = 0; y < job.imageHeight; y += step) {
    let colIndex = 0;
    for (let x = 0; x < job.imageWidth; x += step) {
      const cropWidth = Math.min(tileSize, job.imageWidth - x);
      const cropHeight = Math.min(tileSize, job.imageHeight - y);
      if (cropWidth <= 0 || cropHeight <= 0) continue;

      const tileId = `${job.jobId}_r${rowIndex}_c${colIndex}`;
      const tileFilename = `${tileId}.jpg`;
      const tilePath = path.join(__dirname, 'uploads/tiles', tileFilename);

      await sharp(job.sourceImagePath)
        .extract({ left: x, top: y, width: cropWidth, height: cropHeight })
        .jpeg({ quality: 92 })
        .toFile(tilePath);

      tileRecords.push({
        tileId, rowIndex, colIndex,
        offsetX: x, offsetY: y,
        width: cropWidth, height: cropHeight,
        tilePath, tileUrl: `/uploads/tiles/${tileFilename}`,
        status: 'created'
      });
      colIndex += 1;
    }
    rowIndex += 1;
  }
  return tileRecords;
}

// --- PAI 分片检测 ---
async function callPaiForTile(tilePath) {
  const paiApiUrl = process.env.PAI_API_URL;
  const paiApiToken = process.env.PAI_API_TOKEN;

  if (!paiApiUrl || !paiApiToken) {
    return generateDemoPaiTileResult();
  }

  const imageBuffer = fs.readFileSync(tilePath);
  const base64Image = imageBuffer.toString('base64');

  const response = await fetch(paiApiUrl, {
    method: 'POST',
    headers: { Authorization: paiApiToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image })
  });

  if (!response.ok) throw new Error(`PAI API error: ${response.status}`);
  return await response.json();
}

function generateDemoPaiTileResult() {
  return {
    detections: [
      { class: '裂缝', confidence: 0.91, bbox: [120, 160, 240, 36], polygon: [[120,160],[360,166],[358,196],[122,190]] },
      { class: '泛碱', confidence: 0.87, bbox: [520, 300, 180, 130], polygon: [[520,300],[700,310],[690,430],[530,420]] }
    ]
  };
}

// --- 病害类别归一化 ---
function normalizeDiseaseClass(rawClass) {
  const classMap = {
    0: '裂缝', 1: '缺损', 2: '植物附着', 3: '风化', 4: '泛碱',
    weathering: '风化', efflorescence: '泛碱', crack: '裂缝', spalling: '植物附着', missing: '缺损',
    '风化': '风化', '泛碱': '泛碱', '裂缝': '裂缝', '植物附着': '植物附着', '缺损': '缺损'
  };
  return classMap[rawClass] || String(rawClass);
}

// --- 多边形面积 ---
function polygonArea(points) {
  if (!points || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

// --- 切片坐标回填到整墙坐标 ---
function mapTileDetectionToGlobal(det, tile, job) {
  const bbox = det.bbox || det.box || [0, 0, 0, 0];
  const globalBbox = [bbox[0] + tile.offsetX, bbox[1] + tile.offsetY, bbox[2], bbox[3]];

  const polygon = det.polygon || det.maskPolygon || [
    [bbox[0], bbox[1]], [bbox[0] + bbox[2], bbox[1]],
    [bbox[0] + bbox[2], bbox[1] + bbox[3]], [bbox[0], bbox[1] + bbox[3]]
  ];
  const globalPolygon = polygon.map(point => ({
    x: point[0] + tile.offsetX,
    y: point[1] + tile.offsetY
  }));

  const areaPx = polygonArea(globalPolygon);
  const areaM2 = areaPx * job.pixelToMeterX * job.pixelToMeterY;

  return {
    id: det.id,
    tileId: tile.tileId,
    class: normalizeDiseaseClass(det.class ?? det.label ?? det.category),
    confidence: Number(det.confidence ?? det.score ?? 0),
    localBbox: bbox,
    globalBbox,
    globalPolygon,
    areaPx,
    areaM2: Number(areaM2.toFixed(4)),
    sourceTileUrl: tile.tileUrl
  };
}

// --- 检测框中心点 ---
function getDetectionCenter(bbox) {
  return { x: bbox[0] + bbox[2] / 2, y: bbox[1] + bbox[3] / 2 };
}

// --- 1m × 1m 网格聚合 ---
function buildFacadeGrid(job, detections) {
  const cols = Math.ceil(job.wallWidthM / job.gridSizeM);
  const rows = Math.ceil(job.wallHeightM / job.gridSizeM);
  const gridMap = new Map();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gridId = `R${row + 1}-C${col + 1}`;
      gridMap.set(gridId, {
        gridId, row, col,
        xM: col * job.gridSizeM,
        yM: row * job.gridSizeM,
        widthM: Math.min(job.gridSizeM, job.wallWidthM - col * job.gridSizeM),
        heightM: Math.min(job.gridSizeM, job.wallHeightM - row * job.gridSizeM),
        totalCount: 0, totalAreaM2: 0, crackLengthM: 0,
        diseases: {}, detections: [], tileIds: [],
        intensity: 0
      });
    }
  }

  detections.forEach(det => {
    const center = getDetectionCenter(det.globalBbox);
    const centerXM = center.x * job.pixelToMeterX;
    const centerYM = center.y * job.pixelToMeterY;
    const col = Math.floor(centerXM / job.gridSizeM);
    const row = Math.floor(centerYM / job.gridSizeM);
    const gridId = `R${row + 1}-C${col + 1}`;
    const grid = gridMap.get(gridId);
    if (!grid) return;

    grid.totalCount += 1;
    grid.totalAreaM2 += det.areaM2 || 0;
    grid.diseases[det.class] = (grid.diseases[det.class] || 0) + 1;
    grid.detections.push(det.id);
    grid.tileIds.push(det.tileId);

    if (det.class === '裂缝') {
      const crackLengthPx = Math.max(det.globalBbox[2], det.globalBbox[3]);
      grid.crackLengthM += crackLengthPx * Math.max(job.pixelToMeterX, job.pixelToMeterY);
    }
  });

  const grids = Array.from(gridMap.values());
  const maxArea = Math.max(...grids.map(g => g.totalAreaM2), 0.0001);
  const maxCount = Math.max(...grids.map(g => g.totalCount), 1);

  grids.forEach(grid => {
    const areaScore = grid.totalAreaM2 / maxArea;
    const countScore = grid.totalCount / maxCount;
    grid.totalAreaM2 = Number(grid.totalAreaM2.toFixed(4));
    grid.crackLengthM = Number(grid.crackLengthM.toFixed(3));
    grid.tileIds = Array.from(new Set(grid.tileIds));
    grid.intensity = Number(Math.min(1, areaScore * 0.7 + countScore * 0.3).toFixed(3));
  });

  return grids;
}

// --- 整墙统计汇总 ---
function buildFacadeSummary(grids, detections) {
  const summary = {
    totalDetections: detections.length,
    totalAreaM2: 0,
    crackLengthM: 0,
    highRiskGridCount: 0,
    diseaseStats: {},
    keyRepairGrids: []
  };

  grids.forEach(grid => {
    summary.totalAreaM2 += grid.totalAreaM2;
    summary.crackLengthM += grid.crackLengthM;
    if (grid.intensity >= 0.65) {
      summary.highRiskGridCount += 1;
      summary.keyRepairGrids.push(grid.gridId);
    }
    Object.entries(grid.diseases).forEach(([name, count]) => {
      summary.diseaseStats[name] = (summary.diseaseStats[name] || 0) + count;
    });
  });

  summary.totalAreaM2 = Number(summary.totalAreaM2.toFixed(4));
  summary.crackLengthM = Number(summary.crackLengthM.toFixed(3));
  return summary;
}

// --- 全景大图上传接口 ---
app.post('/api/facade/upload', panoramaUpload.single('panorama'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传全景立面影像' });
    }

    const wallWidthM = Number(req.body.wallWidthM);
    const wallHeightM = Number(req.body.wallHeightM);
    const gridSizeM = Number(req.body.gridSizeM || 1);

    if (!wallWidthM || !wallHeightM || wallWidthM <= 0 || wallHeightM <= 0) {
      return res.status(400).json({ success: false, message: '请填写墙体实际宽度和高度，否则无法计算真实 m²' });
    }

    const jobId = uuidv4();
    const imageMeta = await sharp(req.file.path).metadata();

    const job = createFacadeJobRecord({
      jobId,
      projectName: req.body.projectName,
      wallName: req.body.wallName,
      sourceImagePath: req.file.path,
      sourceImageUrl: `/uploads/panoramas/${req.file.filename}`,
      imageWidth: imageMeta.width,
      imageHeight: imageMeta.height,
      wallWidthM, wallHeightM, gridSizeM,
      tileSize: Number(req.body.tileSize || 1280),
      overlapRatio: Number(req.body.overlapRatio || 0.15)
    });

    saveFacadeJob(job);

    res.json({
      success: true, jobId,
      status: job.status,
      sourceImageUrl: job.sourceImageUrl,
      imageWidth: job.imageWidth, imageHeight: job.imageHeight,
      wallWidthM: job.wallWidthM, wallHeightM: job.wallHeightM,
      gridSizeM: job.gridSizeM
    });
  } catch (error) {
    console.error('Facade upload error:', error);
    res.status(500).json({ success: false, message: '全景图上传失败: ' + error.message });
  }
});

// --- 立面分析接口 ---
app.post('/api/facade/analyze/:jobId', async (req, res) => {
  try {
    const job = loadFacadeJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: '立面任务不存在' });

    job.status = 'tiling';
    job.progress = 5;
    saveFacadeJob(job);

    const tiles = await createFacadeTiles(job);
    job.tiles = tiles;
    job.status = 'detecting';
    job.progress = 20;
    saveFacadeJob(job);

    const detections = [];
    let detectionId = 1;

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const paiResult = await callPaiForTile(tile.tilePath);
      const rawDetections = paiResult.detections || paiResult.results || [];

      rawDetections.forEach(raw => {
        const globalDetection = mapTileDetectionToGlobal({ ...raw, id: detectionId }, tile, job);
        if (['风化', '泛碱', '裂缝', '植物附着', '缺损'].includes(globalDetection.class)) {
          detections.push(globalDetection);
          detectionId += 1;
        }
      });

      tile.status = 'detected';
      job.progress = Math.round(20 + ((i + 1) / tiles.length) * 60);
      saveFacadeJob(job);
    }

    const grids = buildFacadeGrid(job, detections);
    const summary = buildFacadeSummary(grids, detections);

    job.status = 'finished';
    job.progress = 100;
    job.detections = detections;
    job.grids = grids;
    job.summary = summary;
    saveFacadeJob(job);

    // 对外只暴露 URL，不暴露服务器绝对路径
    const publicTiles = tiles.map(t => ({
      tileId: t.tileId, rowIndex: t.rowIndex, colIndex: t.colIndex,
      offsetX: t.offsetX, offsetY: t.offsetY,
      width: t.width, height: t.height,
      tileUrl: t.tileUrl, status: t.status
    }));

    res.json({
      success: true, jobId: job.jobId, status: job.status, progress: job.progress,
      sourceImageUrl: job.sourceImageUrl,
      imageWidth: job.imageWidth, imageHeight: job.imageHeight,
      wallWidthM: job.wallWidthM, wallHeightM: job.wallHeightM, gridSizeM: job.gridSizeM,
      totalTiles: tiles.length, totalDetections: detections.length,
      grids, detections, summary,
      tiles: publicTiles
    });
  } catch (error) {
    console.error('Facade analyze error:', error);
    res.status(500).json({ success: false, message: '立面普查分析失败: ' + error.message });
  }
});

// --- 查询立面任务 ---
app.get('/api/facade/job/:jobId', (req, res) => {
  const job = loadFacadeJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, message: '立面任务不存在' });
  res.json({ success: true, job });
});

// --- 预留"序列影像自动合成"接口 ---
app.post('/api/mosaic/submit', panoramaUpload.array('images', 80), async (req, res) => {
  try {
    const taskId = uuidv4();
    res.json({
      success: true, taskId, status: 'reserved',
      engine: 'MOSAIC_ENGINE_PLACEHOLDER',
      receivedImages: req.files ? req.files.length : 0,
      message: '序列影像自动合成接口已预留，当前版本采用 Reality Capture 离线生成正射影像后上传。'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '序列影像合成任务创建失败' });
  }
});

app.get('/api/mosaic/status/:taskId', (req, res) => {
  res.json({
    success: true, taskId: req.params.taskId, status: 'reserved', progress: 0,
    message: '该接口为预留扩展点，当前版本暂不执行云端拼接。'
  });
});

// ===================== 后端软质检 API =====================
/**
 * 拍摄质量初筛（对应三步法快速查勘指南后端逻辑）
 * 返回亮度、模糊度、分辨率、砖块密度估算等指标，并给出引导建议
 */
app.post('/api/quality-check', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传待检测图片' });
    }

    const meta = await sharp(req.file.path).metadata();
    const imageWidth = meta.width || 0;
    const imageHeight = meta.height || 0;

    // 缩到 200px 提速
    const sample = await sharp(req.file.path)
      .resize({ width: 200, fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const buf = sample.data;
    const w = sample.info.width;
    const h = sample.info.height;

    // 亮度：灰度均值
    let total = 0;
    for (let i = 0; i < buf.length; i++) total += buf[i];
    const brightness = total / buf.length;

    // 模糊度：拉普拉斯方差
    let lapSum = 0;
    let lapSqSum = 0;
    let lapCount = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap = buf[idx - w] + buf[idx + w] + buf[idx - 1] + buf[idx + 1] - 4 * buf[idx];
        lapSum += lap;
        lapSqSum += lap * lap;
        lapCount += 1;
      }
    }
    const lapMean = lapSum / lapCount;
    const blurVar = lapSqSum / lapCount - lapMean * lapMean;
    const blurScore = Math.sqrt(Math.max(blurVar, 0));

    // 砖块密度估算（粗略）：通过水平梯度峰值估算横向砖块数
    let edgePixels = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 1; x < w; x++) {
        const idx = y * w + x;
        if (Math.abs(buf[idx] - buf[idx - 1]) > 24) edgePixels += 1;
      }
    }
    const edgeDensity = edgePixels / (w * h);
    // 经验：理想 10 块砖时 edgeDensity ~ 0.04-0.10
    const estimatedBricks = Math.max(2, Math.round(edgeDensity * 220));

    let warning = null;
    let warningType = null;
    let suggestion = null;

    if (brightness < 50) {
      warning = '光线太暗，可能漏检病害';
      warningType = 'brightness';
      suggestion = '请开启闪光灯或换个时段拍摄，确保光线均匀';
    } else if (brightness > 220) {
      warning = '光线过强 / 过曝，可能误检阴影为裂缝';
      warningType = 'brightness';
      suggestion = '请避开强光直射，选择阴天或早晚时段拍摄';
    } else if (blurScore < 5) {
      warning = '检测到画面模糊';
      warningType = 'blur';
      suggestion = '请拿稳手机，对焦清晰后重新拍摄';
    } else if (estimatedBricks > 30) {
      warning = '距离太远，砖块过密';
      warningType = 'distance';
      suggestion = '请靠近 1-2 米再拍，让画面横向装下约 10 块红砖';
    } else if (imageWidth < 800 || imageHeight < 600) {
      warning = '图片分辨率较低';
      warningType = 'resolution';
      suggestion = '建议使用更高分辨率拍摄，确保砖块纹理清晰可见';
    }

    res.json({
      success: true,
      brightness: Number(brightness.toFixed(2)),
      blur: Number(blurScore.toFixed(2)),
      resolution: { width: imageWidth, height: imageHeight },
      estimatedBricks,
      warning, warningType, suggestion,
      passed: warning === null
    });
  } catch (error) {
    console.error('Quality check error:', error);
    res.status(500).json({ success: false, message: '图片质检失败: ' + error.message });
  }
});

// ===================== 整墙立面修缮报告 =====================
/**
 * 基于立面任务的整墙汇总报告（与单图 /api/report/generate 区分）
 */
app.get('/api/facade/report/:jobId', (req, res) => {
  try {
    const job = loadFacadeJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: '立面任务不存在' });
    if (job.status !== 'finished') {
      return res.status(400).json({ success: false, message: '立面任务尚未完成 AI 诊断，无法生成整墙报告' });
    }

    const { grids, summary, detections } = job;
    const wallAreaM2 = job.wallWidthM * job.wallHeightM;
    const damageRatio = wallAreaM2 > 0 ? summary.totalAreaM2 / wallAreaM2 : 0;

    let overallRisk = '低风险';
    if (summary.highRiskGridCount > 4 || damageRatio > 0.15) overallRisk = '高风险';
    else if (summary.highRiskGridCount > 1 || damageRatio > 0.05) overallRisk = '中风险';

    const sortedGrids = [...grids]
      .filter(g => g.totalCount > 0)
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 12);

    const diseaseDetails = ['风化', '泛碱', '裂缝', '植物附着', '缺损'].map(name => {
      const count = summary.diseaseStats[name] || 0;
      const recommendation = REPAIR_RECOMMENDATIONS[name] || {};
      const unitCost = REPAIR_UNIT_COSTS[name] || { unit: 'm²', lightCost: 0, mediumCost: 0, severeCost: 0 };
      const totalArea = detections
        .filter(d => d.class === name)
        .reduce((sum, d) => sum + (d.areaM2 || 0), 0);
      let estimatedCost = 0;
      if (unitCost.unit === 'm²') {
        estimatedCost = Math.round(totalArea * (unitCost.mediumCost || 0));
      } else {
        estimatedCost = Math.round(count * (unitCost.mediumCost || 0));
      }
      return {
        name,
        color: DISEASE_COLORS[name],
        detected: count > 0,
        count,
        totalArea: Number(totalArea.toFixed(3)),
        unit: unitCost.unit,
        estimatedCost,
        ...recommendation
      };
    });

    const totalEstimatedCost = diseaseDetails.reduce((s, d) => s + d.estimatedCost, 0);

    res.json({
      success: true,
      report: {
        title: `${job.wallName || '红砖墙立面'}整墙修缮报告`,
        generatedAt: new Date().toISOString(),
        jobId: job.jobId,
        projectName: job.projectName,
        wallName: job.wallName,
        sourceImageUrl: job.sourceImageUrl,
        wallWidthM: job.wallWidthM,
        wallHeightM: job.wallHeightM,
        wallAreaM2: Number(wallAreaM2.toFixed(2)),
        gridSizeM: job.gridSizeM,
        overallAssessment: {
          totalDetections: summary.totalDetections,
          totalDamageAreaM2: summary.totalAreaM2,
          crackLengthM: summary.crackLengthM,
          highRiskGridCount: summary.highRiskGridCount,
          damageRatio: Number((damageRatio * 100).toFixed(2)),
          overallRisk,
          totalEstimatedCost,
          recommendation: overallRisk === '高风险'
            ? '建议立即开展整墙修缮，优先处理高风险网格'
            : overallRisk === '中风险'
              ? '建议尽快制定整墙修缮计划，定期监测病害发展'
              : '建议定期巡检，做好预防性维护'
        },
        keyRepairGrids: summary.keyRepairGrids,
        topGrids: sortedGrids,
        diseaseDetails
      }
    });
  } catch (error) {
    console.error('Facade report error:', error);
    res.status(500).json({ success: false, message: '整墙报告生成失败: ' + error.message });
  }
});

// Catch-all: serve frontend
app.get('*', (_req, res) => {
  const entryPath = path.join(distDir, 'entry.html');
  if (fs.existsSync(entryPath)) {
    res.sendFile(entryPath);
  } else {
    res.status(200).send(`
      <html><head><title>红砖墙病害检测系统</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px;">
        <h2>前端尚未构建</h2>
        <p>请运行 <code>npm run build</code> 后重新启动服务</p>
        <p>或使用 <code>npm run dev</code> 进入开发模式</p>
      </body></html>
    `);
  }
});

// 全局错误处理器（处理 Multer 上传错误，避免崩溃成 HTML）
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: '文件过大，全景图最大 200MB，单图最大 10MB' });
    }
    return res.status(400).json({ success: false, message: '上传失败：' + err.message });
  }
  if (err && err.message) {
    return res.status(400).json({ success: false, message: err.message });
  }
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧱  红砖墙病害智能检测系统 v1.0');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📡  服务地址: http://0.0.0.0:${PORT}`);
  console.log(`🔗  本地访问: http://localhost:${PORT}`);
  console.log(`🐛  调试模式: ${DEBUG_MODE ? '✅ 已开启（详细请求日志）' : '⚪ 关闭'}`);
  console.log(`📂  仓库根:   ${repoRoot}`);
  console.log(`📂  服务目录: ${runtimeBase}`);
  console.log('───────────────────────────────────────────────────────');
  console.log('📦  目标检测模型 (YOLOv11):');
  if (process.env.PAI_API_URL) {
    console.log(`    ✅ PAI EAS: ${process.env.PAI_API_URL}`);
  } else {
    console.log('    ⚠️  未配置，使用演示模式');
  }
  console.log('───────────────────────────────────────────────────────');
  console.log('🤖  AI 大模型服务:');
  if (process.env.PAI_LLM_URL) {
    console.log('    ✅ PAI LLM: 已配置（优先级 1）');
  }
  if (process.env.SILICONFLOW_URL && process.env.SILICONFLOW_KEY) {
    console.log(`    ✅ SiliconFlow: ${process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3-8B'}（优先级 2）`);
  }
  if (!process.env.PAI_LLM_URL && !process.env.SILICONFLOW_KEY) {
    console.log('    ⚠️  未配置，使用规则引擎');
  }
  console.log('───────────────────────────────────────────────────────');
  console.log('📚  API 端点:');
  console.log('    POST /api/detect              - 单图病害检测');
  console.log('    POST /api/report/generate     - 生成报告');
  console.log('    POST /api/ai/analyze          - AI 智能分析');
  console.log('    POST /api/ai/chat             - AI 对话');
  console.log('    GET  /api/ai/status           - AI 服务状态');
  console.log('    POST /api/quality-check       - 拍摄质量初筛');
  console.log('    POST /api/facade/upload       - 立面全景上传');
  console.log('    POST /api/facade/analyze/:id  - 立面普查分析');
  console.log('    GET  /api/facade/job/:id      - 查询立面任务');
  console.log('    GET  /api/facade/report/:id   - 整墙修缮报告');
  console.log('    GET  /api/health              - 健康检查');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
});
