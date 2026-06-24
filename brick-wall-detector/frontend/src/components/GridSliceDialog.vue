<template>
  <el-dialog
    v-model="visible"
    title="网格切片回溯"
    :width="dialogWidth"
    :fullscreen="isMobile"
    top="6vh"
    class="grid-slice-dialog-root"
  >
    <div v-if="grid" class="grid-slice-dialog">
      <el-descriptions :column="isMobile ? 1 : 2" border>
        <el-descriptions-item label="网格编号">
          {{ grid.gridId }}
        </el-descriptions-item>

        <el-descriptions-item label="病害数量">
          {{ grid.totalCount }} 处
        </el-descriptions-item>

        <el-descriptions-item label="受损面积">
          {{ grid.totalAreaM2 }} m²
        </el-descriptions-item>

        <el-descriptions-item label="裂缝长度">
          {{ grid.crackLengthM }} m
        </el-descriptions-item>
      </el-descriptions>

      <el-divider />

      <div class="grid-slice-body">
        <div class="tile-column">
          <div v-if="tileItems.length" class="tile-list">
            <div
              v-for="item in tileItems"
              :key="item.tileId"
              class="tile-card"
            >
              <img :src="item.url" :alt="`网格 ${grid.gridId} 切片`" />
            </div>
          </div>
          <el-empty
            v-else
            description="当前网格暂无可回溯切片"
          />
        </div>

        <aside class="detail-column">
          <h4 class="detail-title">AI 检测明细</h4>
          <p class="detail-hint">置信度仅在此微观核对视图中展示</p>
          <el-table
            v-if="gridDetections.length"
            :data="gridDetections"
            size="small"
            max-height="420"
            stripe
          >
            <el-table-column type="index" label="#" width="44" />
            <el-table-column label="病害类型" prop="class" min-width="96">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  :color="DISEASE_COLORS[row.class]"
                  :style="{ color: diseaseLabelTextColor(row.class), border: 'none' }"
                >
                  {{ row.class }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="置信度" width="88">
              <template #default="{ row }">{{ (row.confidence * 100).toFixed(0) }}%</template>
            </el-table-column>
            <el-table-column label="面积 m²" prop="areaM2" width="88">
              <template #default="{ row }">{{ row.areaM2 ?? '—' }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="该网格暂无检测明细" />
        </aside>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { DISEASE_COLORS, diseaseLabelTextColor } from '../utils/diseaseColors'

const props = defineProps<{
  modelValue: boolean
  grid: any | null
  tiles: any[]
  detections?: any[]
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()

const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
const updateWidth = () => { viewportWidth.value = window.innerWidth }
onMounted(() => window.addEventListener('resize', updateWidth, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('resize', updateWidth))

const isMobile = computed(() => viewportWidth.value <= 768)
const dialogWidth = computed(() => {
  if (viewportWidth.value <= 480) return '100%'
  if (viewportWidth.value <= 768) return '95%'
  if (viewportWidth.value <= 1100) return '90%'
  return '960px'
})

const visible = computed({
  get() {
    return props.modelValue
  },
  set(value: boolean) {
    emit('update:modelValue', value)
  }
})

const tileItems = computed(() => {
  if (!props.grid?.tileIds?.length) return []
  return props.tiles
    .filter(tile => props.grid.tileIds.includes(tile.tileId))
    .map(tile => ({
      tileId: tile.tileId,
      url: tile.annotatedTileUrl || tile.tileUrl,
    }))
    .filter(item => item.url)
})

const gridDetections = computed(() => {
  if (!props.grid?.gridId) return []
  return (props.detections || [])
    .filter(det => det.gridId === props.grid.gridId)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
})
</script>

<style scoped>
.grid-slice-dialog {
  min-height: 360px;
}

.grid-slice-body {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
  gap: 16px;
  align-items: start;
}

.tile-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.detail-column {
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 12px;
  background: #fafbfc;
  min-height: 240px;
}

.detail-title {
  margin: 0 0 4px;
  font-size: 15px;
  color: #303133;
}

.detail-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: #909399;
}

.tile-card {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #ebeef5;
  background: #f5f7fa;
}

.tile-card img {
  display: block;
  width: 100%;
}

@media (max-width: 768px) {
  .grid-slice-body {
    grid-template-columns: 1fr;
  }

  .tile-list {
    grid-template-columns: 1fr;
  }
}
</style>
