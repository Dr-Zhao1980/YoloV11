import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: () => import('@/views/layout/index.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Home.vue'),
        meta: { title: '系统首页' }
      },
      {
        path: 'system/history',
        name: 'HistoryRecord',
        component: () => import('@/views/system/HistoryRecordPage.vue'),
        meta: { title: '历史记录管理', requiresAdmin: true }
      },
      {
        path: 'system/logs',
        name: 'SystemLog',
        component: () => import('@/views/system/SystemLogPage.vue'),
        meta: { title: '系统日志管理', requiresAdmin: true }
      },
      {
        path: 'system/settings',
        name: 'SystemSetting',
        component: () => import('@/views/system/SystemSettingPage.vue'),
        meta: { title: '系统设置', requiresAdmin: true }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('access_token')

  if (to.path === '/login') {
    if (token) {
      next('/dashboard')
    } else {
      next()
    }
    return
  }

  if (!token) {
    next('/login')
    return
  }

  // 管理员路由保护
  if (to.meta?.requiresAdmin) {
    try {
      const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}')
      if (userInfo?.role !== 'admin') {
        next('/dashboard')
        return
      }
    } catch {
      next('/dashboard')
      return
    }
  }

  next()
})

export default router
