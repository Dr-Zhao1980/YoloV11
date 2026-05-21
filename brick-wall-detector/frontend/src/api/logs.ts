import request from './request'

export interface LogQueryParams {
  username?: string
  logType?: string
  status?: string
  startTime?: string
  endTime?: string
  pageNum: number
  pageSize: number
}

export interface SystemLog {
  id: string | number
  logTime: string
  username: string
  logType: string
  operation: string
  ipAddress: string
  status: string
  message?: string
}

export function getSystemLogs(params: LogQueryParams) {
  return request.get('/system/logs', { params })
}

export function getSystemLogDetail(id: string | number) {
  return request.get(`/system/logs/${id}`)
}

export function exportSystemLogs(params: LogQueryParams) {
  return request.get('/system/logs/export', {
    params,
    responseType: 'blob'
  })
}

export function clearSystemLogs() {
  return request.delete('/system/logs')
}

export function getLogTypes() {
  return request.get('/system/dict/log-types')
}
