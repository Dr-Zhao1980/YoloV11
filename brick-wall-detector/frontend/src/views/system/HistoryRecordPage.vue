<template>
  <div class="page-container">
    <el-card class="filter-card">
      <el-form :model="queryParams" inline>
        <el-form-item label="项目名称">
          <el-input v-model="queryParams.projectName" placeholder="请输入项目名称" clearable />
        </el-form-item>
        <el-form-item label="检测时间">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            @change="handleDateChange"
          />
        </el-form-item>
        <el-form-item label="病害类型">
          <el-select v-model="queryParams.diseaseType" placeholder="请选择" clearable>
            <el-option label="风化" value="风化" />
            <el-option label="泛碱" value="泛碱" />
            <el-option label="裂缝" value="裂缝" />
            <el-option label="植物附着" value="植物附着" />
            <el-option label="缺损" value="缺损" />
          </el-select>
        </el-form-item>
        <el-form-item label="检测状态">
          <el-select v-model="queryParams.status" placeholder="请选择" clearable>
            <el-option label="已完成" value="completed" />
            <el-option label="检测中" value="processing" />
            <el-option label="失败" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleQuery">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="recordNo" label="检测编号" width="160" />
        <el-table-column prop="projectName" label="项目名称" min-width="140" />
        <el-table-column prop="imageName" label="图片名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="detectTime" label="检测时间" width="170" />
        <el-table-column prop="wallSize" label="墙面尺寸" width="110" />
        <el-table-column label="病害类型" width="160">
          <template #default="{ row }">
            <el-tag
              v-for="type in row.diseaseTypes"
              :key="type"
              size="small"
              style="margin-right: 4px;"
            >{{ type }}</el-tag>
            <span v-if="!row.diseaseTypes?.length">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="diseaseCount" label="病害数量" width="90" align="center" />
        <el-table-column label="检测状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleDetail(row)">查看详情</el-button>
            <el-button type="primary" link size="small" @click="handleExport(row)">下载报告</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无历史检测记录" />
        </template>
      </el-table>

      <el-pagination
        v-if="total > 0"
        class="pagination"
        :current-page="queryParams.pageNum"
        :page-size="queryParams.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </el-card>

    <el-dialog v-model="detailVisible" title="检测详情" width="700px" destroy-on-close>
      <div v-loading="detailLoading">
        <el-descriptions :column="2" border v-if="detailData">
          <el-descriptions-item label="检测编号">{{ detailData.recordNo }}</el-descriptions-item>
          <el-descriptions-item label="项目名称">{{ detailData.projectName }}</el-descriptions-item>
          <el-descriptions-item label="图片名称">{{ detailData.imageName }}</el-descriptions-item>
          <el-descriptions-item label="检测时间">{{ detailData.detectTime }}</el-descriptions-item>
          <el-descriptions-item label="墙面尺寸">{{ detailData.wallSize || '-' }}</el-descriptions-item>
          <el-descriptions-item label="病害数量">{{ detailData.diseaseCount }}</el-descriptions-item>
          <el-descriptions-item label="病害类型" :span="2">
            <el-tag v-for="t in detailData.diseaseTypes" :key="t" style="margin-right: 4px;">{{ t }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="detailData?.resultImageUrl" style="margin-top: 16px;">
          <p style="font-weight: 600; margin-bottom: 8px;">检测结果图</p>
          <el-image :src="detailData.resultImageUrl" fit="contain" style="max-height: 300px; width: 100%;" />
        </div>
        <div v-if="detailData?.heatmapUrl" style="margin-top: 16px;">
          <p style="font-weight: 600; margin-bottom: 8px;">热力图</p>
          <el-image :src="detailData.heatmapUrl" fit="contain" style="max-height: 300px; width: 100%;" />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getHistoryList, getHistoryDetail, deleteHistory, exportHistoryReport } from '@/api/history'

const loading = ref(false)
const tableData = ref<any[]>([])
const total = ref(0)
const dateRange = ref<string[]>([])
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref<any>(null)

const queryParams = reactive({
  projectName: '',
  diseaseType: '',
  status: '',
  startTime: '',
  endTime: '',
  pageNum: 1,
  pageSize: 10
})

function statusType(status: string) {
  if (status === 'completed') return 'success'
  if (status === 'processing') return 'warning'
  if (status === 'failed') return 'danger'
  return 'info'
}

function statusLabel(status: string) {
  if (status === 'completed') return '已完成'
  if (status === 'processing') return '检测中'
  if (status === 'failed') return '失败'
  return status
}

function handleDateChange(val: string[] | null) {
  if (val && val.length === 2) {
    queryParams.startTime = val[0]
    queryParams.endTime = val[1]
  } else {
    queryParams.startTime = ''
    queryParams.endTime = ''
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getHistoryList(queryParams)
    if (res.code === 200) {
      tableData.value = res.data?.list || []
      total.value = res.data?.total || 0
    }
  } catch (err: any) {
    ElMessage.error(err.message || '数据加载失败，请检查后端服务是否正常')
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  queryParams.pageNum = 1
  fetchData()
}

function handleReset() {
  queryParams.projectName = ''
  queryParams.diseaseType = ''
  queryParams.status = ''
  queryParams.startTime = ''
  queryParams.endTime = ''
  dateRange.value = []
  queryParams.pageNum = 1
  fetchData()
}

function handlePageChange(page: number) {
  queryParams.pageNum = page
  fetchData()
}

function handleSizeChange(size: number) {
  queryParams.pageSize = size
  queryParams.pageNum = 1
  fetchData()
}

async function handleDetail(row: any) {
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res: any = await getHistoryDetail(row.id)
    if (res.code === 200) {
      detailData.value = res.data
    }
  } catch (err: any) {
    ElMessage.error(err.message || '加载详情失败')
  } finally {
    detailLoading.value = false
  }
}

async function handleExport(row: any) {
  if (row.reportUrl) {
    window.open(row.reportUrl, '_blank')
    return
  }
  try {
    const res: any = await exportHistoryReport(row.id)
    if (res.code === 200 && res.data?.reportUrl) {
      window.open(res.data.reportUrl, '_blank')
      ElMessage.success('报告导出成功')
    }
  } catch (err: any) {
    ElMessage.error(err.message || '报告导出失败')
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm('确定删除该检测记录？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await deleteHistory(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch (err: any) {
    if (err !== 'cancel' && err.message !== 'cancel') {
      ElMessage.error(err.message || '删除失败')
    }
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-card {
  :deep(.el-card__body) {
    padding-bottom: 4px;
  }
}

.table-card {
  flex: 1;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
