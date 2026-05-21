<template>
  <div class="layout-root">

    <!-- 手机端遮罩 -->
    <transition name="fade">
      <div v-if="isMobile && sideOpen" class="mob-backdrop" @click="sideOpen = false" />
    </transition>

    <!-- 侧边栏 -->
    <aside
      class="layout-aside"
      :class="{
        'aside-collapsed': !isMobile && isCollapse,
        'aside-open-mobile': isMobile && sideOpen,
        'aside-hidden-mobile': isMobile && !sideOpen
      }"
    >
      <!-- Logo区域 -->
      <div class="aside-logo" @click="isMobile && (sideOpen = false)">
        <el-icon :size="26" color="#fff"><Monitor /></el-icon>
        <span class="logo-text">病害检测系统</span>
      </div>

      <!-- 角色标签 -->
      <div class="aside-role-tag">
        <span class="role-badge" :class="isAdmin ? 'badge-admin' : 'badge-user'">
          {{ isAdmin ? '管理员' : '普通用户' }}
        </span>
        <span class="role-name">{{ userInfo?.nickname || userInfo?.username }}</span>
      </div>

      <!-- 导航菜单 -->
      <nav class="aside-nav">
        <!-- 检测与分析（所有用户可见） -->
        <div class="nav-group-label">检测与分析</div>
        <router-link to="/dashboard" class="nav-item" :class="{ active: currentRoute === '/dashboard' }"
          @click="isMobile && (sideOpen = false)">
          <el-icon><HomeFilled /></el-icon>
          <span class="nav-text">系统首页 / 检测</span>
        </router-link>

        <!-- 系统管理（仅管理员可见） -->
        <template v-if="isAdmin">
          <div class="nav-group-label nav-group-sep">系统管理</div>
          <router-link to="/system/history" class="nav-item"
            :class="{ active: currentRoute === '/system/history' }"
            @click="isMobile && (sideOpen = false)">
            <el-icon><Document /></el-icon>
            <span class="nav-text">历史记录</span>
          </router-link>
          <router-link to="/system/logs" class="nav-item"
            :class="{ active: currentRoute === '/system/logs' }"
            @click="isMobile && (sideOpen = false)">
            <el-icon><Notebook /></el-icon>
            <span class="nav-text">系统日志</span>
          </router-link>
          <router-link to="/system/settings" class="nav-item"
            :class="{ active: currentRoute === '/system/settings' }"
            @click="isMobile && (sideOpen = false)">
            <el-icon><Tools /></el-icon>
            <span class="nav-text">系统设置</span>
          </router-link>
        </template>
      </nav>

      <!-- 退出按钮 -->
      <div class="aside-footer">
        <button class="logout-btn" @click="handleLogout">
          <el-icon><SwitchButton /></el-icon>
          <span class="nav-text">退出登录</span>
        </button>
      </div>
    </aside>

    <!-- 主内容区 -->
    <div class="layout-body">

      <!-- 顶栏 -->
      <header class="layout-header">
        <div class="header-left">
          <!-- 汉堡 / 折叠 按钮 -->
          <button class="toggle-btn" @click="toggleSide">
            <el-icon :size="20">
              <Fold v-if="!isMobile && !isCollapse" />
              <Expand v-else-if="!isMobile && isCollapse" />
              <Grid v-else />
            </el-icon>
          </button>
          <span class="page-title">{{ currentTitle }}</span>
        </div>

        <div class="header-right">
          <span class="role-chip" :class="isAdmin ? 'chip-admin' : 'chip-user'">
            {{ isAdmin ? '管理员' : '普通用户' }}
          </span>
          <span class="user-name-top">{{ userInfo?.nickname || userInfo?.username }}</span>
        </div>
      </header>

      <!-- 页面内容 -->
      <main class="layout-main">
        <router-view />
      </main>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { logout } from '@/api/auth'

const router = useRouter()
const route = useRoute()

// ---- 折叠状态（桌面端默认收起）----
const isCollapse = ref(true)
// ---- 移动端侧边栏开关 ----
const sideOpen = ref(false)
// ---- 是否移动端 ----
const isMobile = ref(false)
const MOBILE_BREAK = 768

function checkMobile() {
  isMobile.value = window.innerWidth < MOBILE_BREAK
  if (!isMobile.value) sideOpen.value = false
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', checkMobile)
})

function toggleSide() {
  if (isMobile.value) {
    sideOpen.value = !sideOpen.value
  } else {
    isCollapse.value = !isCollapse.value
  }
}

const currentRoute = computed(() => route.path)
const currentTitle = computed(() => (route.meta?.title as string) || '系统首页')

const userInfo = computed(() => {
  try {
    const info = localStorage.getItem('user_info')
    return info ? JSON.parse(info) : null
  } catch { return null }
})

const isAdmin = computed(() => userInfo.value?.role === 'admin')

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定退出登录？', '提示', {
      confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning'
    })
    try { await logout() } catch { /* ignore */ }
    localStorage.removeItem('access_token')
    localStorage.removeItem('user_info')
    ElMessage.success('已退出登录')
    router.push('/login')
  } catch { /* cancelled */ }
}
</script>

<style scoped>
/* ============================================================
   ROOT LAYOUT
   ============================================================ */
.layout-root {
  display: flex;
  min-height: 100vh;
  position: relative;
}

/* ============================================================
   SIDEBAR
   ============================================================ */
.layout-aside {
  width: 220px;
  background: #001529;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.25s ease;
  overflow: hidden;
  z-index: 200;
}

/* Desktop: collapsed to icon-only bar */
.aside-collapsed {
  width: 56px;
}

.aside-collapsed .logo-text,
.aside-collapsed .aside-role-tag,
.aside-collapsed .nav-text,
.aside-collapsed .nav-group-label,
.aside-collapsed .aside-footer .nav-text {
  display: none;
}

.aside-collapsed .nav-item {
  justify-content: center;
  padding: 12px 0;
}

.aside-collapsed .logout-btn {
  justify-content: center;
  padding: 12px 0;
}

/* Mobile: sidebar is hidden off-screen by default */
@media (max-width: 767px) {
  .layout-aside {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: 240px;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    z-index: 1000;
    box-shadow: 4px 0 20px rgba(0,0,0,0.3);
  }
  .aside-open-mobile  { transform: translateX(0); }
  .aside-hidden-mobile { transform: translateX(-100%); }
}

/* ---- Logo ---- */
.aside-logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid rgba(255,255,255,.1);
  flex-shrink: 0;
}
.logo-text {
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}

/* ---- Role tag ---- */
.aside-role-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  flex-shrink: 0;
}
.role-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.badge-admin { background: #f59e0b; color: #fff; }
.badge-user  { background: #3b82f6; color: #fff; }
.role-name {
  color: rgba(255,255,255,.55);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Nav ---- */
.aside-nav {
  flex: 1;
  padding: 10px 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.nav-group-label {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255,255,255,.35);
  text-transform: uppercase;
  letter-spacing: .06em;
  padding: 8px 14px 4px;
  white-space: nowrap;
}
.nav-group-sep { margin-top: 8px; border-top: 1px solid rgba(255,255,255,.07); padding-top: 12px; }

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  color: rgba(255,255,255,.65);
  text-decoration: none;
  font-size: 13px;
  border-radius: 0;
  transition: background .18s, color .18s;
  white-space: nowrap;
  cursor: pointer;
  border-left: 3px solid transparent;
}
.nav-item:hover {
  background: rgba(255,255,255,.08);
  color: #fff;
}
.nav-item.active {
  background: rgba(0,112,192,.3);
  color: #fff;
  border-left-color: #0070C0;
}

/* ---- Footer / logout ---- */
.aside-footer {
  padding: 10px 0;
  border-top: 1px solid rgba(255,255,255,.08);
  flex-shrink: 0;
}
.logout-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: none;
  color: rgba(255,255,255,.55);
  font-size: 13px;
  cursor: pointer;
  transition: background .18s, color .18s;
  white-space: nowrap;
}
.logout-btn:hover {
  background: rgba(255,80,80,.15);
  color: #ff6b6b;
}

/* ============================================================
   BACKDROP (mobile)
   ============================================================ */
.mob-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  z-index: 999;
}
.fade-enter-active, .fade-leave-active { transition: opacity .25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ============================================================
   MAIN BODY
   ============================================================ */
.layout-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* ---- Header ---- */
.layout-header {
  height: 56px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,.08);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 100;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.toggle-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #555;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: background .18s, color .18s;
}
.toggle-btn:hover { background: #f0f6ff; color: #0070C0; }

.page-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.role-chip {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
.chip-admin { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
.chip-user  { background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe; }
.user-name-top {
  font-size: 13px;
  color: #555;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Main ---- */
.layout-main {
  flex: 1;
  background: #f4faff;
  padding: 16px;
  overflow-y: auto;
}

@media (max-width: 767px) {
  .layout-main { padding: 10px; }
  .page-title { font-size: 14px; }
  .user-name-top { max-width: 70px; }
}
</style>
