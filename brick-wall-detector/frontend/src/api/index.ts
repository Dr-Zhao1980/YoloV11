/**
 * API 服务层 - 前后端分离接口封装
 * 统一管理所有后端 API 调用
 */
import axios from 'axios'

// 创建 axios 实例
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 120000,
})

// 请求拦截器：自动附带 access_token；FormData 由浏览器自动设置 boundary
api.interceptors.request.use(
  (config) => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }
    if (config.data instanceof FormData) {
      config.headers = config.headers || {}
      delete config.headers['Content-Type']
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    if (!error.response) {
      const hint = error.code === 'ECONNABORTED'
        ? '请求超时，请检查网络或缩小图片后重试'
        : '无法连接后端服务，请确认已运行 npm start（默认端口 3080）'
      return Promise.reject(new Error(hint))
    }
    const message = error.response?.data?.message || error.message || '请求失败'
    return Promise.reject(new Error(message))
  }
)

// ==================== 类型定义 ====================

export interface Detection {
  id: number
  class: string
  rawClassName?: string
  confidence: number
  bbox: number[]
  /** 实例分割多边形顶点 [[x,y], ...]（原图像素坐标） */
  polygon?: number[][] | null
  area: number | null
  severity: string
  gridId?: string
}

export interface SummaryItem {
  count: number
  totalArea: number
  maxSeverity: string
  items: Detection[]
}

export interface ModelParams {
  modelConf: number
  iouThreshold: number
  imageSize: number
  modelId?: string
}

export interface AvailableModel {
  id: string
  name: string
  label?: string
  file: string
  type: string
  version?: string | null
  description?: string
  size: number
  updatedAt: string
  recommended?: boolean
}

export interface DetectionResult {
  success: boolean
  imagePath: string
  imageWidth: number
  imageHeight: number
  totalDetections: number
  detections: Detection[]
  summary: Record<string, SummaryItem>
  timestamp: string
  modelInfo: {
    name: string
    version: string
    platform: string
  }
  brickLengthMm?: number
  note?: string
  annotatedImageUrl?: string
  coordTxtContent?: string
  isDemo?: boolean
  selectedModel?: Pick<AvailableModel, 'id' | 'name' | 'file' | 'type'>
  inferenceParams?: { modelConf: number; iouThreshold: number; inferImgsz: number; modelId?: string }
}

export interface Report {
  title: string
  generatedAt: string
  detectionTime: string
  imagePath: string
  brickLengthMm: number
  professionalNote: string
  overallAssessment: {
    totalDiseaseTypes: number
    totalDetections: number
    overallRisk: string
    weatheringArea: string
    efflorescenceArea: string
    recommendation: string
  }
  gridAnalysis: Array<{
    gridId: string
    total: number
    diseases: Record<string, number>
    severity: string
    priority: number
  }>
  diseaseDetails: Array<{
    name: string
    color: string
    detected: boolean
    count: number
    totalArea: number | null
    maxSeverity: string
    description: string
    severity: string
    repairMethod: string[]
    materials: string
    preventionMeasures: string
  }>
  repairPlan: {
    urgentItems: any[]
    importantItems: any[]
    routineItems: any[]
  }
}

export interface AIAnalysisResult {
  success: boolean
  analysis: string
  provider: string
  analysisType: string
  timestamp: string
  note?: string
}

export interface AIChatResult {
  success: boolean
  reply: string
  provider: string
  timestamp: string
}

export interface AIServiceStatus {
  success: boolean
  aiServices: {
    paiLlm: {
      configured: boolean
      priority: number
      description: string
    }
    siliconflow: {
      configured: boolean
      model: string
      priority: number
      description: string
    }
    ruleEngine: {
      configured: boolean
      priority: number
      description: string
    }
  }
  activeProvider: string
}

export interface QueueProgress {
  status: string
  position?: number
  progress?: number
  message?: string
  tilesProcessed?: number
  tilesTotal?: number
  cancelled?: boolean
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ==================== API 方法 ====================

/**
 * 健康检查
 */
export async function checkHealth(): Promise<{ status: string; timestamp: string }> {
  return api.get('/health')
}

export async function getModels(): Promise<{ success: boolean; models: AvailableModel[] }> {
  return api.get('/models')
}

export async function getUploadLimits(): Promise<{
  success: boolean
  singleMaxMb: number
  facadeMaxMb: number
}> {
  return api.get('/upload-limits')
}

export async function getAppConfig(): Promise<{
  success: boolean
  enableHeatmap: boolean
  enableAutoReport: boolean
}> {
  return api.get('/app-config')
}

export async function getModelDefaults(): Promise<{
  success: boolean
  modelConf: number
  iouThreshold: number
  inferImageSize?: number
  modelId?: string | null
}> {
  return api.get('/model-defaults')
}

/**
 * 病害检测
 * @param imageFile 图片文件
 * @param brickLengthMm 参考砖长度（mm）
 * @param modelParams 模型推理参数
 */
export async function detectDisease(
  imageFile: File,
  brickLengthMm: number = 240,
  modelParams?: Partial<ModelParams>,
  onProgress?: (info: QueueProgress) => void
): Promise<DetectionResult> {
  const formData = new FormData()
  formData.append('image', imageFile)
  formData.append('brickLengthMm', String(brickLengthMm))
  if (modelParams?.modelConf !== undefined) formData.append('modelConf', String(modelParams.modelConf))
  if (modelParams?.iouThreshold !== undefined) formData.append('iouThreshold', String(modelParams.iouThreshold))
  if (modelParams?.imageSize !== undefined) formData.append('imageSize', String(modelParams.imageSize))
  if (modelParams?.modelId) formData.append('modelId', modelParams.modelId)

  const fileMb = imageFile.size / (1024 * 1024)
  const uploadTimeout = Math.min(600000, Math.max(120000, Math.ceil(fileMb * 5000)))

  const initial: any = await api.post('/detect', formData, {
    timeout: uploadTimeout,
  })
  if (!initial?.jobId) return initial as DetectionResult

  onProgress?.({ status: initial.status, position: initial.position, message: initial.message })
  if (initial.status === 'done') return initial.result

  for (let i = 0; i < 240; i++) {
    await sleep(1500)
    const poll: any = await api.get(`/detect/${initial.jobId}/status`)
    onProgress?.({ status: poll.status, position: poll.position, message: poll.message })
    if (poll.status === 'done') return poll.result as DetectionResult
    if (poll.status === 'error') throw new Error(poll.error || '推理失败')
  }
  throw new Error('检测超时（6分钟），请重试')
}

/**
 * 生成修缮报告
 * @param detectionResult 检测结果
 */
export async function generateReport(
  detectionResult: DetectionResult
): Promise<{ success: boolean; report: Report }> {
  return api.post('/report/generate', { detectionResult })
}

/**
 * AI 智能分析
 * @param detectionResult 检测结果
 * @param analysisType 分析类型: comprehensive | cause | repair | prevention
 */
export async function aiAnalyze(
  detectionResult: DetectionResult,
  analysisType: 'comprehensive' | 'cause' | 'repair' | 'prevention' = 'comprehensive'
): Promise<AIAnalysisResult> {
  return api.post('/ai/analyze', { detectionResult, analysisType })
}

/**
 * AI 对话
 * @param message 用户消息
 * @param context 上下文（检测结果摘要）
 */
export async function aiChat(
  message: string,
  context?: any
): Promise<AIChatResult> {
  return api.post('/ai/chat', { message, context })
}

/**
 * 获取 AI 服务状态
 */
export async function getAIStatus(): Promise<AIServiceStatus> {
  return api.get('/ai/status')
}

// ==================== 立面普查 API ====================

export interface FacadeUploadPayload {
  panorama: File
  projectName: string
  wallName: string
  wallWidthM: number
  wallHeightM: number
  gridSizeM: number
  tileSize?: number
  overlapRatio?: number
  gridMode?: number
}

export interface FacadeGrid {
  gridId: string
  row: number
  col: number
  xM: number
  yM: number
  widthM: number
  heightM: number
  totalCount: number
  totalAreaM2: number
  crackLengthM: number
  intensity: number
  diseases: Record<string, number>
  detections: number[]
  tileIds: string[]
}

export interface FacadeTile {
  tileId: string
  rowIndex: number
  colIndex: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  tileUrl: string
  status: string
}

export interface FacadeResult {
  success: boolean
  jobId: string
  status: string
  progress: number
  sourceImageUrl: string
  imageWidth: number
  imageHeight: number
  wallWidthM: number
  wallHeightM: number
  gridSizeM: number
  totalTiles: number
  totalDetections: number
  grids: FacadeGrid[]
  detections: any[]
  summary: {
    totalDetections: number
    totalAreaM2: number
    crackLengthM: number
    highRiskGridCount: number
    diseaseStats: Record<string, number>
    keyRepairGrids: string[]
  }
  tiles?: FacadeTile[]
}

/**
 * 上传全景立面影像
 */
export async function uploadFacadePanorama(
  payload: FacadeUploadPayload
): Promise<any> {
  const formData = new FormData()
  formData.append('panorama', payload.panorama)
  formData.append('projectName', payload.projectName)
  formData.append('wallName', payload.wallName)
  formData.append('wallWidthM', String(payload.wallWidthM))
  formData.append('wallHeightM', String(payload.wallHeightM))
  formData.append('gridSizeM', String(payload.gridSizeM || 1))
  formData.append('tileSize', String(payload.tileSize || 1280))
  formData.append('overlapRatio', String(payload.overlapRatio ?? 0.15))
  if (payload.gridMode) formData.append('gridMode', String(payload.gridMode))

  return api.post('/facade/upload', formData, {
    timeout: 600000,
  })
}

/**
 * 启动立面普查分析
 */
export async function analyzeFacade(
  jobId: string,
  options: {
    tileSize?: number
    overlapRatio?: number
    gridMode?: number
    modelConf?: number
    iouThreshold?: number
    customVDividers?: number[]
    customHDividers?: number[]
    cropX?: number
    cropY?: number
    cropWidth?: number
    cropHeight?: number
    sliceMode?: 'manual' | 'auto'
    scalePxPerMm?: number
    zoneSizeMm?: number
    overlapMm?: number
    brickLengthMm?: number
  } = {},
  onProgress?: (info: QueueProgress) => void
): Promise<FacadeResult> {
  const body: Record<string, any> = {
    tileSize:     options.tileSize     || 640,
    overlapRatio: options.overlapRatio ?? 0.10,
    modelConf:    options.modelConf    ?? 0.30,
    iouThreshold: options.iouThreshold ?? 0.45
  }
  if (options.gridMode) body.gridMode = options.gridMode
  if (Array.isArray(options.customVDividers) && options.customVDividers.length > 0)
    body.customVDividers = options.customVDividers
  if (Array.isArray(options.customHDividers) && options.customHDividers.length > 0)
    body.customHDividers = options.customHDividers
  if (options.cropX      != null) body.cropX      = options.cropX
  if (options.cropY      != null) body.cropY      = options.cropY
  if (options.cropWidth  != null) body.cropWidth  = options.cropWidth
  if (options.cropHeight != null) body.cropHeight = options.cropHeight
  if (options.sliceMode)            body.sliceMode    = options.sliceMode
  if (options.scalePxPerMm  != null) body.scalePxPerMm  = options.scalePxPerMm
  if (options.zoneSizeMm    != null) body.zoneSizeMm    = options.zoneSizeMm
  if (options.overlapMm     != null) body.overlapMm     = options.overlapMm
  if (options.brickLengthMm != null) body.brickLengthMm = options.brickLengthMm

  const initial: any = await api.post(`/facade/analyze/${jobId}`, body, { timeout: 60000 })
  const pollJobId = initial.jobId || jobId
  onProgress?.({ status: initial.status, position: initial.position, message: initial.message })

  for (let i = 0; i < 300; i++) {
    await sleep(2000)
    const poll: any = await api.get(`/facade/job/${pollJobId}`)
    const st   = poll.status  ?? poll.job?.status
    const pos  = poll.position  ?? 0
    const prog = poll.progress ?? poll.job?.progress ?? 0
    onProgress?.({
      status: st, position: pos, progress: prog, message: poll.message,
      tilesProcessed: poll.tilesProcessed ?? 0,
      tilesTotal:     poll.tilesTotal     ?? 0
    })
    if (st === 'finished') return poll as FacadeResult
    if (st === 'error')    throw new Error(poll.message || '分析失败')
  }
  throw new Error('分析超时（10分钟），请重试')
}

/**
 * 查询立面任务
 */
export async function getFacadeJob(jobId: string): Promise<any> {
  return api.get(`/facade/job/${jobId}`)
}

/**
 * 砖缝比例尺标定（FFT 图像分析）
 */
export async function calibrateBrickScale(
  jobId: string,
  brickLengthMm: number,
  brickWidthMm?: number
): Promise<any> {
  return api.post(`/facade/calibrate-scale/${jobId}`, {
    brickLengthMm,
    ...(brickWidthMm != null ? { brickWidthMm } : {})
  })
}

/**
 * 手动画线砖块比例尺标定（仅使用长度维度）
 */
export async function manualScaleCalibration(
  jobId: string,
  linePixelLength: number,
  brickLengthMm: number
): Promise<any> {
  return api.post(`/facade/manual-scale/${jobId}`, {
    linePixelLength,
    brickLengthMm
  })
}

/**
 * 整墙立面修缮报告
 */
export async function getFacadeReport(jobId: string): Promise<any> {
  return api.get(`/facade/report/${jobId}`)
}

/**
 * 导出立面普查坐标文件
 */
export async function exportFacadeCoords(jobId: string): Promise<{
  success: boolean
  jobId: string
  coordTxtContent: string
  totalDetections: number
  totalGrids: number
  generatedAt: string
}> {
  return api.get(`/facade/export-coords/${jobId}`)
}

// ==================== 拍摄质量初筛 API ====================

export interface QualityCheckResult {
  success: boolean
  brightness: number
  blur: number
  resolution: { width: number; height: number }
  estimatedBricks: number
  warning: string | null
  warningType: 'brightness' | 'blur' | 'distance' | 'resolution' | null
  suggestion: string | null
  passed: boolean
}

/**
 * 后端软质检 - 三步法快速查勘指南后端复核
 */
export async function checkImageQuality(imageFile: File): Promise<QualityCheckResult> {
  const formData = new FormData()
  formData.append('image', imageFile)
  return api.post('/quality-check', formData, {
    timeout: 60000
  })
}

// 导出 axios 实例供特殊场景使用
export { api }

// 默认导出所有方法
export default {
  checkHealth,
  detectDisease,
  generateReport,
  aiAnalyze,
  aiChat,
  getAIStatus,
  uploadFacadePanorama,
  analyzeFacade,
  calibrateBrickScale,
  manualScaleCalibration,
  getFacadeJob,
  getFacadeReport,
  exportFacadeCoords,
  checkImageQuality
}
