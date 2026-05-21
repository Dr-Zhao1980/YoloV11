<template>
  <el-dialog
    v-model="visible"
    title="网格原始切片回溯"
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

      <div v-if="tileUrls.length" class="tile-list">
        <div
          v-for="url in tileUrls"
          :key="url"
          class="tile-card"
        >
          <img :src="url" alt="原始切片" />
        </div>
      </div>

      <el-empty
        v-else
        description="当前网格暂无可回溯切片"
      />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  modelValue: boolean
  grid: any | null
  tiles: any[]
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
  if (viewportWidth.value <= 1100) return '85%'
  return '820px'
})

const visible = computed({
  get() {
    return props.modelValue
  },
  set(value: boolean) {
    emit('update:modelValue', value)
  }
})

const tileUrls = computed(() => {
  if (!props.grid || !props.grid.tileIds) return []
  return props.tiles
    .filter(tile => props.grid.tileIds.includes(tile.tileId))
    .map(tile => tile.tileUrl)
})
</script>

<style scoped>
.grid-slice-dialog {
  min-height: 360px;
}

.tile-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

@media (max-width: 480px) {
  .tile-list {
    grid-template-columns: 1fr;
  }
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
</style>
