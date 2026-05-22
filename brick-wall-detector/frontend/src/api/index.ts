/**
 * API 服务层 - 前后端分离接口封装
 * 统一管理所有后端 API 调用
 */
import axios from 'axios'

// 创建 axios 实例
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器：自动附带 access_token，便于后端识别用户进行历史/日志归属
api.interceptors.request.use(
  (config) => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
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
  file: string
  type: string
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
    totalEstimatedCost: number
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
    estimatedCost: number
    quantity: number
    unit: string
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

/**
 * 病害检测
 * @param imageFile 图片文件
 * @param brickLengthMm 参考砖长度（mm）
 * @param modelParams 模型推理参数
 */
export async function detectDisease(
  imageFile: File,
  brickLengthMm: number = 240,
  modelParams?: Partial<ModelParams>
): Promise<DetectionResult> {
  const formData = new FormData()
  formData.append('image', imageFile)
  formData.append('brickLengthMm', String(brickLengthMm))
  if (modelParams?.modelConf !== undefined)
    formData.append('modelConf', String(modelParams.modelConf))
  if (modelParams?.iouThreshold !== undefined)
    formData.append('iouThreshold', String(modelParams.iouThreshold))
  if (modelParams?.imageSize !== undefined)
    formData.append('imageSize', String(modelParams.imageSize))
  if (modelParams?.modelId)
    formData.append('modelId', modelParams.modelId)
  
  return api.post('/detect', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  })
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

  return api.post('/facade/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  })
}

/**
 * 启动立面普查分析
 */
export async function analyzeFacade(jobId: string): Promise<FacadeResult> {
  return api.post(`/facade/analyze/${jobId}`, {}, { timeout: 300000 })
}

/**
 * 查询立面任务
 */
export async function getFacadeJob(jobId: string): Promise<any> {
  return api.get(`/facade/job/${jobId}`)
}

/**
 * 整墙立面修缮报告
 */
export async function getFacadeReport(jobId: string): Promise<any> {
  return api.get(`/facade/report/${jobId}`)
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
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000
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
  getFacadeJob,
  getFacadeReport,
  checkImageQuality
}
