import request from './request'

export interface LoginForm {
  username: string
  password: string
}

export interface UserInfo {
  id: number
  username: string
  nickname: string
  role: string
}

export interface RegisterForm {
  username: string
  password: string
  nickname?: string
}

export function login(data: LoginForm) {
  return request.post('/auth/login', data)
}

export function register(data: RegisterForm) {
  return request.post('/auth/register', data)
}

export function logout() {
  return request.post('/auth/logout')
}

export function getUserInfo() {
  return request.get('/auth/user-info')
}
