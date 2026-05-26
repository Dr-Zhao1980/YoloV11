<template>
  <div class="page-container">
    <el-row :gutter="16">
      <el-col :span="16">
        <el-card v-loading="loading">
          <template #header>
            <span style="font-weight: 600;">系统配置</span>
          </template>

          <el-form :model="settingsForm" label-width="140px" label-position="right">
            <el-divider content-position="left">基础配置</el-divider>
            <el-form-item label="系统名称">
              <el-input v-model="settingsForm.systemName" />
            </el-form-item>
            <el-form-item label="系统版本">
              <el-input v-model="settingsForm.systemVersion" disabled />
            </el-form-item>

            <el-divider content-position="left">模型配置</el-divider>
            <el-form-item label="当前模型版本">
              <el-select
                v-model="settingsForm.modelVersion"
                placeholder="暂无可选模型"
                :disabled="modelOptions.length === 0"
              >
                <el-option
                  v-for="opt in modelOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
              <span v-if="modelOptions.length === 0" class="hint-text">暂无可选模型</span>
            </el-form-item>
            <el-form-item label="置信度阈值">
              <div style="width:100%">
                <el-slider
                  v-model="settingsForm.confidenceThreshold"
                  :min="0.05" :max="0.95" :step="0.05"
                  :marks="{ 0.1:'0.1', 0.3:'0.3', 0.5:'0.5', 0.7:'0.7' }"
                  show-input
                  :format-tooltip="(v: number) => v.toFixed(2)"
                />
                <div style="font-size:12px;color:#909399;margin-top:6px">
                  全局默认置信度，前端检测面板未修改时使用此值（当前 {{ settingsForm.confidenceThreshold.toFixed(2) }}）
                </div>
              </div>
            </el-form-item>
            <el-form-item label="IoU 阈值">
              <div style="width:100%">
                <el-slider
                  v-model="settingsForm.iouThreshold"
                  :min="0.10" :max="0.90" :step="0.05"
                  :marks="{ 0.2:'0.2', 0.45:'0.45', 0.6:'0.6' }"
                  show-input
                  :format-tooltip="(v: number) => v.toFixed(2)"
                />
                <div style="font-size:12px;color:#909399;margin-top:6px">
                  NMS 去重 IoU 阈值，全局默认（当前 {{ settingsForm.iouThreshold.toFixed(2) }}）
                </div>
              </div>
            </el-form-item>
            <el-form-item label="生成热力图">
              <el-switch v-model="settingsForm.enableHeatmap" />
            </el-form-item>
            <el-form-item label="自动生成报告">
              <el-switch v-model="settingsForm.enableAutoReport" />
            </el-form-item>

            <el-divider content-position="left">存储配置</el-divider>
            <el-form-item label="存储方式">
              <el-input v-model="settingsForm.storageType" />
            </el-form-item>
            <el-form-item label="缓存上限(MB)">
              <el-input-number v-model="settingsForm.cacheLimit" :min="100" :max="10000" />
            </el-form-item>
            <el-form-item label="缓存策略">
              <el-select
                v-model="settingsForm.cacheStrategy"
                placeholder="暂无可选策略"
                :disabled="cacheStrategyOptions.length === 0"
              >
                <el-option
                  v-for="opt in cacheStrategyOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
              <span v-if="cacheStrategyOptions.length === 0" class="hint-text">暂无可选策略</span>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="saving" @click="handleSave">保存设置</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card v-loading="statusLoading">
          <template #header>
            <span style="font-weight: 600;">系统状态</span>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="服务状态">
              <el-tag :type="systemStatus.serverStatus === 'running' ? 'success' : 'danger'" size="small">
                {{ systemStatus.serverStatus === 'running' ? '运行中' : systemStatus.serverStatus || '-' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="模型状态">
              <el-tag :type="systemStatus.modelStatus === 'connected' ? 'success' : 'warning'" size="small">
                {{ systemStatus.modelStatus === 'connected' ? '已连接' : systemStatus.modelStatus || '-' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="数据库状态">
              <el-tag :type="systemStatus.databaseStatus === 'connected' ? 'success' : 'warning'" size="small">
                {{ systemStatus.databaseStatus === 'connected' ? '已连接' : systemStatus.databaseStatus || '-' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="最近更新">
              {{ systemStatus.lastUpdateTime || '-' }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getSystemSettings,
  updateSystemSettings,
  getModelOptions,
  getCacheStrategies,
  getSystemStatus
} from '@/api/settings'

const loading = ref(false)
const saving = ref(false)
const statusLoading = ref(false)
const modelOptions = ref<any[]>([])
const cacheStrategyOptions = ref<any[]>([])

const settingsForm = reactive({
  systemName: '',
  systemVersion: '',
  modelVersion: '',
  confidenceThreshold: 0.30,
  iouThreshold: 0.45,
  enableHeatmap: true,
  enableAutoReport: true,
  storageType: '',
  cacheLimit: 500,
  cacheStrategy: ''
})

const systemStatus = reactive({
  serverStatus: '',
  modelStatus: '',
  databaseStatus: '',
  lastUpdateTime: ''
})

async function fetchSettings() {
  loading.value = true
  try {
    const res: any = await getSystemSettings()
    if (res.code === 200 && res.data) {
      Object.assign(settingsForm, res.data)
    }
  } catch (err: any) {
    ElMessage.error(err.message || '加载配置失败')
  } finally {
    loading.value = false
  }
}

async function fetchModelOptions() {
  try {
    const res: any = await getModelOptions()
    if (res.code === 200) {
      modelOptions.value = res.data || []
    }
  } catch {
    // 模型选项不可用
  }
}

async function fetchCacheStrategies() {
  try {
    const res: any = await getCacheStrategies()
    if (res.code === 200) {
      cacheStrategyOptions.value = res.data || []
    }
  } catch {
    // 缓存策略不可用
  }
}

async function fetchStatus() {
  statusLoading.value = true
  try {
    const res: any = await getSystemStatus()
    if (res.code === 200 && res.data) {
      Object.assign(systemStatus, res.data)
    }
  } catch {
    // 状态接口不可用
  } finally {
    statusLoading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    const res: any = await updateSystemSettings(settingsForm as any)
    if (res.code === 200) {
      ElMessage.success(res.message || '保存成功')
      fetchSettings()
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (err: any) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchSettings()
  fetchModelOptions()
  fetchCacheStrategies()
  fetchStatus()
})
</script>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hint-text {
  margin-left: 8px;
  color: #999;
  font-size: 12px;
}
</style>
