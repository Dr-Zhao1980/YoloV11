import request from './request'

export interface HistoryQueryParams {
  projectName?: string
  diseaseType?: string
  status?: string
  startTime?: string
  endTime?: string
  pageNum: number
  pageSize: number
}

export interface HistoryRecord {
  id: string | number
  recordNo: string
  projectName: string
  imageName: string
  detectTime: string
  wallSize?: string
  diseaseTypes: string[]
  diseaseCount: number
  status: string
  reportUrl?: string
}

export function getHistoryList(params: HistoryQueryParams) {
  return request.get('/detection/history', { params })
}

export function getHistoryDetail(id: string | number) {
  return request.get(`/detection/history/${id}`)
}

export function deleteHistory(id: string | number) {
  return request.delete(`/detection/history/${id}`)
}

export function exportHistoryReport(id: string | number) {
  return request.post(`/detection/history/${id}/report`)
}
