<template>
  <div class="shooting-guide">
    <!-- Header -->
    <div class="guide-header">
      <div class="gh-left">
        <div class="gh-icon">
          <el-icon :size="20"><Camera /></el-icon>
        </div>
        <div class="gh-text">
          <h3>三步法快速查勘指南</h3>
          <p class="gh-sub">帮您拍出专家级照片，确保 AI 精准识别</p>
        </div>
      </div>
      <el-button 
        :type="expanded ? 'primary' : 'default'" 
        size="small" 
        @click="expanded = !expanded"
        class="gh-toggle"
      >
        {{ expanded ? '收起指南' : '展开指南' }}
        <el-icon class="toggle-icon" :class="{ rotated: expanded }">
          <ArrowDown />
        </el-icon>
      </el-button>
    </div>
    
    <el-collapse-transition>
      <div v-show="expanded" class="guide-content">
        <!-- Three Steps -->
        <div class="steps-container">
          <div 
            v-for="(step, idx) in steps" 
            :key="idx" 
            class="step-block"
            :class="{ active: activeStep === idx }"
            @click="activeStep = idx"
          >
            <div class="step-header">
              <div class="step-badge" :class="'badge-' + (idx + 1)">
                <span class="step-num">{{ idx + 1 }}</span>
              </div>
              <div class="step-title-wrap">
                <h4>{{ step.title }}</h4>
                <p class="step-subtitle">{{ step.subtitle }}</p>
              </div>
            </div>
            
            <!-- Comparison Images -->
            <div class="comparison-wrap">
              <div class="compare-item wrong">
                <div class="compare-visual">
                  <div class="visual-placeholder" :class="'wrong-' + (idx + 1)">
                    <el-icon :size="28" color="#ef4444"><CircleClose /></el-icon>
                    <span class="visual-label">{{ step.wrongLabel }}</span>
                  </div>
                </div>
                <div class="compare-badge bad">
                  <el-icon :size="12"><Close /></el-icon>
                  <span>错误</span>
                </div>
              </div>
              
              <div class="compare-arrow">
                <el-icon :size="18" color="#0070C0"><Right /></el-icon>
              </div>
              
              <div class="compare-item correct">
                <div class="compare-visual">
                  <div class="visual-placeholder" :class="'correct-' + (idx + 1)">
                    <el-icon :size="28" color="#10b981"><CircleCheck /></el-icon>
                    <span class="visual-label">{{ step.correctLabel }}</span>
                  </div>
                </div>
                <div class="compare-badge good">
                  <el-icon :size="12"><Check /></el-icon>
                  <span>正确</span>
                </div>
              </div>
            </div>
            
            <!-- Guidance Text -->
            <div class="guidance-box">
              <el-icon :size="14" color="#0070C0"><InfoFilled /></el-icon>
              <p>{{ step.guidance }}</p>
            </div>
            
            <!-- Technical Note -->
            <div class="tech-note">
              <span class="tn-label">技术原理：</span>
              <span class="tn-text">{{ step.techNote }}</span>
            </div>
          </div>
        </div>
        
        <!-- Quick Tips Summary -->
        <div class="tips-summary">
          <div class="tips-header">
            <el-icon :size="14" color="#f59e0b"><Warning /></el-icon>
            <span>系统自动质检（后端软质检）</span>
          </div>
          <div class="tips-grid">
            <div class="tip-card">
              <div class="tc-icon brightness">
                <el-icon :size="18"><Sunny /></el-icon>
              </div>
              <div class="tc-text">
                <b>亮度检测</b>
                <span>过暗提示开闪光灯</span>
              </div>
            </div>
            <div class="tip-card">
              <div class="tc-icon blur">
                <el-icon :size="18"><View /></el-icon>
              </div>
              <div class="tc-text">
                <b>模糊检测</b>
                <span>画面糊提示重拍</span>
              </div>
            </div>
            <div class="tip-card">
              <div class="tc-icon distance">
                <el-icon :size="18"><Aim /></el-icon>
              </div>
              <div class="tc-text">
                <b>距离预估</b>
                <span>砖块过多提示靠近</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Bottom Slogan -->
        <div class="guide-slogan">
          <span class="slogan-quote">"</span>
          <span>我们把复杂的算法参数隐藏在三个简单动作里，真正做到 <b>查勘即报告</b></span>
        </div>
      </div>
    </el-collapse-transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// 手机默认折叠，桌面默认展开
const expanded = ref(typeof window === 'undefined' ? true : window.innerWidth > 768)
const activeStep = ref(0)

const steps = [
  {
    title: '比例与距离',
    subtitle: '对齐AI视网膜',
    wrongLabel: '太远，砖如芝麻',
    correctLabel: '横向刚好 6 块砖',
    guidance: '必须将手机相机裁剪比例设置为“1:1”（正方形）模式！随后靠近墙面（约 1～1.5 米），确保画面横向边缘处刚好容纳约 6 块完整红砖。',
    techNote: '严格呼应后端单图定量分析算法（imageWidth / 6），1:1 正方形构图可完美填满 YOLOv11 核心特征矩阵，杜绝长方形黑边导致的拉伸矮化，实现受损面积与物理长度的毫米级精准反算。'
  },
  {
    title: '角度正不正',
    subtitle: '防透视畸变',
    wrongLabel: '斜拍，砖缝倾斜',
    correctLabel: '正对，横平竖直',
    guidance: '不要斜着拍！手机请正对墙面，保持横平竖直，减少画面变形。避免任何上下或左右倾斜，防止正方形切片产生透视畸变，确保多边形掩膜（Polygon Mask）精准贴合砖面。',
    techNote: '减少透视畸变，提升后期正射影像合成的成功率，确保病害面积统计的准确性。'
  },
  {
    title: '画面清不清',
    subtitle: '控环境干扰',
    wrongLabel: '模糊/浓重阴影',
    correctLabel: '光线均匀清晰',
    guidance: '不要拍模糊！手要稳，避开强光直射或浓重阴影。',
    techNote: '降低运动模糊和阴影对"病害阈值法"的干扰，防止系统将阴影误报为裂缝。'
  }
]
</script>

<style scoped>
.shooting-guide {
  background: linear-gradient(135deg, #f0f9ff 0%, #e6f2fb 100%);
  border: 1px solid #d6ebf7;
  border-radius: 14px;
  padding: 16px 18px;
  margin-bottom: 20px;
  box-shadow: 0 2px 12px rgba(0, 112, 192, 0.06);
}

/* ==================== HEADER ==================== */
.guide-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.gh-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.gh-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #0070C0, #0080CB);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.gh-text h3 {
  font-size: 15px;
  font-weight: 700;
  color: #003a66;
  margin: 0;
}

.gh-sub {
  font-size: 12px;
  color: #666;
  margin: 2px 0 0;
}

.gh-toggle {
  flex-shrink: 0;
}

.toggle-icon {
  transition: transform 0.3s;
  margin-left: 4px;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

/* ==================== CONTENT ==================== */
.guide-content {
  margin-top: 16px;
}

/* ==================== STEPS ==================== */
.steps-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}

.step-block {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.25s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.step-block:hover {
  border-color: #bae6fd;
  box-shadow: 0 4px 16px rgba(0, 112, 192, 0.1);
}

.step-block.active {
  border-color: #0070C0;
  box-shadow: 0 4px 20px rgba(0, 112, 192, 0.15);
}

.step-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.step-badge {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.badge-1 { background: linear-gradient(135deg, #0070C0, #0080CB); }
.badge-2 { background: linear-gradient(135deg, #10b981, #34d399); }
.badge-3 { background: linear-gradient(135deg, #f59e0b, #fbbf24); }

.step-num {
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.step-title-wrap h4 {
  font-size: 14px;
  font-weight: 700;
  color: #003a66;
  margin: 0;
}

.step-subtitle {
  font-size: 11px;
  color: #888;
  margin: 2px 0 0;
}

/* ==================== COMPARISON ==================== */
.comparison-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.compare-item {
  flex: 1;
  position: relative;
}

.compare-visual {
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 4/3;
}

.visual-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
}

/* Wrong examples - red tinted backgrounds */
.wrong-1 {
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
  border: 1px dashed #fca5a5;
}
.wrong-2 {
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
  border: 1px dashed #fca5a5;
}
.wrong-3 {
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
  border: 1px dashed #fca5a5;
}

/* Correct examples - green tinted backgrounds */
.correct-1 {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border: 1px dashed #86efac;
}
.correct-2 {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border: 1px dashed #86efac;
}
.correct-3 {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border: 1px dashed #86efac;
}

.visual-label {
  font-size: 10px;
  color: #666;
  text-align: center;
  line-height: 1.3;
}

.compare-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}

.compare-badge.bad {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.compare-badge.good {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
}

.compare-arrow {
  flex-shrink: 0;
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ==================== GUIDANCE ==================== */
.guidance-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.guidance-box .el-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.guidance-box p {
  margin: 0;
  font-size: 12px;
  color: #1e40af;
  line-height: 1.5;
  font-weight: 500;
}

/* ==================== TECH NOTE ==================== */
.tech-note {
  font-size: 11px;
  color: #666;
  line-height: 1.5;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 6px;
  border-left: 3px solid #cbd5e1;
}

.tn-label {
  color: #0070C0;
  font-weight: 600;
}

.tn-text {
  color: #64748b;
}

/* ==================== TIPS SUMMARY ==================== */
.tips-summary {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
}

.tips-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #92400e;
  margin-bottom: 10px;
}

.tips-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.tip-card {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border-radius: 8px;
  padding: 10px;
  border: 1px solid #fde68a;
}

.tc-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tc-icon.brightness {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  color: #d97706;
}

.tc-icon.blur {
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
  color: #2563eb;
}

.tc-icon.distance {
  background: linear-gradient(135deg, #d1fae5, #a7f3d0);
  color: #059669;
}

.tc-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tc-text b {
  font-size: 12px;
  color: #333;
}

.tc-text span {
  font-size: 10px;
  color: #888;
}

/* ==================== SLOGAN ==================== */
.guide-slogan {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 8px;
  font-size: 12px;
  color: #0369a1;
  line-height: 1.5;
}

.slogan-quote {
  font-size: 24px;
  font-weight: 700;
  color: #0070C0;
  line-height: 1;
}

.guide-slogan b {
  color: #0070C0;
  font-weight: 700;
}

/* ==================== RESPONSIVE ==================== */
@media (max-width: 992px) {
  .steps-container {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  
  .tips-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}

@media (max-width: 768px) {
  .shooting-guide {
    padding: 14px;
    margin-bottom: 16px;
    border-radius: 12px;
  }
  
  .guide-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .gh-toggle {
    width: 100%;
  }
  
  .gh-icon {
    width: 36px;
    height: 36px;
  }
  
  .gh-text h3 {
    font-size: 14px;
  }
  
  .gh-sub {
    font-size: 11px;
  }
  
  .step-block {
    padding: 12px;
  }
  
  .step-badge {
    width: 28px;
    height: 28px;
  }
  
  .step-num {
    font-size: 12px;
  }
  
  .step-title-wrap h4 {
    font-size: 13px;
  }
  
  .comparison-wrap {
    gap: 6px;
  }

  .compare-visual {
    aspect-ratio: 16/9;
  }

  .visual-placeholder {
    padding: 6px;
  }
  
  .visual-label {
    font-size: 9px;
  }
  
  .guidance-box {
    padding: 8px 10px;
  }
  
  .guidance-box p {
    font-size: 11px;
  }
  
  .tech-note {
    font-size: 10px;
    padding: 6px 8px;
  }
  
  .tips-summary {
    padding: 10px 12px;
  }
  
  .tips-header {
    font-size: 12px;
  }
  
  .tip-card {
    padding: 8px;
    gap: 6px;
  }
  
  .tc-icon {
    width: 32px;
    height: 32px;
  }
  
  .tc-text b {
    font-size: 11px;
  }
  
  .tc-text span {
    font-size: 9px;
  }
  
  .guide-slogan {
    padding: 8px 12px;
    font-size: 11px;
  }
  
  .slogan-quote {
    font-size: 20px;
  }
}

@media (max-width: 480px) {
  .shooting-guide {
    padding: 12px;
  }
  
  .gh-left {
    gap: 10px;
  }
  
  .gh-icon {
    width: 32px;
    height: 32px;
  }
  
  .gh-text h3 {
    font-size: 13px;
  }
  
  .step-header {
    gap: 8px;
    margin-bottom: 10px;
  }
  
  .step-badge {
    width: 24px;
    height: 24px;
  }
  
  .step-num {
    font-size: 11px;
  }
  
  .compare-arrow {
    width: 20px;
  }
  
  .compare-badge {
    padding: 1px 4px;
    font-size: 9px;
  }
}

/* Touch optimizations */
@media (hover: none) and (pointer: coarse) {
  .step-block {
    cursor: default;
  }
  
  .step-block:active {
    border-color: #0070C0;
  }
  
  .tip-card {
    padding: 12px;
  }
}
</style>
