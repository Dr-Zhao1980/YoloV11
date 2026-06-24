<template>
  <el-card class="facade-dashboard">
    <template #header>
      <div class="dashboard-title">
        <span>整墙统计看板</span>
        <el-tag type="danger">立面普查模式</el-tag>
      </div>
    </template>

    <div class="metric-list">
      <div class="metric-card">
        <span class="label">病害总数</span>
        <strong>{{ summary.totalDetections || 0 }}</strong>
      </div>
      <div class="metric-card">
        <span class="label">受损面积</span>
        <strong>{{ summary.totalAreaM2 || 0 }} m²</strong>
      </div>
      <div class="metric-card">
        <span class="label">裂缝长度</span>
        <strong>{{ summary.crackLengthM || 0 }} m</strong>
      </div>
      <div class="metric-card">
        <span class="label">高风险网格</span>
        <strong>{{ highRiskGridCount }}</strong>
      </div>
    </div>

    <el-divider />

    <div v-if="selectedGrid" class="selected-grid">
      <h4>当前网格：{{ selectedGrid.gridId }}</h4>
      <p>病害数量：{{ selectedGrid.totalCount }} 处</p>
      <p>受损面积：{{ selectedGrid.totalAreaM2 }} m²</p>
      <p>裂缝长度：{{ selectedGrid.crackLengthM }} m</p>
      <el-button type="primary" @click="$emit('open-grid', selectedGrid)">
        查看原始切片
      </el-button>
    </div>
    <el-empty v-else description="点击左侧网格定损图格子查看局部详情" />

    <el-button
      type="primary"
      class="facade-report-btn"
      :loading="reportLoading"
      :disabled="!canGenerateReport"
      @click="$emit('generate-report')"
    >
      <el-icon><Document /></el-icon>
      生成整墙修缮报告
    </el-button>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Document } from '@element-plus/icons-vue'

const props = defineProps<{
  summary: any
  grids: any[]
  detections?: any[]
  selectedGrid: any | null
  reportLoading?: boolean
}>()

defineEmits<{
  (event: 'open-grid', grid: any): void
  (event: 'generate-report'): void
}>()

const highRiskGridCount = computed(() => props.grids.filter(g => g.intensity >= 0.65).length)
const canGenerateReport = computed(() => (props.summary?.totalDetections || 0) > 0 || (props.detections?.length || 0) > 0)
</script>

<style scoped>
.facade-dashboard { height: 100%; display: flex; flex-direction: column; }
.facade-dashboard :deep(.el-card__body) { flex: 1; display: flex; flex-direction: column; }
.dashboard-title { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
.metric-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
.metric-card {
  padding: 14px 16px;
  border-radius: 12px;
  background: linear-gradient(145deg, #f8fafc 0%, #eef4fb 100%);
  border: 1px solid #e4ecf5;
  transition: box-shadow 0.2s, transform 0.2s;
}
.metric-card:hover {
  box-shadow: 0 4px 14px rgba(0, 112, 192, 0.1);
  transform: translateY(-1px);
}
.metric-card .label { display: block; margin-bottom: 6px; color: #606266; font-size: 12px; }
.metric-card strong { font-size: 22px; color: #0070c0; word-break: break-all; }
.facade-dashboard :deep(.el-card__header) {
  background: linear-gradient(90deg, #f0f7ff, #fff);
  border-bottom: 1px solid #d9ecff;
}
.selected-grid h4 { margin-bottom: 8px; color: #003a66; }
.selected-grid { line-height: 1.8; flex: 1; }
.facade-report-btn { width: 100%; margin-top: auto; font-weight: 600; letter-spacing: 0.5px; }
@media (max-width: 768px) {
  .metric-list { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .metric-card { padding: 12px 10px; }
  .metric-card strong { font-size: 18px; }
}
</style>
