<template>
  <div class="page-container">
    <el-card class="filter-card">
      <el-form :model="queryParams" inline>
        <el-form-item label="操作用户">
          <el-input v-model="queryParams.username" placeholder="请输入" clearable />
        </el-form-item>
        <el-form-item label="日志类型" v-if="logTypeOptions.length > 0">
          <el-select v-model="queryParams.logType" placeholder="请选择" clearable>
            <el-option
              v-for="item in logTypeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="操作状态">
          <el-select v-model="queryParams.status" placeholder="请选择" clearable>
            <el-option label="成功" value="success" />
            <el-option label="失败" value="fail" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
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
        <el-form-item>
          <el-button type="primary" @click="handleQuery">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="logTime" label="日志时间" width="170" />
        <el-table-column prop="username" label="操作用户" width="120" />
        <el-table-column prop="logType" label="日志类型" width="110" />
        <el-table-column prop="operation" label="操作内容" min-width="200" show-overflow-tooltip />
        <el-table-column prop="ipAddress" label="IP 地址" width="140" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ row.status === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleDetail(row)">详情</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无系统日志" />
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

    <el-dialog v-model="detailVisible" title="日志详情" width="600px" destroy-on-close>
      <div v-loading="detailLoading">
        <el-descriptions :column="2" border v-if="detailData">
          <el-descriptions-item label="日志时间">{{ detailData.logTime }}</el-descriptions-item>
          <el-descriptions-item label="操作用户">{{ detailData.username }}</el-descriptions-item>
          <el-descriptions-item label="日志类型">{{ detailData.logType }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="detailData.status === 'success' ? 'success' : 'danger'" size="small">
              {{ detailData.status === 'success' ? '成功' : '失败' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="操作内容" :span="2">{{ detailData.operation }}</el-descriptions-item>
          <el-descriptions-item label="请求地址">{{ detailData.requestUrl || '-' }}</el-descriptions-item>
          <el-descriptions-item label="请求方式">{{ detailData.requestMethod || '-' }}</el-descriptions-item>
          <el-descriptions-item label="IP 地址">{{ detailData.ipAddress }}</el-descriptions-item>
          <el-descriptions-item label="详细信息" :span="2">{{ detailData.message || '-' }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSystemLogs, getSystemLogDetail, getLogTypes } from '@/api/logs'

const loading = ref(false)
const tableData = ref<any[]>([])
const total = ref(0)
const dateRange = ref<string[]>([])
const logTypeOptions = ref<any[]>([])
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref<any>(null)

const queryParams = reactive({
  username: '',
  logType: '',
  status: '',
  startTime: '',
  endTime: '',
  pageNum: 1,
  pageSize: 10
})

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
    const res: any = await getSystemLogs(queryParams)
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

async function fetchLogTypes() {
  try {
    const res: any = await getLogTypes()
    if (res.code === 200) {
      logTypeOptions.value = res.data || []
    }
  } catch {
    // 字典接口不可用，隐藏日志类型筛选
  }
}

function handleQuery() {
  queryParams.pageNum = 1
  fetchData()
}

function handleReset() {
  queryParams.username = ''
  queryParams.logType = ''
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
    const res: any = await getSystemLogDetail(row.id)
    if (res.code === 200) {
      detailData.value = res.data
    }
  } catch (err: any) {
    ElMessage.error(err.message || '加载详情失败')
  } finally {
    detailLoading.value = false
  }
}

onMounted(() => {
  fetchData()
  fetchLogTypes()
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
