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

    <el-empty
      v-else
      description="点击左侧热力图格子查看局部详情"
    />

    <el-divider />

    <el-button
      type="primary"
      class="facade-report-btn"
      :loading="reportLoading"
      @click="$emit('generate-report')"
    >
      生成整墙修缮报告
    </el-button>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  summary: any
  grids: any[]
  selectedGrid: any | null
  reportLoading?: boolean
}>()

defineEmits<{
  (event: 'open-grid', grid: any): void
  (event: 'generate-report'): void
}>()

const highRiskGridCount = computed(() => {
  return props.grids.filter(grid => grid.intensity >= 0.65).length
})
</script>

<style scoped>
.facade-dashboard {
  height: 100%;
}

.dashboard-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.metric-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.metric-card {
  padding: 14px;
  border-radius: 12px;
  background: #f5f7fa;
  transition: transform .2s, box-shadow .2s;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(0, 112, 192, 0.1);
}

.metric-card .label {
  display: block;
  margin-bottom: 6px;
  color: #606266;
  font-size: 13px;
}

.metric-card strong {
  font-size: 22px;
  color: #303133;
  word-break: break-all;
}

@media (max-width: 768px) {
  .metric-list {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .metric-card { padding: 12px 10px; }
  .metric-card .label { font-size: 12px; margin-bottom: 4px; }
  .metric-card strong { font-size: 18px; }
}

@media (max-width: 360px) {
  .metric-list {
    grid-template-columns: 1fr;
  }
}

.dashboard-title {
  flex-wrap: wrap;
  gap: 6px;
}

.selected-grid h4 {
  margin-bottom: 8px;
  color: #003a66;
}

.selected-grid {
  line-height: 1.8;
}

.facade-report-btn {
  width: 100%;
  font-weight: 600;
  letter-spacing: 1px;
}
</style>
