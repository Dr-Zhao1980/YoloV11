import request from './request'

export interface SystemSettings {
  systemName: string
  systemVersion: string
  modelVersion: string
  confidenceThreshold: number
  iouThreshold: number
  enableHeatmap: boolean
  enableAutoReport: boolean
  storageType: string
  cacheLimit: number
  cacheStrategy: string
  maxConcurrent: number
  maxQueueSize: number
}

export function getSystemSettings() {
  return request.get('/system/settings')
}

export function updateSystemSettings(data: SystemSettings) {
  return request.put('/system/settings', data)
}

export function resetSystemSettings() {
  return request.post('/system/settings/reset')
}

export function getModelOptions() {
  return request.get('/system/model-options')
}

export function getCacheStrategies() {
  return request.get('/system/cache-strategies')
}

export function clearSystemCache() {
  return request.post('/system/cache/clear')
}

export function getSystemStatus() {
  return request.get('/system/status')
}
