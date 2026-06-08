<template>
  <div class="home">
    <!-- Header -->
    <header class="hero-banner">
      <div class="hero-grid"></div>
      <div class="hero-particles">
        <span v-for="n in 6" :key="n" class="particle" :class="'p'+n"></span>
      </div>
      <div class="hero-content">
        <h1>红砖墙病害智能检测系统</h1>
        <p class="hero-sub">基于 YOLOv11 深度学习模型&ensp;·&ensp;阿里云 PAI 平台部署</p>
        <div class="hero-tags">
          <span class="htag">AI 目标检测</span>
          <span class="htag">五类病害识别</span>
          <span class="htag">自动修缮报告</span>
        </div>
      </div>
      <!-- Step bar integrated into banner bottom -->
      <div class="hero-steps">
        <div class="hs" :class="{ active: true, done: !!detectionResult }">
          <span class="hs-num">1</span><span class="hs-label">上传图片</span>
        </div>
        <div class="hs-line" :class="{ filled: !!detectionResult }"></div>
        <div class="hs" :class="{ active: !!detectionResult, done: !!reportData }">
          <span class="hs-num">2</span><span class="hs-label">AI 检测</span>
        </div>
        <div class="hs-line" :class="{ filled: !!reportData }"></div>
        <div class="hs" :class="{ active: !!reportData }">
          <span class="hs-num">3</span><span class="hs-label">修缮报告</span>
        </div>
      </div>
    </header>

    <!-- Main -->
    <main class="main-content">

      <el-tabs v-model="activeMode" class="main-tabs">
        <el-tab-pane label="单图检测" name="single">

      <!-- Upload Card -->
      <div class="section-card glass-card upload-card">
        <div class="card-head">
          <div class="card-title">
            <span class="card-icon blue-icon"><el-icon :size="18"><UploadFilled /></el-icon></span>
            <span>上传检测图片</span>
          </div>
          <el-tag v-if="selectedFile" type="success" size="small" effect="plain">已选择图片</el-tag>
        </div>

        <!-- 三步快速查勘指南 -->
        <ShootingGuide />

        <!-- 参考尺寸输入 -->
        <div class="scale-input-row">
          <div class="scale-label">
            <el-icon><Ruler /></el-icon>
            <span>已知参考尺寸（用于面积换算）</span>
            <el-tooltip content="输入图中红砖的实际长度，系统将自动换算病害的真实物理面积" placement="top">
              <el-icon class="help-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
          <div class="scale-inputs">
            <el-input-number 
              v-model="brickLengthMm" 
              :min="100" 
              :max="500" 
              :step="10"
              size="small"
              controls-position="right"
            />
            <span class="scale-unit">mm（标准红砖长 240mm）</span>
          </div>
        </div>

        <!-- 模型参数面板 -->
        <div class="model-params-wrap">
          <div class="mp-toggle" @click="showModelParams = !showModelParams">
            <el-icon><Setting /></el-icon>
            <span>模型推理参数</span>
            <el-tag size="small" type="info" effect="plain" class="mp-summary">
              {{ selectedModelName }}
              &nbsp;·&nbsp;
              置信度 {{ modelParams.modelConf.toFixed(2) }}
              &nbsp;·&nbsp; IoU {{ modelParams.iouThreshold.toFixed(2) }}
              &nbsp;·&nbsp; {{ modelParams.imageSize }}px
            </el-tag>
            <el-icon class="mp-arrow" :class="{ open: showModelParams }"><ArrowDown /></el-icon>
          </div>
          <transition name="slide-down">
            <div v-show="showModelParams" class="mp-body">
              <div class="mp-row">
                <div class="mp-label">
                  <span>检测模型</span>
                  <el-tooltip placement="top" content="选择用于本次图像处理的模型；新增模型文件放入 backend/models 后会自动出现在列表中">
                    <el-icon class="help-icon"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </div>
                <div class="mp-control mp-control-select">
                  <el-select
                    v-model="modelParams.modelId"
                    size="small"
                    class="model-select"
                    placeholder="请选择模型"
                    :loading="modelsLoading"
                    :disabled="availableModels.length === 0"
                  >
                    <el-option
                      v-for="model in availableModels"
                      :key="model.id"
                      :label="`${model.name} (${model.type.toUpperCase()}, ${formatModelSize(model.size)})`"
                      :value="model.id"
                    >
                      <span>{{ model.name }}</span>
                      <el-tag v-if="model.recommended" size="small" type="success" effect="plain">推荐</el-tag>
                      <span class="model-option-meta">{{ model.file }} · {{ formatModelSize(model.size) }}</span>
                    </el-option>
                  </el-select>
                </div>
              </div>
              <!-- 置信度 -->
              <div class="mp-row">
                <div class="mp-label">
                  <span>置信度阈值</span>
                  <el-tooltip placement="top" content="检测框置信度低于此值将被过滤。值越低召回率越高，但误检也越多">
                    <el-icon class="help-icon"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </div>
                <div class="mp-control">
                  <el-slider
                    v-model="modelParams.modelConf"
                    :min="0.05" :max="0.80" :step="0.05"
                    :marks="{ 0.1:'0.1', 0.3:'0.3', 0.5:'0.5', 0.7:'0.7' }"
                    class="mp-slider"
                    :format-tooltip="(v: number) => v.toFixed(2)"
                  />
                  <el-input-number
                    v-model="modelParams.modelConf"
                    :min="0.05" :max="0.80" :step="0.05" :precision="2"
                    size="small" controls-position="right" class="mp-num"
                  />
                </div>
              </div>
              <!-- IoU -->
              <div class="mp-row">
                <div class="mp-label">
                  <span>IoU 阈值</span>
                  <el-tooltip placement="top" content="NMS 去重时交并比阈值。值越小重叠框越容易被合并">
                    <el-icon class="help-icon"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </div>
                <div class="mp-control">
                  <el-slider
                    v-model="modelParams.iouThreshold"
                    :min="0.10" :max="0.70" :step="0.05"
                    :marks="{ 0.2:'0.2', 0.45:'0.45', 0.6:'0.6' }"
                    class="mp-slider"
                    :format-tooltip="(v: number) => v.toFixed(2)"
                  />
                  <el-input-number
                    v-model="modelParams.iouThreshold"
                    :min="0.10" :max="0.70" :step="0.05" :precision="2"
                    size="small" controls-position="right" class="mp-num"
                  />
                </div>
              </div>
              <!-- 图像尺寸 -->
              <div class="mp-row">
                <div class="mp-label">
                  <span>推理图像尺寸</span>
                  <el-tooltip placement="top" content="输入模型前将图像缩放到此尺寸。越大精度越高，速度越慢">
                    <el-icon class="help-icon"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </div>
                <div class="mp-control mp-control-select">
                  <el-radio-group v-model="modelParams.imageSize" size="small">
                    <el-radio-button :value="320">320</el-radio-button>
                    <el-radio-button :value="416">416</el-radio-button>
                    <el-radio-button :value="640">640</el-radio-button>
                    <el-radio-button :value="1024">1024</el-radio-button>
                    <el-radio-button :value="1280">1280</el-radio-button>
                  </el-radio-group>
                  <span class="size-hint">px（建议 640）</span>
                </div>
              </div>
              <!-- 重置 -->
              <div class="mp-reset">
                <el-button
                  size="small" plain
                  @click="resetModelParams"
                >
                  恢复默认值
                </el-button>
              </div>
            </div>
          </transition>
        </div>


        <el-upload
          ref="uploadRef"
          class="upload-area"
          drag
          :auto-upload="false"
          :show-file-list="false"
          :on-change="handleFileChange"
          :on-remove="handleFileRemove"
          accept="image/jpeg,image/jpg,image/png"
          :limit="1"
          :on-exceed="handleExceed"
        >
          <div v-if="!previewUrl" class="upload-placeholder">
            <div class="upload-icon-wrap">
              <el-icon class="upload-icon"><Upload /></el-icon>
            </div>
            <div class="upload-text">
              将红砖墙照片拖拽到此处，或 <em>点击上传</em>
            </div>
            <div class="upload-tip">支持 JPG / PNG 格式，建议清晰正面照片，文件不超过 {{ MAX_FILE_MB }}MB</div>
            <div class="upload-formats">
              <span class="fmt-badge">JPG</span>
              <span class="fmt-badge">JPEG</span>
              <span class="fmt-badge">PNG</span>
            </div>
          </div>
          <div v-else class="preview-wrapper">
            <img :src="previewUrl" class="preview-img" alt="预览" />
            <div class="preview-mask">
              <el-icon :size="28"><ZoomIn /></el-icon>
              <span>点击更换图片</span>
            </div>
          </div>
        </el-upload>

        <div class="action-row">
          <el-button
            type="primary"
            size="large"
            :loading="detecting"
            :disabled="!selectedFile"
            @click="startDetection"
            class="detect-btn"
          >
            <el-icon><Search /></el-icon>
            开始 AI 检测
          </el-button>
          <el-button size="large" @click="resetAll" :disabled="detecting" plain>
            <el-icon><RefreshRight /></el-icon>
            重置
          </el-button>
        </div>

        <!-- Progress -->
        <div v-if="detecting" class="progress-section">
          <div class="progress-anim">
            <div class="pulse-ring"></div>
            <el-icon :size="32" color="#0070C0"><Loading /></el-icon>
          </div>
          <el-progress :percentage="Math.min(Math.round(progress), 100)" :stroke-width="8" striped striped-flow color="#0070C0" />
          <p v-if="detectQueueMsg" class="queue-msg">
          <el-icon><Timer /></el-icon> {{ detectQueueMsg }}
        </p>
        <p v-else class="progress-text">AI 模型正在分析图片，识别病害区域...</p>
        </div>
      </div>

      <!-- Detection Results -->
      <transition name="slide-up">
        <div v-if="detectionResult" class="section-card glass-card results-card">
          <div class="card-head">
            <div class="card-title">
              <span class="card-icon green-icon"><el-icon :size="18"><DataAnalysis /></el-icon></span>
              <span>检测结果</span>
            </div>
            <div class="card-head-right">
              <el-button 
                :type="showDashboard ? 'primary' : 'default'" 
                size="small" 
                @click="showDashboard = !showDashboard"
              >
                <el-icon><DataBoard /></el-icon>
                {{ showDashboard ? '关闭看板' : '看板模式' }}
              </el-button>
              <div class="model-badge" :class="{ demo: detectionResult.isDemo }">
                <span class="mb-dot"></span>
                <span>{{ detectionResult.modelInfo?.name || 'YOLOv11' }}</span>
                <span class="mb-sep">·</span>
                <span>{{ detectionResult.isDemo ? '演示模式' : '真实推理' }}</span>
              </div>
            </div>
          </div>

          <!-- 演示模式警告 -->
          <el-alert
            v-if="detectionResult.isDemo"
            type="warning"
            :closable="false"
            show-icon
            style="margin-bottom:16px"
          >
            <template #title>
              当前为演示模式（未连接真实模型）
            </template>
            <span>以下结果为随机生成的演示数据，不反映上传图片的真实检测结果。请确保后端模型文件（<code>backend/models/best.pt</code>）已就位并重启服务。</span>
          </el-alert>

          <!-- 推理参数标签栏 -->
          <div v-if="detectionResult.inferenceParams && !detectionResult.isDemo" class="infer-params-bar">
            <el-icon><Setting /></el-icon>
            <span>推理参数：</span>
            <el-tag size="small" effect="plain">置信度 {{ detectionResult.inferenceParams.modelConf?.toFixed(2) }}</el-tag>
            <el-tag size="small" effect="plain" type="success">IoU {{ detectionResult.inferenceParams.iouThreshold?.toFixed(2) }}</el-tag>
            <el-tag size="small" effect="plain" type="warning">{{ detectionResult.inferenceParams.inferImgsz }}px</el-tag>
            <span class="ip-platform">·&ensp;{{ detectionResult.modelInfo?.platform }}</span>
          </div>


          <el-row :gutter="28">
            <!-- Image panel -->
            <el-col :xs="24" :md="14">
              <!-- Image view tabs -->
              <el-tabs v-model="imageViewTab" class="det-tabs" size="small">
                <el-tab-pane
                  v-if="detectionResult.annotatedImageUrl"
                  label="标注图"
                  name="annotated"
                >
                  <div class="detection-image-wrap">
                    <img
                      :src="detectionResult.annotatedImageUrl"
                      class="det-image"
                      alt="标注图"
                    />
                  </div>
                  <p class="img-note">由模型自动生成：五色半透明区域 + 类别代码与置信度（实例分割/轮廓）</p>
                </el-tab-pane>

                <el-tab-pane label="原图+区域" name="original">
                  <div ref="detectionContainerRef" class="detection-image-wrap original-wrap">
                    <div class="detection-stage" :style="detectionStageStyle">
                    <img
                      ref="detectionImageRef"
                      :src="detectionResult.imagePath"
                      class="det-image original-image"
                      @load="onDetImageLoaded"
                      crossorigin="anonymous"
                    />
                    <DetectionMaskOverlay
                      v-if="imageDisplay.width && imageDisplay.height"
                      :detections="detectionResult.detections"
                      :width="detectionResult.imageWidth"
                      :height="detectionResult.imageHeight"
                      :display-width="imageDisplay.width"
                      :display-height="imageDisplay.height"
                    />
                  </div>
                </div>
                </el-tab-pane>
              </el-tabs>

              <!-- Coordinate TXT panel -->
              <el-collapse
                v-if="detectionResult.coordTxtContent"
                class="coord-collapse"
                v-model="coordCollapseOpen"
              >
                <el-collapse-item name="txt">
                  <template #title>
                    <el-icon style="margin-right:6px"><Document /></el-icon>
                    坐标文件（TXT）
                  </template>
                  <pre class="coord-txt">{{ detectionResult.coordTxtContent }}</pre>
                </el-collapse-item>
              </el-collapse>

              <div class="legend-bar">
                <span v-for="(color, name) in DISEASE_COLORS" :key="name" class="legend-item">
                  <span class="legend-dot" :style="{ background: color }"></span>{{ name }}
                </span>
              </div>
            </el-col>

            <!-- Right panel -->
            <el-col :xs="24" :md="10">
              <!-- Stat cards -->
              <div class="stat-grid">
                <div class="stat-card s-blue">
                  <div class="stat-icon-bg"><el-icon :size="20"><Warning /></el-icon></div>
                  <div class="stat-body">
                    <div class="stat-num">{{ detectionResult.totalDetections }}</div>
                    <div class="stat-lbl">检测到病害</div>
                  </div>
                </div>
                <div class="stat-card s-teal">
                  <div class="stat-icon-bg"><el-icon :size="20"><Grid /></el-icon></div>
                  <div class="stat-body">
                    <div class="stat-num">{{ Object.keys(detectionResult.summary).length }}</div>
                    <div class="stat-lbl">病害种类</div>
                  </div>
                </div>
                <div class="stat-card s-red" v-if="weatheringArea > 0">
                  <div class="stat-icon-bg"><el-icon :size="20"><Histogram /></el-icon></div>
                  <div class="stat-body">
                    <div class="stat-num">{{ weatheringArea.toFixed(2) }}<small>m²</small></div>
                    <div class="stat-lbl">风化面积</div>
                  </div>
                </div>
                <div class="stat-card s-purple" v-if="efflorescenceArea > 0">
                  <div class="stat-icon-bg"><el-icon :size="20"><Histogram /></el-icon></div>
                  <div class="stat-body">
                    <div class="stat-num">{{ efflorescenceArea.toFixed(2) }}<small>m²</small></div>
                    <div class="stat-lbl">泛碱面积</div>
                  </div>
                </div>
              </div>

              <!-- Disease list -->
              <div class="disease-list">
                <h4>病害分布明细</h4>
                <div
                  v-for="(data, disease) in detectionResult.summary"
                  :key="disease"
                  class="disease-row"
                >
                  <div class="disease-head">
                    <span class="d-dot" :style="{ background: diseaseColor(String(disease)) }"></span>
                    <span class="d-name">{{ disease }}</span>
                    <el-tag :type="severityType(data.maxSeverity)" size="small" effect="dark" round>{{ data.maxSeverity }}</el-tag>
                  </div>
                  <div class="disease-meta">
                    检出 <b>{{ data.count }}</b> 处
                    <template v-if="data.totalArea > 0">，面积约 <b>{{ data.totalArea.toFixed(2) }} m²</b></template>
                  </div>
                  <el-progress
                    :percentage="Math.round(data.count / detectionResult.totalDetections * 100)"
                    :stroke-width="4"
                    :color="diseaseColor(String(disease))"
                    :show-text="false"
                    style="margin-top:6px"
                  />
                </div>
              </div>

              <!-- Generate report -->
              <el-button
                type="primary"
                size="large"
                class="report-btn"
                @click="generateReport"
                :loading="generatingReport"
              >
                <el-icon><Document /></el-icon>
                生成修缮报告
              </el-button>
            </el-col>
          </el-row>

          <!-- Dashboard Mode -->
          <transition name="slide-up">
            <DashboardView
              v-if="showDashboard"
              :image-path="detectionResult.imagePath"
              :detections="detectionResult.detections"
              :image-width="detectionResult.imageWidth || 800"
              :image-height="detectionResult.imageHeight || 600"
              @close="showDashboard = false"
            />
          </transition>
        </div>
      </transition>

      <!-- Repair Report -->
      <transition name="slide-up">
        <RepairReport v-if="reportData" :report="reportData" />
      </transition>

        </el-tab-pane>

        <el-tab-pane label="立面普查模式" name="facade">
          <section class="facade-upload-panel">
            <el-card>
              <template #header>
                <div class="section-header">
                  <span>专项项目上传</span>
                  <el-tag>支持 RC 正射影像 TIFF / JPG</el-tag>
                </div>
              </template>

              <el-upload
                ref="facadeUploadRef"
                drag
                :auto-upload="false"
                :limit="1"
                :show-file-list="false"
                                accept=".jpg,.jpeg,.png,.tif,.tiff,.webp"
                :on-change="handleFacadeFileChange"
                :on-exceed="handleFacadeExceed"
              >
                <div v-if="facadeFile" class="facade-file-preview">
                  <el-icon :size="32" color="#67c23a"><CircleCheck /></el-icon>
                  <div class="facade-file-info">
                    <div class="facade-file-name">{{ facadeFile.name }}</div>
                    <div class="facade-file-meta">
                      {{ (facadeFile.size / 1024 / 1024).toFixed(2) }} MB · 点击或拖拽更换文件
                    </div>
                  </div>
                </div>
                <template v-else>
                  <el-icon :size="40" color="#0070C0"><UploadFilled /></el-icon>
                  <div class="el-upload__text">
                    上传全景大图 / 正射影像（智能比例尺切片）
                  </div>
                </template>
                <template #tip>
                  <div class="el-upload__tip">
                    支持 JPG / TIFF / PNG（最大 200MB）。上传后先画线标定，再在主页视觉微调比例尺，确认后映射切片参数 C。
                  </div>
                </template>
              </el-upload>

              <el-form
                :model="facadeForm"
                :label-position="facadeFormLabelPosition"
                :label-width="facadeFormLabelWidth"
                class="facade-form"
              >
                <el-form-item label="项目名称">
                  <el-input v-model="facadeForm.projectName" />
                </el-form-item>
                <el-form-item label="墙面名称">
                  <el-input v-model="facadeForm.wallName" />
                </el-form-item>
                <el-form-item label="墙面实际尺寸">
                  <div class="auto-size-display auto-size-readonly">
                    <span class="size-item">
                      <label>宽度</label>
                      <span class="size-value" :class="{ pending: !calculatedWallWidth }">
                        {{ calculatedWallWidth > 0 ? calculatedWallWidth.toFixed(2) : '—' }}
                        <small>m</small>
                      </span>
                    </span>
                    <span class="size-item">
                      <label>高度</label>
                      <span class="size-value" :class="{ pending: !calculatedWallHeight }">
                        {{ calculatedWallHeight > 0 ? calculatedWallHeight.toFixed(2) : '—' }}
                        <small>m</small>
                      </span>
                    </span>
                    <span v-if="currentScalePxPerMm > 0" class="size-scale-tag">
                      {{ currentScalePxPerMm.toFixed(4) }} px/mm
                    </span>
                  </div>
                  <div class="size-hint facade-size-hint">
                    <el-icon><InfoFilled /></el-icon>
                    由标定比例尺与图片像素（{{ facadeImagePixelLabel }}）自动换算，无需手动填写
                  </div>
                </el-form-item>

                <!-- 比例尺标定工作区 -->
                <el-alert
                  v-if="facadeFile && !facadeScaleCalibrated"
                  type="warning"
                  :closable="false"
                  show-icon
                  class="scale-calib-required-alert"
                  title="上传后请先画线标定，再在主页对照砖块进行视觉微调，确认比例尺后才会映射 C 参数。"
                />
                <div v-if="facadeFile" class="scale-calibration-section">
                  <div class="scale-calib-header">
                    <span class="scale-calib-title">第一步 · 砖块画线标定</span>
                    <el-tag v-if="facadeUploading" size="small" type="info">图片上传中…</el-tag>
                    <el-tag v-else-if="facadeJobId" size="small" type="success">已上传 · {{ facadeJobId.slice(0, 8) }}</el-tag>
                    <el-tag v-else size="small" type="warning">标定完成后将自动上传</el-tag>
                  </div>
                  <p class="scale-calib-desc">
                    沿一块红砖长边画线并确定初步比例尺；关闭弹窗后，在下方对照图中砖块进行<b>视觉微调</b>，确认像素与实际尺寸一致，再映射 C。
                  </p>
                  <div class="scale-calib-param">
                    <span class="scale-calib-param-label">砖块长度 A</span>
                    <el-input-number
                      v-model="facadeBrickParams.A"
                      :min="100"
                      :max="600"
                      :step="10"
                      :precision="0"
                      size="small"
                      controls-position="right"
                    />
                    <span class="unit-hint">mm</span>
                  </div>
                  <div class="scale-calib-actions">
                    <el-button
                      type="primary"
                      size="small"
                      @click="openManualScaleDialog"
                    >
                      <el-icon><Crop /></el-icon>&nbsp;手动砖块画线标定
                    </el-button>
                    <el-button
                      v-if="manualScaleResult?.success"
                      size="small"
                      link
                      type="primary"
                      @click="openManualScaleDialog"
                    >
                      重新标定
                    </el-button>
                  </div>
                </div>
              </el-form>

              <!-- 全宽工作区：微调 / 切片映射（不受表单 max-width 限制） -->
              <div v-if="facadeFile" class="facade-workspace">
                <div
                  v-if="manualScaleResult?.success && !facadeScaleCalibrated"
                  class="scale-fine-tune-section"
                >
                  <FacadeScaleFineTune
                    :image-file="facadeFile"
                    :preview-image-url="facadeFileUrl"
                    :brick-length-mm="facadeBrickParams.A"
                    :line-pixel-length="manualScaleResult.linePixelLength"
                    :line-start-native="manualScaleResult.lineStartNative || { x: 0, y: 0 }"
                    :line-end-native="manualScaleResult.lineEndNative || { x: 0, y: 0 }"
                    :base-scale-px-per-mm="manualScaleResult.baseScalePxPerMm"
                    :zone-size-mm="facadeBrickParams.C"
                    :overlap-mm="facadeBrickParams.D"
                    :wall-width-m="calculatedWallWidth || facadeForm.wallWidthM"
                    :wall-height-m="calculatedWallHeight || facadeForm.wallHeightM"
                    :confirming="manualScaleApplying"
                    @update:scale="onFineTunePreview"
                    @update:frame="facadeFrame = $event"
                    @update:image-size="(w, h) => { facadePreviewNativeW = w; facadePreviewNativeH = h }"
                    @confirm="onFineTuneConfirmed"
                  />
                </div>

                <!-- 第二步：比例尺确认后，C/D 映射与切片预览 -->
                <template v-if="facadeScaleCalibrated">
                  <el-alert
                    type="success"
                    :closable="false"
                    show-icon
                    class="slice-mapping-alert"
                    :title="`比例尺已建立（${facadeActiveScale.toFixed(4)} px/mm），以下为 C 参数映射与切片预览。`"
                  />

                  <div class="slice-mapping-section">
                    <div class="slice-mapping-header">
                      <span class="slice-mapping-title">第二步 · 切片参数映射</span>
                      <el-button size="small" @click="paramsDialogVisible = true">
                        <el-icon><Setting /></el-icon>&nbsp;设置 C / D
                      </el-button>
                    </div>
                    <div class="slice-mapping-rows">
                      <div class="sm-row">
                        <span class="sm-label">区域边长 C</span>
                        <span class="sm-val">{{ facadeBrickParams.C }} mm → <b>{{ mappedCorePx }}</b> px</span>
                      </div>
                      <div class="sm-row">
                        <span class="sm-label">裁切边长 C+2D</span>
                        <span class="sm-val">{{ facadeBrickParams.C + 2 * facadeBrickParams.D }} mm → <b>{{ facadeAutoTilePx }}</b> px</span>
                      </div>
                      <div class="sm-row">
                        <span class="sm-label">估算切片数</span>
                        <span class="sm-val"><b>{{ facadeAutoTileCount }}</b> 块</span>
                      </div>
                    </div>
                  </div>

                  <FacadeAutoPreview
                    :image-file="facadeFile"
                    :preview-image-url="facadeFileUrl"
                    :wall-width-m="calculatedWallWidth || facadeForm.wallWidthM"
                    :wall-height-m="calculatedWallHeight || facadeForm.wallHeightM"
                    :zone-size-mm="facadeBrickParams.C"
                    :overlap-mm="facadeBrickParams.D"
                    :scale-px-per-mm="facadeSliceScale"
                    @update:frame="facadeFrame = $event"
                    @update:image-size="(w, h) => { facadePreviewNativeW = w; facadePreviewNativeH = h }"
                  />

                  <!-- 比例尺与切片预览信息 -->
                  <div class="auto-scale-panel">
                    <div class="asp-row" v-if="manualScaleResult?.success">
                      <span class="asp-label">砖块标定</span>
                      <span class="asp-val asp-blue">
                        {{ manualScaleResult.scalePxPerMm.toFixed(4) }} px/mm
                        <template v-if="manualScaleResult.scaleFactor && manualScaleResult.scaleFactor !== 1">
                          （微调 {{ (manualScaleResult.scaleFactor * 100).toFixed(1) }}%）
                        </template>
                      </span>
                    </div>
                    <div class="asp-row">
                      <span class="asp-label">当前生效比例尺</span>
                      <span class="asp-val asp-active">{{ facadeSliceScale.toFixed(4) }} px/mm</span>
                    </div>
                  </div>
                </template>

                <div v-else-if="!manualScaleResult?.success" class="slice-mapping-placeholder">
                  <el-icon><InfoFilled /></el-icon>
                  <span>请先完成砖块画线标定，关闭弹窗后在下方进行视觉微调</span>
                </div>

              </div>

              <div class="facade-actions">
                <el-button
                  type="primary"
                  :loading="facadeAnalyzing"
                  :disabled="!facadeFile || !facadeScaleCalibrated"
                  @click="runFacadeAnalyze"
                >
                  <el-icon><Search /></el-icon>
                  AI 诊断
                </el-button>
                <el-button
                  v-if="facadeResult?.detections?.length"
                  type="success"
                  plain
                  @click="openFacadeCoordDialog"
                >
                  查看病害坐标
                </el-button>
                <el-button
                  v-if="facadeResult?.detections?.length"
                  plain
                  @click="exportFacadeCoordFile"
                >
                  导出坐标 TXT
                </el-button>
                <el-button
                  v-if="facadeAnalyzing && facadeJobId"
                  type="danger"
                  plain
                  @click="cancelFacadeAnalyze"
                >
                  <el-icon><CircleClose /></el-icon>
                  终止识别
                </el-button>
                <el-button disabled>
                  多源碎图云端直拼（研发中）
                </el-button>
                <el-tag v-if="facadeJobId" type="success">已上传 · 任务 {{ facadeJobId.slice(0, 8) }}</el-tag>
                <el-tag v-else-if="facadeFile && !facadeScaleCalibrated" type="danger">待标定</el-tag>
                <el-tag v-else-if="facadeFile" type="warning">已标定，可进行 AI 诊断</el-tag>
              </div>
              <div v-if="facadeAnalyzing && facadeQueueMsg" class="facade-queue-msg">
                <el-icon><Timer /></el-icon> {{ facadeQueueMsg }}
              </div>
            </el-card>
          </section>

          <section v-if="facadeResult || facadeAnalyzing" class="facade-result-layout">
            <div class="facade-result-top">
            <div class="facade-viz-panel">
              <FacadeTileGridView
                v-if="facadeResult && (facadeResult as any).tiles?.length"
                :stitched-image-url="(facadeResult as any).stitchedImageUrl || null"
                :stitched-width="(facadeResult as any).stitchedWidth || facadeResult.imageWidth"
                :stitched-height="(facadeResult as any).stitchedHeight || facadeResult.imageHeight"
                :source-image-url="facadeResult.sourceImageUrl"
                :tiles="(facadeResult as any).tiles || []"
                :detections="facadeResult.detections || []"
                :total-detections="(facadeResult as any).totalDetections || 0"
                :failed-tiles="(facadeResult as any).failedTiles || 0"
              />
              <!-- 回退：无切片数据时显示热图，或分析中显示进度条 -->
              <FacadeHeatmapCanvas
                v-else
                :image-url="facadeResult?.sourceImageUrl || facadeFileUrl"
                :image-width="facadeResult?.imageWidth || facadeImageW"
                :image-height="facadeResult?.imageHeight || facadeImageH"
                :wall-width-m="facadeResult?.wallWidthM || calculatedWallWidth || facadeForm.wallWidthM"
                :wall-height-m="facadeResult?.wallHeightM || calculatedWallHeight || facadeForm.wallHeightM"
                :grids="facadeResult?.grids || []"
                :detections="facadeResult?.detections || []"
                :is-analyzing="facadeAnalyzing"
                :progress="facadeProgress"
                :progress-text="facadeProgressText"
                @select-grid="selectedGrid = $event"
              />
            </div>
            <aside v-if="facadeResult" class="facade-stats-panel">
              <FacadeDashboard
                :summary="facadeResult.summary"
                :grids="facadeResult.grids"
                :detections="facadeResult.detections || []"
                :selected-grid="selectedGrid"
                :report-loading="facadeReportLoading"
                @open-grid="openGridSliceDialog"
                @generate-report="generateFacadeReport(true)"
              />
            </aside>
            </div>

            <!-- 独立：病害严重程度热力图 -->
            <section v-if="facadeResult" class="facade-heatmap-output-section">
              <FacadeSeverityHeatmapPanel
                :image-url="facadeResult.sourceImageUrl || facadeFileUrl"
                :image-width="facadeResult.imageWidth || facadeImageW"
                :image-height="facadeResult.imageHeight || facadeImageH"
                :coord-width="(facadeResult as any).stitchedWidth || facadeResult.imageWidth || facadeImageW"
                :coord-height="(facadeResult as any).stitchedHeight || facadeResult.imageHeight || facadeImageH"
                :crop-offset-x="(facadeResult as any).cropOffsetX || 0"
                :crop-offset-y="(facadeResult as any).cropOffsetY || 0"
                :detections="facadeResult.detections || []"
              />
            </section>

            <div
              v-if="facadeResult && (facadeResult.detections || []).length"
              class="facade-detection-panel"
            >
              <FacadeProblemReport
                fill
                title="病害详细列表"
                :detections="facadeResult.detections || []"
                :grids="facadeResult.grids"
                :summary="facadeResult.summary"
                :meta="facadeProblemReportMeta"
              />
            </div>

            <!-- 整墙修缮报告（与单图检测 RepairReport 同级） -->
            <transition name="slide-up">
              <FacadeRepairReport v-if="facadeReport" :report="facadeReport" />
            </transition>
          </section>

          <GridSliceDialog
            v-model="gridSliceDialogVisible"
            :grid="selectedGrid"
            :tiles="facadeResult?.tiles || []"
          />
        </el-tab-pane>
      </el-tabs>

    </main>

    <!-- 手动砖块画线标定（挂载到 body，避免 tab 内嵌套导致无法弹出） -->
    <el-dialog
      v-model="manualScaleDialogVisible"
      :title="mandatoryCalibPending ? '请先完成砖块画线标定（必做）' : '手动砖块画线标定'"
      width="920px"
      top="5vh"
      append-to-body
      :close-on-click-modal="false"
      :close-on-press-escape="!mandatoryCalibPending"
      :show-close="!mandatoryCalibPending"
      :before-close="handleManualScaleDialogClose"
      destroy-on-close
      @opened="onManualScaleDialogOpened"
    >
      <el-alert
        v-if="mandatoryCalibPending"
        type="warning"
        :closable="false"
        show-icon
        class="manual-scale-mandatory-alert"
        title="沿砖块长边画线并确定初步比例尺；关闭弹窗后在主页进行视觉微调。"
      />
      <FacadeManualScaleSelector
        v-if="manualScaleDialogVisible"
        :key="manualScaleDialogKey"
        :image-file="facadeFile"
        :preview-image-url="facadeFileUrl"
        :brick-length-mm="facadeBrickParams.A"
        :applying="manualScaleApplying"
        @update:scale="onManualScalePreview"
        @apply="onManualScaleLineConfirmed"
      />
    </el-dialog>

    <!-- 立面普查病害坐标 -->
    <FacadeCoordDialog
      v-model:visible="facadeCoordDialogVisible"
      :loading="facadeCoordLoading"
      :detections="facadeCoordDetections"
      :coord-meta="getFacadeCoordMeta()"
      :coord-txt-content="facadeCoordTxtContent"
      @export="exportFacadeCoordFile"
    />

    <!-- 切片参数设置 -->
    <el-dialog
      v-model="paramsDialogVisible"
      title="切片参数设置"
      width="480px"
      append-to-body
      :close-on-click-modal="true"
    >
      <el-form label-width="100px" size="small">
        <el-form-item label="区域边长 C">
          <el-input-number v-model="facadeBrickParams.C" :min="200" :max="8000" :step="100" :precision="0" style="width:130px" />
          <span class="unit-hint"> mm</span>
        </el-form-item>
        <el-form-item label="单侧重叠 D">
          <el-input-number v-model="facadeBrickParams.D" :min="0" :max="2000" :step="50" :precision="0" style="width:130px" />
          <span class="unit-hint"> mm</span>
        </el-form-item>
        <el-form-item>
          <span style="font-size: 12px; color: #909399;">切片边长 = C + 2D = {{ facadeBrickParams.C + 2*facadeBrickParams.D }} mm</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" size="small" @click="paramsDialogVisible = false">确定</el-button>
      </template>
    </el-dialog>

    <!-- Scroll to Top -->
    <transition name="fade">
      <button v-if="showScrollTop" class="scroll-top-btn" @click="scrollToTop" aria-label="返回顶部">
        <el-icon :size="20"><ArrowUp /></el-icon>
      </button>
    </transition>

    <!-- Footer -->
    <footer class="app-footer">
      <div class="footer-inner">
        <p>红砖墙病害智能检测系统&ensp;|&ensp;YOLOv11 + 阿里云PAI</p>
        <p class="footer-sub">Brick Wall Disease Detection & Repair Assessment System</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick, defineAsyncComponent } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleClose, Crop, Search, ArrowUp, Setting } from '@element-plus/icons-vue'
import { detectDisease, generateReport as apiGenerateReport, uploadFacadePanorama, analyzeFacade, manualScaleCalibration, exportFacadeCoords, getFacadeReport, getModels, getModelDefaults, api } from '../api'
import type { DetectionResult, FacadeResult, ModelParams, AvailableModel, QueueProgress } from '../api'
import RepairReport from '../components/RepairReport.vue'
import FacadeRepairReport from '../components/FacadeRepairReport.vue'
import ShootingGuide from '../components/ShootingGuide.vue'
import DashboardView from '../components/DashboardView.vue'
import FacadeHeatmapCanvas from '../components/FacadeHeatmapCanvas.vue'
import FacadeDashboard from '../components/FacadeDashboard.vue'
import GridSliceDialog from '../components/GridSliceDialog.vue'
import FacadeTileGridView from '../components/FacadeTileGridView.vue'
import FacadeAutoPreview from '../components/FacadeAutoPreview.vue'
import FacadeManualScaleSelector from '../components/FacadeManualScaleSelector.vue'
import FacadeScaleFineTune from '../components/FacadeScaleFineTune.vue'
import FacadeProblemReport from '../components/FacadeProblemReport.vue'
import FacadeCoordDialog from '../components/FacadeCoordDialog.vue'

const FacadeSeverityHeatmapPanel = defineAsyncComponent(
  () => import('../components/FacadeSeverityHeatmapPanel.vue')
)
import { buildFacadeCoordText, downloadTextFile } from '../utils/facadeCoordExport'
import { computeTileMetrics, countTilesInRegion } from '../utils/facadeTileMetrics'
import { DISEASE_COLORS, diseaseColor } from '../utils/diseaseColors'
import DetectionMaskOverlay from '../components/DetectionMaskOverlay.vue'

// ==================== Constants ====================
const MAX_FILE_MB = 10
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png']
const PROGRESS_TICK_MS = 400

interface Detection {
  id: number
  class: string
  rawClassName?: string
  confidence: number
  bbox: number[]
  polygon?: number[][] | null
  area: number | null
  severity: string
}

interface SummaryItem {
  count: number
  totalArea: number
  maxSeverity: string
  items: Detection[]
}

interface QualityResult {
  brightness: number
  blur: number
  resolution: { width: number; height: number }
  warning: string | null
  warningType: 'brightness' | 'blur' | 'distance' | 'resolution' | null
  suggestion: string | null
}

// ==================== State ====================
const uploadRef = ref()
const detectionImageRef = ref<HTMLImageElement>()
const detectionContainerRef = ref<HTMLDivElement>()
const selectedFile = ref<File | null>(null)
const previewUrl = ref('')
const detecting = ref(false)
const detectQueueMsg = ref('')
const progress = ref(0)
const detectionResult = ref<DetectionResult | null>(null)
const imageScale = ref(1)
const imageDisplay = ref({ width: 0, height: 0 })
const generatingReport = ref(false)
const reportData = ref<any>(null)

// 参考尺寸（红砖长度，单位mm）
const brickLengthMm = ref(240)
// 模型推理参数
const modelParams = ref<ModelParams>({
  modelConf: 0.30,
  iouThreshold: 0.45,
  imageSize: 640
})
const availableModels = ref<AvailableModel[]>([])
const modelsLoading = ref(false)
const showModelParams = ref(false)
// 图片质量检测结果（对应三步法指南的后端软质检）
const imageQuality = ref<QualityResult>({
  brightness: 0,
  blur: 0,
  resolution: { width: 0, height: 0 },
  warning: null,
  warningType: null,
  suggestion: null
})
// 看板模式
const showDashboard = ref(false)
// 图片视图 tab（annotated=标注图, original=原图+框）
const imageViewTab = ref('annotated')
// 坐标 TXT 折叠面板
const coordCollapseOpen = ref<string[]>([])

// ==================== 立面普查模式 ====================
const activeMode = ref('single')
const facadeFile = ref<File | null>(null)
const facadeUploading = ref(false)
const facadeAnalyzing = ref(false)
const facadeQueueMsg = ref('')
const facadeProgress = ref(0)
const facadeProgressText = ref('AI 深度普查诊断中，请稍候...')
const facadeJobId = ref('')
const facadeResult    = ref<FacadeResult | null>(null)
const facadeFrame     = ref<{ left: number; top: number; right: number; bottom: number } | null>(null)
const facadeImageW    = ref(0)
const facadeImageH    = ref(0)
const selectedGrid = ref<any | null>(null)
const gridSliceDialogVisible = ref(false)

// 砖块及切片参数（持久化）
const facadeBrickParams = reactive({ A: 240, B: 115, C: 1200, D: 120 })
function loadBrickParams() {
  try {
    const s = localStorage.getItem('facade_brick_params')
    if (s) Object.assign(facadeBrickParams, JSON.parse(s))
  } catch (_) {}
}
watch(facadeBrickParams, (v) => {
  localStorage.setItem('facade_brick_params', JSON.stringify(v))
}, { deep: true })

// 本地图片原生尺寸（FacadeAutoPreview 回传，用于预上传阶段的比例尺预估）
const facadePreviewNativeW = ref(0)
const facadePreviewNativeH = ref(0)

// 手动框选标定状态
const manualScaleDialogVisible = ref(false)
const manualScaleDialogKey = ref(0)
const manualScaleResult = ref<any>(null)
const facadeUseManualScale = ref(false)
const manualScaleApplying = ref(false)
const manualScalePreviewScale = ref(0)
const facadeScaleCalibrated = ref(false)
const mandatoryCalibPending = ref(false)

const facadeCoordDialogVisible = ref(false)
const facadeCoordLoading = ref(false)
const facadeCoordTxtContent = ref('')
const facadeCoordDetections = ref<any[]>([])

function resetManualScaleState() {
  manualScaleResult.value = null
  facadeUseManualScale.value = false
  manualScalePreviewScale.value = 0
  facadeScaleCalibrated.value = false
  mandatoryCalibPending.value = false
}

const facadeProblemReportMeta = computed(() => ({
  projectName: facadeForm.projectName,
  wallName: facadeForm.wallName,
  jobId: facadeJobId.value,
  finishedAt: facadeResult.value?.finishedAt || new Date().toISOString(),
  scalePxPerMm: facadeResult.value?.scalePxPerMm || facadeActiveScale.value || facadeSliceScale.value || 0,
  imageWidth: facadeResult.value?.imageWidth || facadeImageW.value || facadePreviewNativeW.value,
  imageHeight: facadeResult.value?.imageHeight || facadeImageH.value || facadePreviewNativeH.value,
}))

function computeLocalDiscrepancyPct(scale: number): number {
  const base = manualScaleResult.value?.baseScalePxPerMm
  if (!base || !scale) return 0
  return Math.round(Math.abs(scale - base) / base * 100)
}

/** 标定比例尺 × 图片像素 → 墙面实际宽高（m），写入 facadeForm 供上传/分析接口使用 */
function syncWallSizeFromScale(scale: number) {
  const W = facadeImageW.value || facadePreviewNativeW.value
  const H = facadeImageH.value || facadePreviewNativeH.value
  if (W > 0 && scale > 0) {
    facadeForm.wallWidthM = Number(((W / scale) / 1000).toFixed(2))
  }
  if (H > 0 && scale > 0) {
    facadeForm.wallHeightM = Number(((H / scale) / 1000).toFixed(2))
  }
}

function loadFacadeImageDimensions(file: File) {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    facadePreviewNativeW.value = img.naturalWidth
    facadePreviewNativeH.value = img.naturalHeight
    URL.revokeObjectURL(url)
    if (currentScalePxPerMm.value > 0) syncWallSizeFromScale(currentScalePxPerMm.value)
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}

async function ensureFacadeUploaded(options: { quiet?: boolean } = {}): Promise<boolean> {
  if (facadeJobId.value) return true
  return uploadFacade({ quiet: options.quiet ?? true })
}

// 参数对话框状态
const paramsDialogVisible = ref(false)

// ── 比例尺计算 ────────────────────────────────────────────────
const facadeFileUrl = ref('')
watch(facadeFile, (f) => {
  if (facadeFileUrl.value) URL.revokeObjectURL(facadeFileUrl.value)
  facadeFileUrl.value = f ? URL.createObjectURL(f) : ''
})

/** 当前生效标定比例尺（px/mm），仅来自手动画线 + 视觉微调 */
const currentScalePxPerMm = computed<number>(() => {
  if (manualScaleResult.value?.scalePxPerMm > 0) return manualScaleResult.value.scalePxPerMm
  return 0
})

const facadeActiveScale = currentScalePxPerMm

const calculatedWallWidth = computed<number>(() => {
  const W = facadeImageW.value || facadePreviewNativeW.value
  const s = currentScalePxPerMm.value
  if (!W || !s) return 0
  return Number(((W / s) / 1000).toFixed(2))
})

const calculatedWallHeight = computed<number>(() => {
  const H = facadeImageH.value || facadePreviewNativeH.value
  const s = currentScalePxPerMm.value
  if (!H || !s) return 0
  return Number(((H / s) / 1000).toFixed(2))
})

const facadeImagePixelLabel = computed(() => {
  const W = facadeImageW.value || facadePreviewNativeW.value
  const H = facadeImageH.value || facadePreviewNativeH.value
  if (!W || !H) return '待读取'
  return `${W} × ${H} px`
})

watch(currentScalePxPerMm, (s) => {
  if (s > 0) syncWallSizeFromScale(s)
})

watch(
  () => [facadeImageW.value, facadeImageH.value, facadePreviewNativeW.value, facadePreviewNativeH.value],
  () => {
    if (currentScalePxPerMm.value > 0) syncWallSizeFromScale(currentScalePxPerMm.value)
  }
)

/** 仅比例尺确认后才用于 C→px 映射与切片预览 */
const facadeSliceScale = computed<number>(() => {
  if (!facadeScaleCalibrated.value) return 0
  return facadeActiveScale.value
})

const mappedCorePx = computed<number>(() => {
  const m = computeTileMetrics(facadeSliceScale.value, facadeBrickParams.C, facadeBrickParams.D)
  return m.corePx
})

// 切片像素尺寸（native）
const facadeAutoTilePx = computed<number>(() => {
  const m = computeTileMetrics(facadeSliceScale.value, facadeBrickParams.C, facadeBrickParams.D)
  return m.extractPx
})
const facadeAutoTileCount = computed<number>(() => {
  const W = facadeImageW.value || facadePreviewNativeW.value
  const H = facadeImageH.value || facadePreviewNativeH.value
  const m = computeTileMetrics(facadeSliceScale.value, facadeBrickParams.C, facadeBrickParams.D)
  if (!m.stepPxExact || !W || !H) return 0

  const f = facadeFrame.value
  const isFullFrame = !f || (f.left < 0.005 && f.top < 0.005 && f.right > 0.995 && f.bottom > 0.995)
  let roiW = W
  let roiH = H
  if (!isFullFrame && f) {
    roiW = Math.round((f.right - f.left) * W)
    roiH = Math.round((f.bottom - f.top) * H)
  }
  return countTilesInRegion(roiW, roiH, m)
})

const facadeForm = reactive({
  projectName: '静安别墅红砖病害智能检测系统',
  wallName: '静安别墅矮墙立面',
  wallWidthM: 0,
  wallHeightM: 0,
  gridSizeM: 1,
  gridMode: 3
})

const facadeUploadRef = ref<any>(null)
const FACADE_MAX_MB = 200
const FACADE_ACCEPTED_EXTS = ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'webp']

function validateFacadeFile(raw: File): string | null {
  if (!raw) return '未选择文件'
  const ext = (raw.name.split('.').pop() || '').toLowerCase()
  if (!FACADE_ACCEPTED_EXTS.includes(ext)) {
    return `仅支持 ${FACADE_ACCEPTED_EXTS.join(' / ').toUpperCase()} 格式`
  }
  if (raw.size > FACADE_MAX_MB * 1024 * 1024) {
    return `文件过大（${(raw.size / 1024 / 1024).toFixed(1)}MB），最大支持 ${FACADE_MAX_MB}MB`
  }
  return null
}

function resetFacadeContext() {
  facadeUploadRef.value?.clearFiles()
  facadeFile.value = null
  facadeJobId.value = ''
  facadeImageW.value = 0
  facadeImageH.value = 0
  facadePreviewNativeW.value = 0
  facadePreviewNativeH.value = 0
  facadeResult.value = null
  facadeReport.value = null
  selectedGrid.value = null
  resetManualScaleState()
  facadeProgress.value = 0
  facadeQueueMsg.value = ''
  facadeProgressText.value = 'AI 深度普查诊断中，请稍候...'
  facadeFrame.value = null
}

function handleFacadeFileChange(file: any) {
  if (!file?.raw) return
  const err = validateFacadeFile(file.raw)
  if (err) {
    ElMessage.error(err)
    facadeUploadRef.value?.clearFiles()
    facadeFile.value = null
    return
  }
  facadeFile.value = file.raw
  // 切换文件后重置上下文
  facadeJobId.value = ''
  facadeImageW.value = 0
  facadeImageH.value = 0
  facadePreviewNativeW.value = 0
  facadePreviewNativeH.value = 0
  facadeResult.value = null
  facadeReport.value = null
  selectedGrid.value = null
  resetManualScaleState()
  facadeProgress.value = 0
  facadeQueueMsg.value = ''
  facadeProgressText.value = 'AI 深度普查诊断中，请稍候...'
  facadeFrame.value = null
  loadFacadeImageDimensions(file.raw)
  ElMessage.success(`已选择文件：${file.raw.name}`)
  mandatoryCalibPending.value = true
  void nextTick(() => openManualScaleDialog())
}

function handleFacadeExceed(files: File[]) {
  // limit=1 时再次拖入文件，自动替换
  const file = files[0]
  if (!file) return
  facadeUploadRef.value?.clearFiles()
  const fakeChange = { raw: file, name: file.name, size: file.size }
  handleFacadeFileChange(fakeChange)
}

async function uploadFacade(options: { openManualDialog?: boolean; quiet?: boolean } = {}) {
  const { openManualDialog = false, quiet = false } = options
  if (!facadeFile.value) {
    if (!quiet) ElMessage.warning('请先上传全景立面影像')
    return false
  }
  if (!currentScalePxPerMm.value || !calculatedWallWidth.value || !calculatedWallHeight.value) {
    if (!quiet) ElMessage.warning('请先完成比例尺标定，系统将自动计算墙面宽高')
    return false
  }

  const useWidthM = calculatedWallWidth.value
  const useHeightM = calculatedWallHeight.value
  syncWallSizeFromScale(currentScalePxPerMm.value)

  try {
    facadeUploading.value = true
    const result = await uploadFacadePanorama({
      panorama: facadeFile.value,
      projectName: facadeForm.projectName,
      wallName: facadeForm.wallName,
      wallWidthM: useWidthM,
      wallHeightM: useHeightM,
      gridSizeM: facadeForm.gridSizeM,
      tileSize: 1280,
      overlapRatio: 0.15
    })
    if (!result.success) throw new Error(result.message || '上传失败')
    facadeJobId.value = result.jobId
    facadeImageW.value = (result as any).imageWidth  || 0
    facadeImageH.value = (result as any).imageHeight || 0
    facadeProgressText.value = '上传成功，请进行比例尺标定'
    facadeProgress.value = 10

    if (openManualDialog) {
      setTimeout(() => openManualScaleDialog(), 300)
    }
    if (!quiet) ElMessage.success('全景大图上传成功')
    return true
  } catch (error: any) {
    if (!quiet) ElMessage.error(error.message || '全景图上传失败')
    return false
  } finally {
    facadeUploading.value = false
  }
}

// ── 手动框选比例尺标定 ──────────────────────────────────────────
function handleManualScaleDialogClose(done: () => void) {
  if (mandatoryCalibPending.value && !manualScaleResult.value?.success) {
    ElMessage.warning('请先沿砖块长边画线并确定比例尺')
    return
  }
  done()
}

function onManualScaleDialogOpened() {
  manualScaleDialogKey.value += 1
}

function openManualScaleDialog() {
  if (!facadeFile.value) {
    ElMessage.warning('请先选择全景大图')
    return
  }
  if (!facadeBrickParams.A || facadeBrickParams.A <= 0) {
    ElMessage.warning('请先设置砖块长度 A')
    return
  }
  facadeScaleCalibrated.value = false
  manualScaleDialogVisible.value = true
}

function onManualScalePreview(scale: number) {
  manualScalePreviewScale.value = scale
}

async function syncManualScaleToServer(scale: number, linePixelLength: number, scaleFactor = 1) {
  try {
    const uploaded = await ensureFacadeUploaded({ quiet: true })
    if (!uploaded || !facadeJobId.value) return
    const effectiveLinePx = linePixelLength * scaleFactor
    const result: any = await manualScaleCalibration(
      facadeJobId.value,
      effectiveLinePx,
      facadeBrickParams.A
    )
    if (result.success) {
      manualScaleResult.value = { ...manualScaleResult.value, ...result, scalePxPerMm: scale, scaleFactor, effectiveLinePx }
      if (result.wallWidthM > 0) facadeForm.wallWidthM = Number(result.wallWidthM.toFixed(2))
      if (result.wallHeightM > 0) facadeForm.wallHeightM = Number(result.wallHeightM.toFixed(2))
    }
  } catch (_) {
    // 本地标定已生效，服务端同步失败不阻断流程
  }
}

async function onManualScaleLineConfirmed(
  baseScale: number,
  linePixelLength: number,
  lineStartNative: { x: number; y: number },
  lineEndNative: { x: number; y: number }
) {
  if (!facadeFile.value || baseScale <= 0 || linePixelLength <= 0) return

  manualScaleResult.value = {
    success: true,
    baseScalePxPerMm: baseScale,
    scalePxPerMm: baseScale,
    linePixelLength,
    lineStartNative,
    lineEndNative,
    scaleFactor: 1,
    method: 'manual-line-calibration',
  }
  facadeUseManualScale.value = true
  syncWallSizeFromScale(baseScale)
  facadeScaleCalibrated.value = false
  mandatoryCalibPending.value = false
  manualScaleDialogVisible.value = false
  ElMessage.success('画线标定完成，请在主页对照砖块进行视觉微调')
}

function onFineTunePreview(scale: number) {
  manualScalePreviewScale.value = scale
  if (manualScaleResult.value) {
    manualScaleResult.value.scalePxPerMm = scale
  }
}

async function onFineTuneConfirmed(finalScale: number, scaleFactor: number) {
  if (!manualScaleResult.value || finalScale <= 0) return
  if (manualScaleApplying.value) return

  const linePixelLength = manualScaleResult.value.linePixelLength
  manualScaleApplying.value = true
  try {
    manualScaleResult.value = {
      ...manualScaleResult.value,
      scalePxPerMm: finalScale,
      scaleFactor,
      effectiveLinePx: linePixelLength * scaleFactor,
      discrepancyPct: computeLocalDiscrepancyPct(finalScale),
    }
    facadeUseManualScale.value = true
    syncWallSizeFromScale(finalScale)
    facadeScaleCalibrated.value = true
    ElMessage.success(`比例尺已确认：${finalScale.toFixed(4)} px/mm，C=${facadeBrickParams.C}mm → ${mappedCorePx.value}px`)
    void syncManualScaleToServer(finalScale, linePixelLength, scaleFactor)
  } catch (e: any) {
    ElMessage.error(e.message || '比例尺确认失败')
  } finally {
    manualScaleApplying.value = false
  }
}

async function runFacadeAnalyze() {
  if (!facadeFile.value) {
    ElMessage.warning('请先选择全景大图')
    return
  }
  if (!facadeScaleCalibrated.value) {
    if (manualScaleResult.value?.success) {
      ElMessage.warning('请先在主页完成比例尺视觉微调并确认')
    } else {
      ElMessage.warning('请先完成砖块画线标定')
      openManualScaleDialog()
    }
    return
  }
  if (!calculatedWallWidth.value || !calculatedWallHeight.value) {
    ElMessage.warning('墙面尺寸尚未根据标定自动计算，请完成比例尺标定')
    return
  }
  if (!facadeBrickParams.C || facadeBrickParams.C <= 0) {
    ElMessage.warning('请设置区域边长 C')
    return
  }

  try {
    facadeAnalyzing.value = true
    facadeProgress.value = 5
    facadeProgressText.value = 'AI 深度普查诊断中，请稍候...'
    facadeResult.value = null
    facadeQueueMsg.value = ''

    // 先上传，再标定（避免无 jobId 时触发标定警告）
    if (!facadeJobId.value) {
      const uploaded = await uploadFacade({ quiet: true })
      if (!uploaded || !facadeJobId.value) throw new Error('上传后未获取到任务 ID')
    }

    if (facadeActiveScale.value <= 0) {
      ElMessage.warning('无法建立比例尺，请先完成手动砖块画线标定并确认')
      return
    }

    const f = facadeFrame.value
    const W = facadeImageW.value
    const H = facadeImageH.value
    const isFullFrame = !f || (f.left < 0.005 && f.top < 0.005 && f.right > 0.995 && f.bottom > 0.995)
    const cropParams = (!isFullFrame && W > 0 && H > 0) ? {
      cropX:      Math.round(f!.left              * W),
      cropY:      Math.round(f!.top               * H),
      cropWidth:  Math.round((f!.right  - f!.left) * W),
      cropHeight: Math.round((f!.bottom - f!.top)  * H),
    } : {}

    facadeQueueMsg.value = ''
    const analyzeOptions: any = {
      modelConf:    modelParams.value.modelConf,
      iouThreshold: modelParams.value.iouThreshold,
      ...cropParams,
    }

    analyzeOptions.sliceMode     = 'auto'
    analyzeOptions.scalePxPerMm  = facadeActiveScale.value
    analyzeOptions.zoneSizeMm    = facadeBrickParams.C
    analyzeOptions.overlapMm     = facadeBrickParams.D
    analyzeOptions.brickLengthMm = facadeBrickParams.A
    analyzeOptions.brickWidthMm  = facadeBrickParams.B

    const result = await analyzeFacade(
      facadeJobId.value,
      analyzeOptions,
      (info: QueueProgress) => {
        if (info.status === 'queued') {
          facadeQueueMsg.value = `排队中，您前面还有 ${info.position ?? 0} 位`
        } else if (info.status === 'tiling') {
          facadeQueueMsg.value = '正在切片...'
        } else if (info.status === 'detecting') {
          facadeQueueMsg.value = `切片推理中 ${info.tilesProcessed ?? 0}/${info.tilesTotal ?? 0}`
        } else if (info.status === 'stitching') {
          facadeQueueMsg.value = '正在拼合图片...'
        } else if (info.status === 'cancelled') {
          facadeQueueMsg.value = '识别已被用户终止'
        } else if (typeof info.progress === 'number') {
          facadeQueueMsg.value = `AI 推理中 ${info.progress}%`
        } else {
          facadeQueueMsg.value = info.message || ''
        }
        if (typeof info.progress === 'number') facadeProgress.value = info.progress
        facadeProgressText.value = facadeQueueMsg.value || info.message || 'AI 深度普查诊断中，请稍候...'
      }
    )
    if (!result.success) throw new Error((result as any).message || 'AI 诊断失败')
    facadeResult.value = result
    facadeProgress.value = 100
    facadeProgressText.value = 'AI 深度普查诊断完成'
    selectedGrid.value = null
    const r = result as any
    if (r.failedTiles > 0) {
      ElMessage.warning(`分析完成，但有 ${r.failedTiles}/${r.totalTiles} 块切片推理失败，结果可能不完整`)
    } else {
      ElMessage.success(`立面普查分析完成，检出 ${r.totalDetections} 处病害`)
    }
    void prefetchFacadeCoords()
    void generateFacadeReport(false)
  } catch (error: any) {
    ElMessage.error(error.message || '立面普查分析失败')
  } finally {
    facadeAnalyzing.value = false
    if (facadeProgress.value < 100) facadeProgress.value = 0
  }
}

function openGridSliceDialog(grid: any) {
  selectedGrid.value = grid
  gridSliceDialogVisible.value = true
}

const facadeReportLoading = ref(false)
const facadeReport = ref<any | null>(null)

async function generateFacadeReport(scroll = true) {
  if (!facadeResult.value && !facadeJobId.value) {
    ElMessage.warning('请先完成立面 AI 诊断')
    return
  }
  facadeReportLoading.value = true
  try {
    if (facadeJobId.value) {
      const result: any = await getFacadeReport(facadeJobId.value)
      if (result.success && result.report) {
        facadeReport.value = result.report
        ElMessage.success('整墙修缮报告已生成')
        if (scroll) {
          setTimeout(() => {
            document.getElementById('facade-repair-report')?.scrollIntoView({ behavior: 'smooth' })
          }, 200)
        }
        return
      }
    }
    ElMessage.error('整墙报告生成失败，请确认诊断已完成')
  } catch (error: any) {
    ElMessage.error(error.message || '整墙报告生成失败')
  } finally {
    facadeReportLoading.value = false
  }
}

async function cancelFacadeAnalyze() {
  if (!facadeJobId.value) return
  try {
    await api.post(`/facade/cancel/${facadeJobId.value}`)
    facadeProgress.value = 0
    facadeProgressText.value = '识别已被用户终止'
    facadeQueueMsg.value = '识别已被用户终止'
    facadeAnalyzing.value = false
    ElMessage.info('已请求终止当前识别进程')
  } catch (error: any) {
    ElMessage.error(error.message || '终止识别失败')
  }
}

function getFacadeCoordMeta() {
  const scale =
    facadeResult.value?.scalePxPerMm ||
    facadeActiveScale.value ||
    facadeSliceScale.value ||
    0
  return {
    projectName: facadeForm.projectName,
    wallName: facadeForm.wallName,
    wallWidthM: facadeResult.value?.wallWidthM || facadeForm.wallWidthM,
    wallHeightM: facadeResult.value?.wallHeightM || facadeForm.wallHeightM,
    gridSizeM: facadeResult.value?.gridSizeM || facadeForm.gridSizeM,
    jobId: facadeJobId.value,
    finishedAt: new Date().toISOString(),
    scalePxPerMm: scale,
    imageWidth: facadeResult.value?.imageWidth || facadeImageW.value || facadePreviewNativeW.value,
    imageHeight: facadeResult.value?.imageHeight || facadeImageH.value || facadePreviewNativeH.value,
  }
}

async function loadFacadeCoordContent(): Promise<boolean> {
  const detections = facadeResult.value?.detections || []
  if (!detections.length) {
    ElMessage.warning('暂无病害坐标，请先完成 AI 诊断')
    return false
  }
  facadeCoordDetections.value = detections
  facadeCoordLoading.value = true
  try {
    if (facadeJobId.value) {
      const result = await exportFacadeCoords(facadeJobId.value)
      if (result.success && result.coordTxtContent) {
        facadeCoordTxtContent.value = result.coordTxtContent
        return true
      }
    }
    facadeCoordTxtContent.value = buildFacadeCoordText(
      detections,
      facadeResult.value?.grids || [],
      facadeResult.value?.summary || {},
      getFacadeCoordMeta()
    )
    return true
  } catch (_) {
    facadeCoordTxtContent.value = buildFacadeCoordText(
      detections,
      facadeResult.value?.grids || [],
      facadeResult.value?.summary || {},
      getFacadeCoordMeta()
    )
    return true
  } finally {
    facadeCoordLoading.value = false
  }
}

async function prefetchFacadeCoords() {
  if (!facadeResult.value?.detections?.length) return
  await loadFacadeCoordContent()
  facadeCoordDialogVisible.value = false
}

async function openFacadeCoordDialog() {
  const ok = await loadFacadeCoordContent()
  if (ok) facadeCoordDialogVisible.value = true
}

async function exportFacadeCoordFile() {
  if (!facadeCoordTxtContent.value) {
    const ok = await loadFacadeCoordContent()
    if (!ok) return
  }
  const stamp = new Date().toISOString().slice(0, 10)
  const jobPart = facadeJobId.value ? facadeJobId.value.slice(0, 8) : 'local'
  downloadTextFile(facadeCoordTxtContent.value, `立面普查坐标_${jobPart}_${stamp}.txt`)
  ElMessage.success('坐标 TXT 文件已导出')
}

// ==================== Computed ====================

const diseaseSummary = computed(() => detectionResult.value?.summary || {})
const weatheringArea = computed(() => diseaseSummary.value?.['风化']?.totalArea || 0)
const efflorescenceArea = computed(() => diseaseSummary.value?.['泛碱']?.totalArea || 0)
const isDemo = computed(() => !!detectionResult.value?.isDemo)
const selectedModelName = computed(() => {
  const model = availableModels.value.find(item => item.id === modelParams.value.modelId)
  return model ? model.name : '默认模型'
})
const detectionStageStyle = computed(() => {
  if (!imageDisplay.value.width || !imageDisplay.value.height) return {}
  return {
    width: `${imageDisplay.value.width}px`,
    height: `${imageDisplay.value.height}px`
  }
})

// ==================== Helpers ====================
function formatModelSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)}KB`
  return `${size}B`
}

async function resetModelParams() {
  try {
    const defaults = await getModelDefaults()
    modelParams.value = {
      modelConf:    defaults.modelConf    ?? 0.30,
      iouThreshold: defaults.iouThreshold ?? 0.45,
      imageSize: 640,
      modelId: availableModels.value[0]?.id
    }
  } catch {
    modelParams.value = { modelConf: 0.30, iouThreshold: 0.45, imageSize: 640, modelId: availableModels.value[0]?.id }
  }
}

async function loadModels() {
  try {
    modelsLoading.value = true
    const result = await getModels()
    availableModels.value = result.models || []
    if (!modelParams.value.modelId && availableModels.value.length > 0) {
      modelParams.value.modelId = availableModels.value[0].id
    }
  } catch (error: any) {
    ElMessage.warning(error.message || '模型列表加载失败')
  } finally {
    modelsLoading.value = false
  }
}

function severityType(s: string): 'danger' | 'warning' | 'success' {
  if (s === '重度') return 'danger'
  if (s === '中度') return 'warning'
  return 'success'
}

function revokePreview() {
  if (previewUrl.value && previewUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl.value)
  }
}

// ==================== File Handlers ====================
function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return '只能上传 JPG/PNG 格式的图片'
  if (file.size / 1024 / 1024 >= MAX_FILE_MB) return `图片大小不能超过 ${MAX_FILE_MB}MB`
  return null
}

// 图片质量检测：亮度、模糊度、分辨率（对应三步法指南的后端软质检）
async function checkImageQuality(file: File): Promise<QualityResult> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      const maxSize = 200 // 缩小尺寸加速计算
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      
      // 计算亮度（灰度平均值）
      let totalBrightness = 0
      for (let i = 0; i < data.length; i += 4) {
        totalBrightness += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
      }
      const brightness = totalBrightness / (data.length / 4)
      
      // 简单的模糊度检测（拉普拉斯算子方差）
      const grayData: number[] = []
      for (let i = 0; i < data.length; i += 4) {
        grayData.push(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
      }
      
      let laplacianSum = 0
      const w = canvas.width
      for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x
          const lap = grayData[idx - w] + grayData[idx + w] + grayData[idx - 1] + grayData[idx + 1] - 4 * grayData[idx]
          laplacianSum += lap * lap
        }
      }
      const blur = Math.sqrt(laplacianSum / grayData.length)
      
      // 生成警告（对应三步法指南）
      let warning: string | null = null
      let warningType: QualityResult['warningType'] = null
      let suggestion: string | null = null
      
      // 第三步：画面清不清 - 亮度检测
      if (brightness < 50) {
        warning = '🔦 光线太暗，可能漏检病害'
        warningType = 'brightness'
        suggestion = '请开启闪光灯或换个时段拍摄，确保光线均匀'
      } else if (brightness > 220) {
        warning = '☀️ 光线过强/过曝，可能误检阴影'
        warningType = 'brightness'
        suggestion = '请避开强光直射，选择阴天或早晚时段拍摄'
      }
      // 第三步：画面清不清 - 模糊度检测
      else if (blur < 5) {
        warning = '📷 检测到画面模糊'
        warningType = 'blur'
        suggestion = '请拿稳手机，对焦清晰后重新拍摄'
      }
      
      // 第一步：距离对不对 - 分辨率/距离预估
      // 如果图片分辨率很高但内容可能是远景（通过对比度判断）
      if (!warning && img.width > 3000 && img.height > 2000) {
        // 高分辨率图片，可能是远距离拍摄
        // 计算图像对比度作为距离参考
        let minGray = 255, maxGray = 0
        for (const g of grayData) {
          if (g < minGray) minGray = g
          if (g > maxGray) maxGray = g
        }
        const contrast = maxGray - minGray
        if (contrast < 80) {
          warning = '📏 距离可能太远，砖块细节不清晰'
          warningType = 'distance'
          suggestion = '请靠近墙面约 2 米，让画面横向装下约 10 块红砖'
        }
      }
      
      // 分辨率过低
      if (!warning && (img.width < 400 || img.height < 300)) {
        warning = '📐 图片分辨率较低'
        warningType = 'resolution'
        suggestion = '建议使用更高分辨率拍摄，确保砖块纹理清晰可见'
      }
      
      resolve({ 
        brightness, 
        blur, 
        resolution: { width: img.width, height: img.height },
        warning, 
        warningType,
        suggestion
      })
    }
    img.onerror = () => resolve({ 
      brightness: 128, 
      blur: 10, 
      resolution: { width: 0, height: 0 },
      warning: null, 
      warningType: null,
      suggestion: null
    })
    img.src = URL.createObjectURL(file)
  })
}

async function handleFileChange(file: any) {
  if (!file?.raw) return
  const err = validateFile(file.raw)
  if (err) {
    ElMessage.error(err)
    uploadRef.value?.clearFiles()
    return
  }
  revokePreview()
  selectedFile.value = file.raw
  previewUrl.value = URL.createObjectURL(file.raw)
  
  // 执行图片质量检测（对应三步法指南的后端软质检）
  const quality = await checkImageQuality(file.raw)
  imageQuality.value = quality
  
  if (quality.warning) {
    // 构建详细的提示信息
    const messageHtml = `
      <div style="text-align:left;">
        <p style="font-size:15px;font-weight:600;margin-bottom:8px;">${quality.warning}</p>
        ${quality.suggestion ? `<p style="font-size:13px;color:#666;margin-bottom:12px;">💡 ${quality.suggestion}</p>` : ''}
        <p style="font-size:12px;color:#999;">图片尺寸：${quality.resolution.width} × ${quality.resolution.height} px</p>
      </div>
    `
    
    ElMessageBox.confirm(
      messageHtml,
      '图片质量检测',
      {
        confirmButtonText: '继续使用',
        cancelButtonText: '重新选择',
        type: 'warning',
        dangerouslyUseHTMLString: true,
        customClass: 'quality-warning-dialog'
      }
    ).catch(() => {
      resetAll()
    })
  }
}

function handleFileRemove() {
  revokePreview()
  selectedFile.value = null
  previewUrl.value = ''
}

function handleExceed(files: File[]) {
  const file = files[0]
  if (!file) return
  uploadRef.value?.clearFiles()
  handleFileChange({ raw: file, name: file.name, size: file.size })
}

function resetAll() {
  revokePreview()
  selectedFile.value = null
  previewUrl.value = ''
  detectionResult.value = null
  reportData.value = null
  progress.value = 0
  uploadRef.value?.clearFiles()
}

async function startDetection() {
  if (!selectedFile.value) {
    ElMessage.warning('请先上传图片')
    return
  }

  // 强制提交所有 el-input-number 未确认的输入值（输入框里打了数字但未按 Enter/失焦时 v-model 尚未更新）
  ;(document.activeElement as HTMLElement)?.blur()
  await nextTick()

  detecting.value = true
  detectQueueMsg.value = ''
  progress.value = 0
  reportData.value = null

  const progressInterval = setInterval(() => {
    if (progress.value < 90) {
      progress.value += Math.random() * 12
    }
  }, PROGRESS_TICK_MS)

  try {
    const result = await detectDisease(
      selectedFile.value, brickLengthMm.value, modelParams.value,
      (info: QueueProgress) => {
        if (info.status === 'queued') {
          detectQueueMsg.value = `排队中，您前面还有 ${info.position ?? 0} 位`
        } else if (info.status === 'processing') {
          detectQueueMsg.value = ''
        }
      }
    )

    clearInterval(progressInterval)
    progress.value = 100

    if (result.success) {
      detectionResult.value = result
      imageViewTab.value = result.annotatedImageUrl ? 'annotated' : 'original'
      imageViewTab.value = result.annotatedImageUrl ? 'annotated' : 'original'
      ElMessage.success(`检测完成！发现 ${result.totalDetections} 处病害`)
    } else {
      ElMessage.error('检测失败')
    }
  } catch (err: any) {
    clearInterval(progressInterval)
    ElMessage.error('检测请求失败: ' + (err.message || '未知错误'))
  } finally {
    detecting.value = false
  }
}

// ==================== Detection Image Scaling ====================
function recalcImageScale() {
  const img = detectionImageRef.value
  if (!img || !img.naturalWidth) return
  // 从稳定的外层容器测量可用宽度，避免被内层缩放尺寸反作用导致的回归 bug
  const container = detectionContainerRef.value
  const maxWidth = container?.clientWidth || img.naturalWidth
    const maxHeight = 560
    const scale = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1)
    imageScale.value = scale
    imageDisplay.value = {
      width: Math.round(img.naturalWidth * scale),
      height: Math.round(img.naturalHeight * scale)
  }
}
function onDetImageLoaded() { recalcImageScale() }

// ==================== Scroll & Resize ====================
const showScrollTop = ref(false)
let scrollRaf = 0

function onScroll() {
  cancelAnimationFrame(scrollRaf)
  scrollRaf = requestAnimationFrame(() => {
    showScrollTop.value = window.scrollY > 400
  })
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

let resizeRaf = 0
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
const isMobile = computed(() => viewportWidth.value <= 768)
const facadeFormLabelPosition = computed(() => isMobile.value ? 'top' : 'right')
const facadeFormLabelWidth = computed(() => isMobile.value ? 'auto' : '120px')

function onWindowResize() {
  viewportWidth.value = window.innerWidth
  cancelAnimationFrame(resizeRaf)
  resizeRaf = requestAnimationFrame(recalcImageScale)
}

onMounted(async () => {
  loadBrickParams()
  // 加载模型列表
  loadModels()
  // 从系统设置加载默认推理参数（攮管员设置的置信度即将展示在滚块上）
  try {
    const defaults = await getModelDefaults()
    if (defaults.success) {
      modelParams.value.modelConf    = defaults.modelConf    ?? modelParams.value.modelConf
      modelParams.value.iouThreshold = defaults.iouThreshold ?? modelParams.value.iouThreshold
    }
  } catch { /* 默认就用初始化值 */ }
  window.addEventListener('resize', onWindowResize)
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('scroll', onScroll)
  cancelAnimationFrame(resizeRaf)
  cancelAnimationFrame(scrollRaf)
  revokePreview()
})

function highlightDisease(name: string) {
  ElMessage.info(`${name} — 点击"生成修缮报告"查看详细修缮方案`)
}

async function generateReport() {
  if (!detectionResult.value) return
  generatingReport.value = true

  try {
    const result = await apiGenerateReport(detectionResult.value)

    if (result.success) {
      reportData.value = result.report
      ElMessage.success('修缮报告已生成')
      setTimeout(() => {
        document.getElementById('repair-report')?.scrollIntoView({ behavior: 'smooth' })
      }, 200)
    } else {
      ElMessage.error('报告生成失败')
    }
  } catch (err: any) {
    ElMessage.error('报告生成失败: ' + (err.message || '未知错误'))
  } finally {
    generatingReport.value = false
  }
}
</script>

<style scoped>
.home { min-height:100vh; display:flex; flex-direction:column; }

/* ===================== TRANSITIONS ===================== */
.slide-up-enter-active { transition: all .5s cubic-bezier(.16,1,.3,1); }
.slide-up-leave-active { transition: all .3s ease-in; }
.slide-up-enter-from { opacity:0; transform:translateY(30px); }
.slide-up-leave-to { opacity:0; transform:translateY(-10px); }
.fade-enter-active, .fade-leave-active { transition: opacity .25s, transform .25s; }
.fade-enter-from, .fade-leave-to { opacity:0; transform:translateY(8px); }

/* ===================== HERO BANNER ===================== */
.hero-banner {
  background: linear-gradient(135deg, #001a33 0%, #003a66 28%, #0070C0 65%, #0080CB 100%);
  color:#fff; padding:44px 24px 0; text-align:center; position:relative; overflow:hidden;
}
.hero-grid {
  position:absolute; inset:0; pointer-events:none; opacity:.4;
  background-image:
    linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
  background-size: 40px 40px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, #000 40%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, #000 40%, transparent 100%);
}
.hero-particles { position:absolute; inset:0; pointer-events:none; }
.particle {
  position:absolute; border-radius:50%; background:rgba(255,255,255,.06);
  animation: float 14s ease-in-out infinite;
}
.p1 { width:80px;height:80px;top:10%;left:5%;animation-delay:0s; }
.p2 { width:50px;height:50px;top:60%;left:80%;animation-delay:2s; }
.p3 { width:120px;height:120px;top:20%;left:70%;animation-delay:4s; }
.p4 { width:40px;height:40px;top:70%;left:20%;animation-delay:1s; }
.p5 { width:60px;height:60px;top:40%;left:50%;animation-delay:3s; }
.p6 { width:90px;height:90px;top:5%;left:40%;animation-delay:5s; }
@keyframes float {
  0%,100% { transform:translateY(0) scale(1); opacity:.04; }
  50% { transform:translateY(-18px) scale(1.08); opacity:.1; }
}
.hero-content { max-width:860px; margin:0 auto; position:relative; z-index:1; padding-bottom:28px; }
.hero-banner h1 {
  font-size:34px; font-weight:800; letter-spacing:2px; margin-bottom:10px;
  text-shadow:0 2px 12px rgba(0,0,0,.25);
}
.hero-sub { font-size:14px; opacity:.7; margin-bottom:18px; }
.hero-tags { display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap; }
.htag {
  background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.2);
  padding:5px 16px; border-radius:20px; font-size:13px; font-weight:500;
  letter-spacing:.5px; backdrop-filter:blur(4px);
}

/* ---- Step bar inside banner ---- */
.hero-steps {
  display:flex; align-items:center; justify-content:center; gap:0;
  background:rgba(0,0,0,.18); backdrop-filter:blur(8px);
  border-top:1px solid rgba(255,255,255,.08);
  padding:16px 20px; margin-top:0; position:relative; z-index:2;
  flex-wrap:wrap;
}
.hs {
  display:flex; align-items:center; gap:8px; opacity:.55; transition:all .3s;
}
.hs.active { opacity:1; }
.hs.done .hs-num {
  background:#10b981; border-color:#10b981; color:#fff;
  box-shadow:0 0 0 4px rgba(16,185,129,.2);
}
.hs-num {
  width:28px; height:28px; border-radius:50%; border:2px solid rgba(255,255,255,.4);
  display:flex; align-items:center; justify-content:center;
  font-size:13px; font-weight:700; color:rgba(255,255,255,.85); background:transparent; transition:all .3s;
}
.hs.active .hs-num {
  background:#fff; border-color:#fff; color:#0070C0;
  box-shadow:0 0 0 4px rgba(255,255,255,.2);
}
.hs-label { font-size:13px; color:rgba(255,255,255,.9); font-weight:500; letter-spacing:.5px; }
.hs-line {
  width:64px; height:2px; background:rgba(255,255,255,.2); margin:0 12px; transition:background .5s; border-radius:2px;
}
.hs-line.filled { background:linear-gradient(90deg,#10b981,rgba(255,255,255,.6)); }

/* ===================== GLASS CARD ===================== */
.glass-card {
  background:rgba(255,255,255,.85); backdrop-filter:blur(12px);
  border:1px solid rgba(0,112,192,.08); border-radius:16px;
  box-shadow:0 4px 24px rgba(0,112,192,.07), 0 1px 3px rgba(0,0,0,.04);
  padding:24px; margin-bottom:24px; transition:box-shadow .3s;
}
.glass-card:hover { box-shadow:0 8px 32px rgba(0,112,192,.1), 0 1px 3px rgba(0,0,0,.04); }

.main-content { max-width:1200px; width:100%; margin:0 auto; padding:28px 20px 40px; position:relative; z-index:1; flex:1; }

.card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
.card-title { display:flex; align-items:center; gap:10px; font-size:17px; font-weight:600; color:#003a66; }
.card-head-right { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.card-icon {
  width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; color:#fff;
}
.blue-icon { background:linear-gradient(135deg,#0070C0,#0080CB); }
.green-icon { background:linear-gradient(135deg,#059669,#10b981); }

/* ===================== SCALE INPUT ===================== */
.scale-input-row {
  display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;
  background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;
  padding:12px 16px; margin-bottom:16px;
}
.scale-label {
  display:flex; align-items:center; gap:8px; font-size:14px; color:#003a66; font-weight:500;
}
.scale-label .el-icon { color:#0070C0; }
.help-icon { color:#94a3b8; cursor:help; margin-left:2px; }
.scale-inputs { display:flex; align-items:center; gap:10px; }
.scale-unit { font-size:13px; color:#64748b; }

/* ===================== MODEL PARAMS PANEL ===================== */
.model-params-wrap {
  border:1px solid #dde5f0; border-radius:10px; margin-bottom:16px; overflow:hidden;
  background:#fafcff;
}
.mp-toggle {
  display:flex; align-items:center; gap:10px; padding:11px 16px;
  cursor:pointer; user-select:none;
  font-size:14px; font-weight:500; color:#003a66;
  transition:background .18s;
}
.mp-toggle:hover { background:#f0f6ff; }
.mp-toggle .el-icon:first-child { color:#0070C0; }
.mp-summary { margin-left:auto; font-size:12px; }
.mp-arrow {
  color:#94a3b8; transition:transform .25s;
  margin-left:4px;
}
.mp-arrow.open { transform:rotate(180deg); }
.mp-body {
  padding:16px 20px 14px; border-top:1px solid #e8edf5;
  background:#fff;
}
.mp-row {
  display:flex; align-items:center; gap:16px; margin-bottom:18px; flex-wrap:wrap;
}
.mp-label {
  width:100px; display:flex; align-items:center; gap:6px;
  font-size:13px; color:#334155; font-weight:500; flex-shrink:0;
}
.mp-control {
  flex:1; display:flex; align-items:center; gap:14px; min-width:0;
}
.mp-slider { flex:1; min-width:120px; }
.mp-num { width:90px; flex-shrink:0; }
.mp-control-select { gap:12px; flex-wrap:wrap; align-items:center; }
.size-hint { font-size:12px; color:#94a3b8; white-space:nowrap; }
.mp-reset { display:flex; justify-content:flex-end; margin-top:4px; }

/* slide-down transition */
.slide-down-enter-active, .slide-down-leave-active {
  transition: max-height .28s ease, opacity .22s ease;
  overflow: hidden;
}
.slide-down-enter-from, .slide-down-leave-to { max-height: 0; opacity: 0; }
.slide-down-enter-to, .slide-down-leave-from { max-height: 400px; opacity: 1; }

/* ===================== INFERENCE PARAMS BAR ===================== */
.infer-params-bar {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  padding:8px 14px; margin-bottom:14px;
  background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px;
  font-size:13px; color:#0369a1;
}
.infer-params-bar .el-tag { font-size:12px; }
.ip-platform { color:#64748b; font-size:12px; margin-left:4px; }

/* ===================== MODEL PARAMS PANEL ===================== */
.model-params-wrap {
  border:1px solid #dde5f0; border-radius:10px; margin-bottom:16px; overflow:hidden;
  background:#fafcff;
}
.mp-toggle {
  display:flex; align-items:center; gap:10px; padding:11px 16px;
  cursor:pointer; user-select:none;
  font-size:14px; font-weight:500; color:#003a66;
  transition:background .18s;
}
.mp-toggle:hover { background:#f0f6ff; }
.mp-toggle .el-icon:first-child { color:#0070C0; }
.mp-summary { margin-left:auto; font-size:12px; }
.mp-arrow {
  color:#94a3b8; transition:transform .25s;
  margin-left:4px;
}
.mp-arrow.open { transform:rotate(180deg); }
.mp-body {
  padding:16px 20px 14px; border-top:1px solid #e8edf5;
  background:#fff;
}
.mp-row {
  display:flex; align-items:center; gap:16px; margin-bottom:18px; flex-wrap:wrap;
}
.mp-label {
  width:100px; display:flex; align-items:center; gap:6px;
  font-size:13px; color:#334155; font-weight:500; flex-shrink:0;
}
.mp-control {
  flex:1; display:flex; align-items:center; gap:14px; min-width:0;
}
.mp-slider { flex:1; min-width:120px; }
.mp-num { width:90px; flex-shrink:0; }
.mp-control-select { gap:12px; flex-wrap:wrap; align-items:center; }
.size-hint { font-size:12px; color:#94a3b8; white-space:nowrap; }
.mp-reset { display:flex; justify-content:flex-end; margin-top:4px; }

/* slide-down transition */
.slide-down-enter-active, .slide-down-leave-active {
  transition: max-height .28s ease, opacity .22s ease;
  overflow: hidden;
}
.slide-down-enter-from, .slide-down-leave-to { max-height: 0; opacity: 0; }
.slide-down-enter-to, .slide-down-leave-from { max-height: 400px; opacity: 1; }

/* ===================== AUTO SIZE DISPLAY ===================== */
.auto-size-display {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.size-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}
.size-item label {
  color: #606266;
}
.size-value {
  font-weight: 600;
  color: #0070c0;
  font-size: 16px;
}
.size-value small { font-size: 12px; font-weight: 500; color: #606266; margin-left: 2px; }
.size-value.pending { color: #c0c4cc; }
.auto-size-readonly {
  padding: 12px 16px;
  background: linear-gradient(135deg, #f0f7ff 0%, #fafcff 100%);
  border: 1px solid #d9ecff;
  border-radius: 10px;
  align-items: center;
}
.auto-size-readonly .size-item { flex-direction: column; align-items: flex-start; gap: 2px; min-width: 100px; }
.auto-size-readonly .size-item label { font-size: 11px; color: #909399; }
.size-scale-tag {
  margin-left: auto;
  font-size: 11px;
  color: #67c23a;
  background: #f0f9eb;
  border: 1px solid #c2e7b0;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 600;
}
.facade-size-hint { margin-top: 8px; line-height: 1.5; }
.size-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ===================== INFERENCE PARAMS BAR ===================== */
.infer-params-bar {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  padding:8px 14px; margin-bottom:14px;
  background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px;
  font-size:13px; color:#0369a1;
}
.infer-params-bar .el-tag { font-size:12px; }
.ip-platform { color:#64748b; font-size:12px; margin-left:4px; }

/* ===================== UPLOAD ===================== */
.upload-area { width:100%; }
.upload-area :deep(.el-upload-dragger) {
  border:2px dashed #a8d0ec; border-radius:14px; padding:0; transition:all .3s;
  background:linear-gradient(180deg,#f4faff 0%,#eef4ff 100%);
}
.upload-area :deep(.el-upload-dragger:hover) { border-color:#0070C0; background:linear-gradient(180deg,#e6f2fb 0%,#dbeafe 100%); }
.upload-placeholder { padding:48px 20px; text-align:center; }
.upload-icon-wrap {
  width:72px; height:72px; margin:0 auto 16px; border-radius:50%;
  background:linear-gradient(135deg,#dbeafe,#e6f2fb); display:flex; align-items:center; justify-content:center;
}
.upload-icon { font-size:36px; color:#0070C0; }
.upload-text { font-size:15px; color:#606266; margin-bottom:8px; }
.upload-text em { color:#0070C0; font-style:normal; font-weight:600; }
.upload-tip { font-size:13px; color:#909399; margin-bottom:12px; }
.upload-formats { display:flex; justify-content:center; gap:8px; }
.fmt-badge {
  background:#e0ecff; color:#0070C0; padding:2px 10px; border-radius:4px;
  font-size:11px; font-weight:600; letter-spacing:1px;
}
.preview-wrapper { position:relative; overflow:hidden; border-radius:12px; background:#eaf4fb; }
.preview-img { width:100%; max-height:380px; object-fit:contain; display:block; margin:0 auto; }

/* Hide any leaked file list items */
.upload-area :deep(.el-upload-list) { display:none !important; }
.preview-mask {
  position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:8px; background:rgba(15,38,71,.45); color:#fff; opacity:0; transition:opacity .3s; cursor:pointer; font-size:14px;
}
.preview-wrapper:hover .preview-mask { opacity:1; }

.action-row { display:flex; justify-content:center; gap:16px; margin-top:24px; }
.detect-btn {
  min-width:200px; font-weight:600; letter-spacing:1px; height:44px;
  background:linear-gradient(135deg,#0070C0,#0080CB) !important; border:none !important;
  box-shadow:0 4px 14px rgba(0,112,192,.35); position:relative; overflow:hidden;
}
.detect-btn:hover:not(:disabled) {
  background:linear-gradient(135deg,#005a99,#0070C0) !important;
  box-shadow:0 6px 20px rgba(0,112,192,.5); transform:translateY(-1px);
}
.detect-btn:disabled { opacity:.55; box-shadow:none; }
.detect-btn::before {
  content:''; position:absolute; top:0; left:-100%; width:100%; height:100%;
  background:linear-gradient(90deg, transparent, rgba(255,255,255,.25), transparent);
  transition:left .6s;
}
.detect-btn:hover:not(:disabled)::before { left:100%; }

/* ===================== MODEL BADGE ===================== */
.model-badge {
  display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:500;
  background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;
  padding:4px 10px; border-radius:12px;
}
.model-badge.demo { background:#fffbeb; color:#d97706; border-color:#fde68a; }
.mb-dot {
  width:6px; height:6px; border-radius:50%; background:currentColor;
  box-shadow:0 0 0 3px rgba(16,185,129,.15); animation:mb-pulse 2s ease-in-out infinite;
}
.model-badge.demo .mb-dot { box-shadow:0 0 0 3px rgba(217,119,6,.15); }
.mb-sep { opacity:.4; }
@keyframes mb-pulse { 0%,100%{opacity:1;} 50%{opacity:.55;} }

/* ===================== SCROLL TOP ===================== */
.scroll-top-btn {
  position:fixed; right:24px; bottom:32px; width:44px; height:44px; border-radius:50%;
  background:#fff; border:1px solid rgba(0,112,192,.2);
  box-shadow:0 4px 16px rgba(0,112,192,.18); cursor:pointer;
  display:flex; align-items:center; justify-content:center; color:#0070C0;
  transition:all .25s; z-index:100;
}
.scroll-top-btn:hover {
  background:#0070C0; color:#fff; transform:translateY(-3px);
  box-shadow:0 8px 24px rgba(0,112,192,.35);
}

/* ===================== PROGRESS ===================== */
.progress-section { margin-top:24px; text-align:center; }
.progress-anim { display:flex; align-items:center; justify-content:center; margin-bottom:16px; position:relative; }
.pulse-ring {
  position:absolute; width:56px; height:56px; border-radius:50%; border:2px solid #0070C0;
  animation:pulse-ring 1.5s ease-out infinite; opacity:0;
}
@keyframes pulse-ring { 0% { transform:scale(.8); opacity:.6; } 100% { transform:scale(1.6); opacity:0; } }
.progress-text { margin-top:10px; color:#555; font-size:14px; }
.queue-msg { margin-top:8px; color:#e6a23c; font-size:14px; font-weight:500; display:flex; align-items:center; gap:4px; justify-content:center; }
.facade-queue-msg { margin-top:8px; color:#e6a23c; font-size:14px; font-weight:500; display:flex; align-items:center; gap:4px; }

.unit-hint { font-size:12px; color:#909399; margin-left:4px; }
.scale-fine-tune-section { margin: 12px 0; }
.scale-tune-alert { margin-bottom: 10px; }
.scale-calib-required-alert { margin: 8px 0; }
.manual-scale-mandatory-alert { margin-bottom: 12px; }
.scale-calibration-section {
  margin: 12px 0 8px;
  padding: 14px 16px;
  border: 1px solid #d9ecff;
  border-radius: 8px;
  background: linear-gradient(180deg, #f0f7ff 0%, #fafcff 100%);
}
.scale-calib-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.scale-calib-title { font-size:14px; font-weight:600; color:#303133; }
.scale-calib-desc { margin:0 0 10px; font-size:13px; color:#606266; line-height:1.6; }
.scale-calib-desc b { color:#409eff; }
.scale-calib-param {
  display:flex; align-items:center; gap:8px; margin-bottom:12px;
}
.scale-calib-param-label { font-size:13px; color:#606266; min-width:72px; }
.scale-calib-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }

.slice-mapping-alert { margin: 10px 0 8px; }
.slice-mapping-section {
  margin: 8px 0 12px;
  padding: 12px 14px;
  border: 1px solid #c2e7b0;
  border-radius: 8px;
  background: #f0f9eb;
}
.slice-mapping-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.slice-mapping-title { font-size:14px; font-weight:600; color:#303133; }
.slice-mapping-rows { display:flex; flex-direction:column; gap:6px; }
.sm-row { display:flex; align-items:center; gap:10px; font-size:13px; }
.sm-label { color:#606266; min-width:100px; }
.sm-val { color:#303133; }
.sm-val b { color:#67c23a; font-weight:600; }
.slice-mapping-placeholder {
  display:flex; align-items:center; gap:8px; margin:12px 0;
  padding:12px 14px; border-radius:8px; border:1px dashed #dcdfe6;
  background:#fafafa; font-size:13px; color:#909399;
}

.auto-scale-panel {
  background:#f5f7fa; border-radius:6px; padding:10px 14px;
  margin:8px 0 4px; display:flex; flex-direction:column; gap:6px; font-size:13px;
}
.asp-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.asp-label { color:#606266; min-width:130px; font-size:12px; }
.asp-val { font-weight:500; color:#303133; }
.asp-green { color:#52c41a; }
.asp-blue  { color:#409eff; }
.asp-active { color:#0070C0; font-weight:600; }
.asp-warn  { color:#e6a23c; }
.calib-thumb { margin:6px 0; border-radius:6px; overflow:hidden; max-height:180px; }
.calib-thumb img { width:100%; max-height:180px; object-fit:contain; border-radius:4px; border:1px solid #dcdfe6; }

/* ===================== DETECTION RESULTS ===================== */
.detection-image-wrap {
  position:relative; border:1px solid #dde5f0; border-radius:12px; background:#f0f4fa;
  max-height:560px; margin:0 auto;
}
.annotated-wrap { overflow:auto; display:flex; justify-content:center; align-items:flex-start; }
.original-wrap {
  overflow:visible;
  display:flex;
  justify-content:center;
  align-items:flex-start;
  background:#f8fafc;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.65);
}
.detection-stage {
  position:relative;
  display:block;
  max-width:100%;
}
.det-image { max-width:100%; max-height:560px; object-fit:contain; display:block; margin:0 auto; }
.original-image {
  width:100%;
  height:100%;
  object-fit:fill;
  border-radius:12px;
}
.bbox-layer {
  position:absolute;
  inset:0;
  pointer-events:none;
  overflow:visible;
  z-index:2;
}
.bbox {
  position:absolute; border:2.5px solid; border-radius:4px; cursor:pointer;
  transition:box-shadow .2s, transform .2s; pointer-events:auto;
  box-shadow:0 0 0 1px rgba(255,255,255,.75), 0 2px 8px rgba(15,23,42,.18);
}
.bbox:hover { box-shadow:0 0 16px rgba(0,0,0,.3); transform:scale(1.02); z-index:10; }
.bbox-label {
  position:absolute; color:#fff;
  font-size:11px; padding:3px 7px; border-radius:5px; white-space:nowrap; font-weight:700; pointer-events:none;
  box-shadow:0 2px 8px rgba(0,0,0,.28); line-height:1.25; z-index:5; max-width:min(180px, 60vw);
  overflow:hidden; text-overflow:ellipsis;
}
.note-tag { border-radius:12px; }

/* ===================== ANNOTATED IMAGE ===================== */
.det-tabs { margin-bottom:0; }
.det-tabs :deep(.el-tabs__header) { margin-bottom:10px; }
.img-note {
  margin:6px 0 0; font-size:11px; color:#8899aa; text-align:center;
  font-style:italic; padding:0 4px;
}
.coord-collapse { margin-top:10px; border:1px solid #dde5f0; border-radius:8px; overflow:hidden; }
.coord-collapse :deep(.el-collapse-item__header) {
  padding:0 14px; font-size:13px; font-weight:600; color:#0070C0;
  background:#f4faff; height:38px;
}
.coord-txt {
  background:#1e2a3a; color:#a8d8a8; font-family:'Consolas','Courier New',monospace;
  font-size:12px; line-height:1.8; padding:14px 16px; margin:0;
  white-space:pre-wrap; word-break:break-all; max-height:260px; overflow-y:auto;
}


/* ===================== ANNOTATED IMAGE ===================== */
.det-tabs { margin-bottom:0; }
.det-tabs :deep(.el-tabs__header) { margin-bottom:10px; }
.img-note {
  margin:6px 0 0; font-size:11px; color:#8899aa; text-align:center;
  font-style:italic; padding:0 4px;
}
.coord-collapse { margin-top:10px; border:1px solid #dde5f0; border-radius:8px; overflow:hidden; }
.coord-collapse :deep(.el-collapse-item__header) {
  padding:0 14px; font-size:13px; font-weight:600; color:#0070C0;
  background:#f4faff; height:38px;
}
.coord-txt {
  background:#1e2a3a; color:#a8d8a8; font-family:'Consolas','Courier New',monospace;
  font-size:12px; line-height:1.8; padding:14px 16px; margin:0;
  white-space:pre-wrap; word-break:break-all; max-height:260px; overflow-y:auto;
}

.legend-bar { display:flex; justify-content:center; gap:20px; padding:14px 0 4px; flex-wrap:wrap; }
.legend-item { display:flex; align-items:center; gap:6px; font-size:13px; color:#555; }
.legend-dot { width:10px; height:10px; border-radius:50%; display:inline-block; box-shadow:0 0 4px rgba(0,0,0,.15); }

/* ===================== STAT CARDS ===================== */
.stat-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; }
.stat-card {
  border-radius:12px; padding:16px 14px; display:flex; align-items:center; gap:12px;
  color:#fff; transition:transform .25s, box-shadow .25s; position:relative; overflow:hidden;
  box-shadow:0 2px 8px rgba(0,0,0,.06);
}
.stat-card::before {
  content:''; position:absolute; top:-50%; right:-30%; width:120px; height:200%;
  background:linear-gradient(105deg, transparent, rgba(255,255,255,.18), transparent);
  transform:translateX(-200%) rotate(8deg); transition:transform .8s;
}
.stat-card:hover { transform:translateY(-3px); box-shadow:0 8px 20px rgba(0,0,0,.15); }
.stat-card:hover::before { transform:translateX(150%) rotate(8deg); }
.s-blue { background:linear-gradient(135deg,#005a99,#0080CB); }
.s-teal { background:linear-gradient(135deg,#0d9488,#14b8a6); }
.s-red { background:linear-gradient(135deg,#dc2626,#f87171); }
.s-purple { background:linear-gradient(135deg,#7c3aed,#a78bfa); }
.stat-icon-bg {
  width:40px; height:40px; border-radius:10px; background:rgba(255,255,255,.2);
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.stat-body { flex:1; }
.stat-num { font-size:24px; font-weight:700; line-height:1.2; }
.stat-num small { font-size:12px; font-weight:500; margin-left:2px; opacity:.85; }
.stat-lbl { font-size:12px; opacity:.85; margin-top:2px; }

/* ===================== DISEASE LIST ===================== */
.disease-list { margin-bottom:16px; }
.disease-list h4 { margin-bottom:12px; color:#003a66; font-size:15px; }
.disease-row {
  background:#f4faff; border:1px solid #d6ebf7; border-radius:10px;
  padding:12px 14px; margin-bottom:8px; transition:all .2s;
}
.disease-row:hover { transform:translateX(4px); box-shadow:0 2px 8px rgba(0,112,192,.08); }
.disease-head { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
.d-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; box-shadow:0 0 4px rgba(0,0,0,.1); }
.d-name { font-weight:600; color:#333; flex:1; }
.disease-meta { font-size:13px; color:#666; padding-left:18px; }
.report-btn {
  width:100%; margin-top:12px; font-weight:600; letter-spacing:1px;
  background:linear-gradient(135deg,#0070C0,#005a99) !important; border:none !important;
  height:44px; font-size:15px;
}
.report-btn:hover { background:linear-gradient(135deg,#005a99,#1e40af) !important; }

/* ===================== FOOTER ===================== */
.app-footer {
  text-align:center; padding:28px 20px; background:linear-gradient(180deg,#eaf4fb,#fff);
  border-top:1px solid #d6ebf7; margin-top:8px;
}
.footer-inner p { color:#8899aa; font-size:13px; margin:0; }
.footer-sub { font-size:11px; color:#b0bec5; margin-top:4px; letter-spacing:1px; }

/* kill any stray dots from el-upload */
:deep(.el-upload-list__item) { display:none !important; }

/* ===================== TABS ===================== */
.main-tabs { width:100%; }
.main-tabs :deep(.el-tabs__header) {
  margin-bottom:20px;
  position:sticky; top:0; z-index:10;
  background:rgba(244,250,255,0.92);
  backdrop-filter:blur(8px);
}
.main-tabs :deep(.el-tabs__nav-wrap) { padding:0 8px; }
.main-tabs :deep(.el-tabs__item) {
  font-size:15px; font-weight:500;
  height:48px; line-height:48px;
}
@media (max-width:768px) {
  .main-tabs :deep(.el-tabs__header) { margin-bottom:14px; }
  .main-tabs :deep(.el-tabs__item) {
    font-size:14px; height:44px; line-height:44px; padding:0 14px;
  }
  /* 让 tab 平均分布占满宽度 */
  .main-tabs :deep(.el-tabs__nav) {
    display:flex; width:100%;
  }
  .main-tabs :deep(.el-tabs__nav .el-tabs__item) {
    flex:1; text-align:center;
  }
}

/* ===================== FACADE ===================== */
.facade-upload-panel { margin-bottom:24px; }
.section-header { display:flex; align-items:center; justify-content:space-between; }
.facade-form { margin-top:24px; max-width:680px; }
.facade-actions { display:flex; gap:12px; margin-top:20px; flex-wrap:wrap; }
.facade-workspace { width: 100%; margin-top: 16px; }
.scale-fine-tune-section { width: 100%; margin-bottom: 8px; }
.facade-result-layout {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 8px;
}
.facade-result-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 20px;
  align-items: stretch;
  min-height: 420px;
}
.facade-viz-panel {
  min-width: 0;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e4e7ed;
  padding: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}
.facade-stats-panel { min-width: 0; }
.facade-heatmap-output-section {
  margin-top: 4px;
}
.facade-detection-panel {
  margin-top: 4px;
}

@media (max-width: 992px) {
  .facade-result-top { grid-template-columns: 1fr; min-height: 0; }
}

.facade-file-preview {
  display:flex; align-items:center; justify-content:center; gap:14px; padding:24px;
}
.facade-file-info { text-align:left; }
.facade-file-name { font-size:15px; font-weight:600; color:#303133; word-break:break-all; }
.facade-file-meta { font-size:12px; color:#909399; margin-top:4px; }
.facade-actions :deep(.el-tag) { margin-left:auto; }

.facade-report-card { margin-top:24px; }
.facade-recommendation { margin:16px 0; }
.facade-section-title { margin:18px 0 10px; color:#003a66; font-size:15px; }
.facade-report-card .d-dot {
  display:inline-block; width:10px; height:10px; border-radius:50%;
  margin-right:6px; vertical-align:middle;
}

/* ===================== TABS ===================== */
.main-tabs { width:100%; }
.main-tabs :deep(.el-tabs__header) {
  margin-bottom:20px;
  position:sticky; top:0; z-index:10;
  background:rgba(244,250,255,0.92);
  backdrop-filter:blur(8px);
}
.main-tabs :deep(.el-tabs__nav-wrap) { padding:0 8px; }
.main-tabs :deep(.el-tabs__item) {
  font-size:15px; font-weight:500;
  height:48px; line-height:48px;
}
@media (max-width:768px) {
  .main-tabs :deep(.el-tabs__header) { margin-bottom:14px; }
  .main-tabs :deep(.el-tabs__item) {
    font-size:14px; height:44px; line-height:44px; padding:0 14px;
  }
  /* 让 tab 平均分布占满宽度 */
  .main-tabs :deep(.el-tabs__nav) {
    display:flex; width:100%;
  }
  .main-tabs :deep(.el-tabs__nav .el-tabs__item) {
    flex:1; text-align:center;
  }
}

/* ===================== RESPONSIVE ===================== */
/* Tablet */
@media (max-width:992px) {
  .hero-banner { padding:40px 20px 48px; }
  .hero-banner h1 { font-size:26px; }
  .main-content { padding:20px 16px 32px; }
  .card-head { flex-direction:column; align-items:flex-start; gap:12px; }
  .card-head-right { width:100%; justify-content:space-between; }
}

/* Mobile */
@media (max-width:768px) {
  .hero-banner { padding:20px 12px 0; }
  .hero-banner h1 { font-size:19px; letter-spacing:0.3px; line-height:1.3; }
  .hero-sub { font-size:12px; margin-bottom:12px; opacity:.8; }
  .hero-tags { gap:6px; }
  .htag { padding:3px 10px; font-size:11px; border-radius:14px; letter-spacing:0; }
  .hero-features { gap:4px; flex-wrap:wrap; justify-content:center; }
  .hf-item { padding:6px 10px; font-size:11px; }
  .hf-arrow { font-size:10px; display:none; }

  /* Hero steps: 强制单行不换行 */
  .hero-steps {
    padding:10px 8px;
    gap:0;
    flex-wrap:nowrap !important;
    overflow-x:auto;
    -webkit-overflow-scrolling:touch;
    scrollbar-width:none;
  }
  .hero-steps::-webkit-scrollbar { display:none; }
  .hs { gap:5px; flex-shrink:0; }
  .hs-num { width:22px; height:22px; font-size:11px; border-width:1.5px; }
  .hs.active .hs-num,
  .hs.done .hs-num { box-shadow:0 0 0 2px rgba(255,255,255,.2); }
  .hs-label { font-size:11px; letter-spacing:0; }
  .hs-line { width:20px; margin:0 6px; height:1.5px; }


  /* Hero steps: 强制单行不换行 */
  .hero-steps {
    padding:10px 8px;
    gap:0;
    flex-wrap:nowrap !important;
    overflow-x:auto;
    -webkit-overflow-scrolling:touch;
    scrollbar-width:none;
  }
  .hero-steps::-webkit-scrollbar { display:none; }
  .hs { gap:5px; flex-shrink:0; }
  .hs-num { width:22px; height:22px; font-size:11px; border-width:1.5px; }
  .hs.active .hs-num,
  .hs.done .hs-num { box-shadow:0 0 0 2px rgba(255,255,255,.2); }
  .hs-label { font-size:11px; letter-spacing:0; }
  .hs-line { width:20px; margin:0 6px; height:1.5px; }

  .main-content { padding:0 12px 24px; }
  .glass-card { padding:14px; margin-bottom:16px; border-radius:12px; }
  .card-title { font-size:15px; }
  .card-icon { width:28px; height:28px; border-radius:8px; }

  /* Step bar mobile (老版 .step-bar，兼容保留) */
  .step-bar { gap:0; padding:12px 8px; }
  .step-item { flex-direction:column; gap:4px; }
  .step-num { width:24px; height:24px; font-size:11px; }
  .step-text { font-size:10px; text-align:center; max-width:60px; }
  .step-line { width:20px; height:2px; }
  
  /* Stats mobile */
  .stat-grid { grid-template-columns:1fr 1fr; gap:8px; }
  .stat-card { padding:12px 10px; gap:8px; border-radius:10px; }
  .stat-icon-bg { width:32px; height:32px; border-radius:8px; }
  .stat-num { font-size:18px; }
  .stat-lbl { font-size:11px; }
  
  /* Disease list mobile */
  .disease-row { padding:10px 12px; }
  .disease-meta { font-size:12px; padding-left:14px; }
  
  /* Upload area mobile */
  .upload-area { min-height:140px; }
  .upload-icon { font-size:36px !important; }
  .upload-tip { font-size:13px; }
  .upload-hint { font-size:11px; }
  
  /* Scale input mobile */
  .scale-input-row { flex-direction:column; align-items:stretch; gap:8px; padding:10px 12px; }
  .scale-input-row .el-input-number { width:100%; }
  .scale-unit { font-size:12px; text-align:center; }
  
  /* Detection image mobile */
  .detection-image-wrap { border-radius:10px; }
  .bbox-label { font-size:10px; padding:2px 5px; }
  
  /* Legend mobile */
  .legend-bar { gap:12px; padding:10px 0; }
  .legend-item { font-size:11px; gap:4px; }
  .legend-dot { width:8px; height:8px; }
  
  /* Report button mobile */
  .report-btn { height:40px; font-size:14px; }
  
  /* Model badge mobile */
  .model-badge { font-size:11px; padding:4px 10px; }
  
  /* Footer mobile */
  .app-footer { padding:20px 16px; }
  .footer-inner p { font-size:12px; }
}

/* Small mobile */
@media (max-width:480px) {
  .hero-banner { padding:24px 12px 32px; }
  .hero-banner h1 { font-size:18px; }
  .hero-sub { font-size:12px; }
  .hf-item { padding:5px 8px; font-size:10px; }
  .main-content { padding:0 10px 20px; }
  .glass-card { padding:12px; }
  .stat-grid { grid-template-columns:1fr; gap:8px; }
  .stat-card { padding:14px 12px; }
  .stat-num { font-size:20px; }
  .step-bar { padding:10px 4px; }
  .step-text { font-size:9px; max-width:50px; }
  .step-line { width:12px; }
  .card-head-right { flex-direction:column; gap:8px; }
  .card-head-right .el-button { width:100%; }
}

/* Touch device optimizations */
@media (hover:none) and (pointer:coarse) {
  .stat-card:hover { transform:none; }
  .disease-row:hover { transform:none; }
  .glass-card:hover { box-shadow:0 4px 24px rgba(0,112,192,.07), 0 1px 3px rgba(0,0,0,.04); }
  .upload-area:hover { border-color:#0080CB; }
  
  /* Larger touch targets */
  .el-button { min-height:44px; }
  .disease-row { padding:14px; }
  .legend-item { padding:8px 4px; }
}

/* Scroll top button mobile */
@media (max-width:768px) {
  .scroll-top-btn { right:12px; bottom:16px; width:40px; height:40px; }
}

/* Landscape mobile */
@media (max-width:768px) and (orientation:landscape) {
  .hero-banner { padding:20px 16px 28px; }
  .hero-banner h1 { font-size:20px; }
  .hero-steps { padding:10px 12px; }
  .hero-steps { padding:10px 12px; }
  .stat-grid { grid-template-columns:repeat(4, 1fr); }
  .stat-card { padding:10px 8px; }
  .stat-num { font-size:16px; }
}

/* ===================== FACADE TAB: 手机竖屏 / 横屏 / 桌面横屏 ===================== */
@media (max-width:768px) {
  .facade-upload-panel { margin-bottom:16px; }
  .facade-form { margin-top:16px; max-width:100%; }
  .facade-form :deep(.el-form-item) { margin-bottom:14px; }
  .facade-form :deep(.el-form-item__label) {
    font-size:13px; color:#003a66; font-weight:500;
    line-height:1.4; padding-bottom:6px;
  }
  /* 输入框统一占满整行（label-position=top 模式下） */
  .facade-form :deep(.el-input),
  .facade-form :deep(.el-input-number),
  .facade-form :deep(.el-input__wrapper) { width:100%; }
  .facade-form :deep(.el-input-number .el-input__inner) { text-align:left; padding-left:8px; }

  .facade-actions { flex-direction:column; gap:10px; }
  .facade-actions .el-button { width:100%; margin-left:0 !important; }
  .facade-actions :deep(.el-tag) { margin-left:0; align-self:flex-start; }

  .facade-file-preview { padding:14px; gap:10px; flex-direction:column; text-align:center; }
  .facade-file-info { text-align:center; }
  .facade-file-name { font-size:13px; }
  .facade-file-meta { font-size:11px; }

  .facade-result-layout { gap:14px; }

  .facade-section-title { font-size:14px; margin:14px 0 8px; }
}

/* 窄屏：墙体宽/高/网格三个数字输入并排成 3 列，节省纵向空间 */
@media (min-width:481px) and (max-width:768px) {
  .facade-form :deep(.el-form-item:nth-child(3)),
  .facade-form :deep(.el-form-item:nth-child(4)),
  .facade-form :deep(.el-form-item:nth-child(5)) {
    display:inline-block; width:calc(33.333% - 8px); vertical-align:top;
  }
  .facade-form :deep(.el-form-item:nth-child(3)) { margin-right:12px; }
  .facade-form :deep(.el-form-item:nth-child(4)) { margin-right:12px; }
}

/* 桌面超宽屏：避免单图检测左右分栏过宽 */
@media (min-width:1600px) {
  .main-content { max-width:1320px; }
}

/* 桌面横屏（普通 16:9）确保立面热力图与右侧看板比例舒适 */
@media (min-width:993px) and (max-width:1599px) {
  .facade-result-top { grid-template-columns: minmax(0, 1fr) 380px; }
}
@media (min-width:1600px) {
  .facade-result-top { grid-template-columns: minmax(0, 1fr) 420px; }
}
@media (min-width:769px) and (max-width:992px) {
  .facade-result-top { grid-template-columns: 1fr; }
  .facade-actions { gap:10px; }
  .main-content { padding:24px 18px 32px; }
}
@media (-webkit-min-device-pixel-ratio: 2) and (max-width: 768px) {
  .stat-card, .disease-row, .glass-card { transition:none; }
}

</style>
