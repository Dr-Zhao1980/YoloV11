<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="system-icon">
          <el-icon :size="48"><Monitor /></el-icon>
        </div>
        <h1 class="system-title">红砖墙病害智能检测系统</h1>
        <p class="system-desc">基于YOLOv11深度学习的建筑病害智能识别与修缮报告平台</p>
      </div>

      <!-- 登录/注册切换 -->
      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: mode === 'login' }" @click="switchMode('login')">登 录</button>
        <button class="mode-tab" :class="{ active: mode === 'register' }" @click="switchMode('register')">注 册</button>
      </div>

      <!-- 登录表单 -->
      <el-form
        v-if="mode === 'login'"
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        class="auth-form"
        @keyup.enter="handleLogin"
      >
        <el-form-item prop="username">
          <el-input v-model="loginForm.username" placeholder="请输入用户名" prefix-icon="User" size="large" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="loginForm.password" type="password" placeholder="请输入密码"
            prefix-icon="Lock" size="large" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" class="submit-btn" @click="handleLogin">
            {{ loading ? '登录中...' : '登 录' }}
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 注册表单 -->
      <el-form
        v-else
        ref="registerFormRef"
        :model="registerForm"
        :rules="registerRules"
        class="auth-form"
        @keyup.enter="handleRegister"
      >
        <el-form-item prop="username">
          <el-input v-model="registerForm.username" placeholder="用户名（3~20位字母/数字）"
            prefix-icon="User" size="large" />
        </el-form-item>
        <el-form-item prop="nickname">
          <el-input v-model="registerForm.nickname" placeholder="昵称（选填，默认与用户名相同）"
            prefix-icon="Postcard" size="large" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="registerForm.password" type="password" placeholder="密码（至少6位）"
            prefix-icon="Lock" size="large" show-password />
        </el-form-item>
        <el-form-item prop="confirmPassword">
          <el-input v-model="registerForm.confirmPassword" type="password" placeholder="再次输入密码"
            prefix-icon="Lock" size="large" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" class="submit-btn" @click="handleRegister">
            {{ loading ? '注册中...' : '立即注册' }}
          </el-button>
        </el-form-item>
        <div class="register-note">
          <el-icon><InfoFilled /></el-icon>
          注册账号为普通用户权限，管理员账号由系统管理员分配
        </div>
      </el-form>

      <div v-if="errorMsg" class="form-error">
        <el-alert :title="errorMsg" type="error" show-icon :closable="false" />
      </div>

      <div class="login-footer">
        <span>红砖墙病害智能检测系统 v1.0</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { login, register } from '@/api/auth'

const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const loginFormRef = ref<FormInstance>()
const registerFormRef = ref<FormInstance>()
const loading = ref(false)
const errorMsg = ref('')

const loginForm = reactive({ username: '', password: '' })
const registerForm = reactive({ username: '', nickname: '', password: '', confirmPassword: '' })

const loginRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const registerRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度为 3~20 个字符', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, message: '用户名只能包含字母、数字、下划线或汉字', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule: any, value: string, callback: Function) => {
        if (value !== registerForm.password) callback(new Error('两次输入的密码不一致'))
        else callback()
      },
      trigger: 'blur'
    }
  ]
}

function switchMode(m: 'login' | 'register') {
  mode.value = m
  errorMsg.value = ''
}

async function handleLogin() {
  if (!loginFormRef.value) return
  await loginFormRef.value.validate(async (valid) => {
    if (!valid) return
    loading.value = true
    errorMsg.value = ''
    try {
      const res: any = await login({ username: loginForm.username, password: loginForm.password })
      if (res.code === 200 && res.data) {
        localStorage.setItem('access_token', res.data.token)
        localStorage.setItem('user_info', JSON.stringify(res.data.userInfo))
        ElMessage.success(res.message || '登录成功')
        router.push('/dashboard')
      } else {
        errorMsg.value = res.message || '登录失败'
      }
    } catch (err: any) {
      errorMsg.value = err.message || '网络异常，请稍后重试'
    } finally {
      loading.value = false
    }
  })
}

async function handleRegister() {
  if (!registerFormRef.value) return
  await registerFormRef.value.validate(async (valid) => {
    if (!valid) return
    loading.value = true
    errorMsg.value = ''
    try {
      const res: any = await register({
        username: registerForm.username,
        password: registerForm.password,
        nickname: registerForm.nickname || undefined
      })
      if (res.code === 200 && res.data) {
        localStorage.setItem('access_token', res.data.token)
        localStorage.setItem('user_info', JSON.stringify(res.data.userInfo))
        ElMessage.success('注册成功，欢迎加入！')
        router.push('/dashboard')
      } else {
        errorMsg.value = res.message || '注册失败'
      }
    } catch (err: any) {
      errorMsg.value = err.message || '网络异常，请稍后重试'
    } finally {
      loading.value = false
    }
  })
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0070C0 0%, #003a66 100%);
  background-image:
    radial-gradient(ellipse at 20% 50%, rgba(255,255,255,.05) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(255,255,255,.08) 0%, transparent 50%),
    linear-gradient(135deg, #0070C0 0%, #003a66 100%);
}

.login-card {
  width: 420px;
  padding: 40px 40px 32px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-header {
  text-align: center;
  margin-bottom: 28px;
}

.system-icon { color: #0070C0; margin-bottom: 12px; }

.system-title {
  font-size: 22px; font-weight: 700; color: #1a1a2e; margin-bottom: 8px;
}

.system-desc { font-size: 13px; color: #888; line-height: 1.5; }

/* ---- mode tabs ---- */
.mode-tabs {
  display: flex;
  border-bottom: 2px solid #e8edf5;
  margin-bottom: 24px;
}
.mode-tab {
  flex: 1;
  background: none;
  border: none;
  padding: 10px 0;
  font-size: 15px;
  font-weight: 500;
  color: #94a3b8;
  cursor: pointer;
  position: relative;
  transition: color .2s;
}
.mode-tab.active {
  color: #0070C0;
  font-weight: 700;
}
.mode-tab.active::after {
  content: '';
  position: absolute;
  bottom: -2px; left: 20%; right: 20%;
  height: 2px;
  background: #0070C0;
  border-radius: 2px;
}

/* ---- form ---- */
.auth-form { margin-top: 0; }

.submit-btn {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
}

.register-note {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
  margin-top: -8px;
  line-height: 1.5;
}

.form-error { margin-top: 12px; }

.login-footer {
  text-align: center;
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
  color: #aaa;
  font-size: 12px;
}
</style>
