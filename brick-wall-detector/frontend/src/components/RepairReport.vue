<template>
  <div id="repair-report" class="report-wrap">
    <div class="report-glass">
      <!-- Report Header -->
      <div class="rpt-top">
        <div class="rpt-top-left">
          <span class="rpt-icon"><el-icon :size="20"><Document /></el-icon></span>
          <div>
            <h2 class="rpt-title">{{ report.title }}</h2>
            <p class="rpt-time">{{ fmtDate(report.generatedAt) }}</p>
          </div>
        </div>
        <el-dropdown trigger="click" @command="handleExport">
          <el-button type="primary">
            <el-icon><Download /></el-icon>&ensp;一键导出报告
            <el-icon class="arrow-icon"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="word">
                <el-icon><Document /></el-icon>&ensp;导出 Word (.doc)
              </el-dropdown-item>
              <el-dropdown-item command="markdown">
                <el-icon><Memo /></el-icon>&ensp;导出 Markdown (.md)
              </el-dropdown-item>
              <el-dropdown-item command="json">
                <el-icon><DataLine /></el-icon>&ensp;导出 JSON (.json)
              </el-dropdown-item>
              <el-dropdown-item divided command="print">
                <el-icon><Printer /></el-icon>&ensp;打印 / 保存为 PDF
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <el-divider />

      <!-- Section 1: Overall -->
      <div class="rpt-section">
        <div class="section-head">
          <span class="sec-num">01</span>
          <h3>总体评估</h3>
        </div>
        <div class="assessment-grid">
          <div class="assess-card ac-blue">
            <div class="ac-icon"><el-icon :size="22"><Grid /></el-icon></div>
            <div class="ac-body">
              <div class="ac-val">{{ report.overallAssessment.totalDiseaseTypes }}<small> 种</small></div>
              <div class="ac-lbl">病害种类</div>
            </div>
          </div>
          <div class="assess-card ac-teal">
            <div class="ac-icon"><el-icon :size="22"><Warning /></el-icon></div>
            <div class="ac-body">
              <div class="ac-val">{{ report.overallAssessment.totalDetections }}<small> 处</small></div>
              <div class="ac-lbl">检出总数</div>
            </div>
          </div>
          <div class="assess-card ac-red">
            <div class="ac-icon"><el-icon :size="22"><Histogram /></el-icon></div>
            <div class="ac-body">
              <div class="ac-val">{{ report.overallAssessment.weatheringArea }}<small> m²</small></div>
              <div class="ac-lbl">风化面积</div>
            </div>
          </div>
          <div class="assess-card ac-purple">
            <div class="ac-icon"><el-icon :size="22"><Histogram /></el-icon></div>
            <div class="ac-body">
              <div class="ac-val">{{ report.overallAssessment.efflorescenceArea }}<small> m²</small></div>
              <div class="ac-lbl">泛碱面积</div>
            </div>
          </div>
        </div>

        <!-- 修缮费用：功能待开发 -->
        <div class="assess-card ac-gold cost-card cost-pending">
          <div class="ac-icon"><el-icon :size="22"><Coin /></el-icon></div>
          <div class="ac-body">
            <div class="ac-val pending-val">功能待开发</div>
            <div class="ac-lbl">修缮费用估算</div>
          </div>
        </div>

        <div class="risk-banner" :class="riskClass">
          <div class="risk-left">
            <span class="risk-label">综合风险等级</span>
            <span class="risk-val">{{ report.overallAssessment.overallRisk }}</span>
          </div>
          <div class="risk-rec">{{ report.overallAssessment.recommendation }}</div>
        </div>

        <!-- 专业说明 -->
        <div v-if="report.professionalNote" class="professional-note">
          <el-icon><InfoFilled /></el-icon>
          <span>{{ report.professionalNote }}</span>
        </div>
      </div>

      <!-- Section 2: Disease Details -->
      <div class="rpt-section">
        <div class="section-head">
          <span class="sec-num">02</span>
          <h3>病害详情与修缮方案</h3>
        </div>

        <div v-for="(d, idx) in report.diseaseDetails" :key="d.name" class="dd-card" :class="{ detected: d.detected }">
          <div class="dd-top" :style="{ borderLeftColor: d.color }">
            <span class="dd-idx" :style="{ background: d.color }">{{ Number(idx) + 1 }}</span>
            <span class="dd-name">{{ d.name }}</span>
            <el-tag :type="d.detected ? sevType(d.maxSeverity) : 'info'" size="small" effect="dark" round>
              {{ d.detected ? d.maxSeverity : '未检出' }}
            </el-tag>
            <span v-if="d.detected" class="dd-stat">
              {{ d.count }} 处<template v-if="d.totalArea">&ensp;·&ensp;{{ d.totalArea.toFixed(2) }} m²</template>
            </span>
          </div>
          <div class="dd-body">
            <div class="dd-field">
              <span class="dd-fl">病害描述</span>
              <span class="dd-fv">{{ d.description }}</span>
            </div>
            <div class="dd-field">
              <span class="dd-fl">严重程度</span>
              <span class="dd-fv">{{ d.severity }}</span>
            </div>
            <div class="dd-field">
              <span class="dd-fl">修缮方法</span>
              <div class="dd-fv">
                <div v-for="(s, i) in d.repairMethod" :key="Number(i)" class="repair-step">
                  <span class="rs-num">{{ Number(i) + 1 }}</span>
                  <span>{{ s }}</span>
                </div>
              </div>
            </div>
            <div class="dd-field">
              <span class="dd-fl">修缮材料</span>
              <span class="dd-fv">{{ d.materials }}</span>
            </div>
            <div class="dd-field">
              <span class="dd-fl">预防措施</span>
              <span class="dd-fv">{{ d.preventionMeasures }}</span>
            </div>
            <div v-if="d.detected" class="dd-field dd-cost">
              <span class="dd-fl">费用估算</span>
              <span class="dd-fv pending-inline">功能待开发</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 3: Priority -->
      <div class="rpt-section">
        <div class="section-head">
          <span class="sec-num">03</span>
          <h3>修缮优先级计划</h3>
        </div>

        <div v-if="report.repairPlan.urgentItems.length" class="pri-block urgent">
          <div class="pri-head"><span class="pri-dot urgent-dot"></span><h4>紧急处理（重度）</h4></div>
          <ul><li v-for="it in report.repairPlan.urgentItems" :key="it.name"><b>{{ it.name }}</b> — {{ it.count }} 处，建议立即修缮</li></ul>
        </div>
        <div v-if="report.repairPlan.importantItems.length" class="pri-block important">
          <div class="pri-head"><span class="pri-dot important-dot"></span><h4>重点关注（中度）</h4></div>
          <ul><li v-for="it in report.repairPlan.importantItems" :key="it.name"><b>{{ it.name }}</b> — {{ it.count }} 处，尽快安排修缮</li></ul>
        </div>
        <div v-if="report.repairPlan.routineItems.length" class="pri-block routine">
          <div class="pri-head"><span class="pri-dot routine-dot"></span><h4>常规维护（轻度）</h4></div>
          <ul><li v-for="it in report.repairPlan.routineItems" :key="it.name"><b>{{ it.name }}</b> — {{ it.count }} 处，纳入日常维护</li></ul>
        </div>
      </div>

      <!-- Section 4: Grid Analysis -->
      <div v-if="report.gridAnalysis && report.gridAnalysis.length > 0" class="rpt-section">
        <div class="section-head">
          <span class="sec-num">04</span>
          <h3>网格病害分布（供 QGIS 参考）</h3>
        </div>
        <div class="grid-analysis">
          <el-table :data="report.gridAnalysis" stripe size="small" style="width: 100%">
            <el-table-column prop="gridId" label="网格编号" width="100" />
            <el-table-column prop="total" label="病害数" width="80" />
            <el-table-column prop="severity" label="最高严重度" width="100">
              <template #default="{ row }">
                <el-tag :type="sevType(row.severity)" size="small" effect="dark" round>{{ row.severity }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="病害类型">
              <template #default="{ row }">
                <span v-for="(count, disease) in row.diseases" :key="String(disease)" class="grid-disease-tag">
                  {{ disease }}: {{ count }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="priority" label="优先级" width="80">
              <template #default="{ row }">
                <span class="priority-badge" :class="'p' + row.priority">P{{ row.priority }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <!-- Footer -->
      <div class="rpt-bottom">
        <div class="rb-item"><span class="rb-label">检测模型</span><span>YOLOv11-BrickWall</span></div>
        <div class="rb-item"><span class="rb-label">部署平台</span><span>阿里云 PAI</span></div>
        <div class="rb-item"><span class="rb-label">报告时间</span><span>{{ fmtDate(report.generatedAt) }}</span></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{ report: any }>()

const riskClass = computed(() => {
  const r = props.report.overallAssessment.overallRisk
  return r === '高风险' ? 'risk-high' : r === '中风险' ? 'risk-mid' : 'risk-low'
})

function sevType(s: string) { return s === '重度' ? 'danger' : s === '中度' ? 'warning' : 'success' }
function fmtDate(iso: string) { return iso ? new Date(iso).toLocaleString('zh-CN') : '-' }
function printReport() { window.print() }
function formatCost(cost: number) { return cost >= 10000 ? (cost / 10000).toFixed(1) + '万' : cost.toLocaleString() }

// ==================== Export ====================
function filename(ext: string) {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `砖墙修缮报告_${ts}.${ext}`
}

function download(content: string | Blob, name: string, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function handleExport(cmd: string) {
  try {
    if (cmd === 'word') exportWord()
    else if (cmd === 'markdown') exportMarkdown()
    else if (cmd === 'json') exportJson()
    else if (cmd === 'print') printReport()
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e?.message || '未知错误'))
  }
}

function exportJson() {
  // 构建 QGIS 兼容的 JSON 格式
  const r = props.report
  const qgisData = {
    type: 'BrickWallDiseaseReport',
    version: '1.0',
    metadata: {
      title: r.title,
      generatedAt: r.generatedAt,
      detectionTime: r.detectionTime,
      brickLengthMm: r.brickLengthMm || 240,
      professionalNote: r.professionalNote
    },
    overallAssessment: r.overallAssessment,
    gridAnalysis: (r.gridAnalysis || []).map((g: any) => ({
      gridId: g.gridId,
      totalDiseases: g.total,
      severity: g.severity,
      priority: g.priority,
      diseaseBreakdown: g.diseases
    })),
    diseaseDetails: r.diseaseDetails.map((d: any) => ({
      name: d.name,
      detected: d.detected,
      count: d.count,
      totalArea: d.totalArea,
      maxSeverity: d.maxSeverity,
      estimatedCost: d.estimatedCost,
      quantity: d.quantity,
      unit: d.unit
    })),
    repairPriority: {
      urgent: r.repairPlan.urgentItems.map((it: any) => it.name),
      important: r.repairPlan.importantItems.map((it: any) => it.name),
      routine: r.repairPlan.routineItems.map((it: any) => it.name)
    }
  }
  const json = JSON.stringify(qgisData, null, 2)
  download(json, filename('json'), 'application/json;charset=utf-8')
  ElMessage.success('JSON 报告已导出（QGIS 兼容格式）')
}

function exportMarkdown() {
  const r = props.report
  const a = r.overallAssessment
  const lines: string[] = []

  lines.push(`# ${r.title || '红砖墙病害修缮报告'}`)
  lines.push('')
  lines.push(`**生成时间：** ${fmtDate(r.generatedAt)}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // Section 1
  lines.push('## 01 总体评估')
  lines.push('')
  lines.push('| 指标 | 数值 |')
  lines.push('| --- | --- |')
  lines.push(`| 病害种类 | ${a.totalDiseaseTypes} 种 |`)
  lines.push(`| 检出总数 | ${a.totalDetections} 处 |`)
  lines.push(`| 风化面积 | ${a.weatheringArea} m² |`)
  lines.push(`| 泛碱面积 | ${a.efflorescenceArea} m² |`)
  lines.push(`| 综合风险 | **${a.overallRisk}** |`)
  lines.push(`| 修缮费用初估 | 功能待开发 |`)
  lines.push('')
  lines.push(`> ${a.recommendation}`)
  lines.push('')
  if (r.professionalNote) {
    lines.push(`> ℹ️ ${r.professionalNote}`)
    lines.push('')
  }

  // Section 2
  lines.push('## 02 五类病害详情与修缮方案')
  lines.push('')
  r.diseaseDetails.forEach((d: any, i: number) => {
    lines.push(`### ${i + 1}. ${d.name}${d.detected ? ` （${d.maxSeverity}）` : ' （未检出）'}`)
    lines.push('')
    if (d.detected) {
      const stat = d.totalArea ? `${d.count} 处，面积约 ${d.totalArea.toFixed(2)} m²` : `${d.count} 处`
      lines.push(`**检出统计：** ${stat}`)
      lines.push('')
    }
    lines.push(`**病害描述：** ${d.description}`)
    lines.push('')
    lines.push(`**严重程度：** ${d.severity}`)
    lines.push('')
    lines.push('**修缮方法：**')
    lines.push('')
    ;(d.repairMethod || []).forEach((s: string, idx: number) => lines.push(`${idx + 1}. ${s}`))
    lines.push('')
    lines.push(`**修缮材料：** ${d.materials}`)
    lines.push('')
    lines.push(`**预防措施：** ${d.preventionMeasures}`)
    lines.push('')
  })

  // Section 3
  lines.push('## 03 修缮优先级计划')
  lines.push('')
  const blocks: { key: string; title: string; suffix: string }[] = [
    { key: 'urgentItems', title: '🔴 紧急处理（重度）', suffix: '建议立即修缮' },
    { key: 'importantItems', title: '🟠 重点关注（中度）', suffix: '尽快安排修缮' },
    { key: 'routineItems', title: '🟢 常规维护（轻度）', suffix: '纳入日常维护' }
  ]
  blocks.forEach(b => {
    const items = r.repairPlan?.[b.key] || []
    if (!items.length) return
    lines.push(`### ${b.title}`)
    lines.push('')
    items.forEach((it: any) => lines.push(`- **${it.name}** — ${it.count} 处，${b.suffix}`))
    lines.push('')
  })

  lines.push('---')
  lines.push('')
  lines.push(`*检测模型：YOLOv11-BrickWall · 部署平台：阿里云 PAI*`)

  download(lines.join('\n'), filename('md'), 'text/markdown;charset=utf-8')
  ElMessage.success('Markdown 报告已导出')
}

function exportWord() {
  const r = props.report
  const a = r.overallAssessment

  const esc = (s: any) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))

  const diseaseHtml = (r.diseaseDetails || []).map((d: any, i: number) => {
    const statText = d.detected 
      ? esc(d.maxSeverity) + (d.totalArea ? `（${d.count} 处，${d.totalArea.toFixed(2)} m²）` : `（${d.count} 处）`)
      : '未检出'
    return `
    <div style="border:1px solid #ccc; border-left:4px solid ${d.color || '#999'}; padding:12px 16px; margin-bottom:14px;">
      <h3 style="margin:0 0 10px;color:#003a66;">${i + 1}. ${esc(d.name)}
        <span style="font-size:12px;color:#666;font-weight:normal;">
          — ${statText}
        </span>
      </h3>
      <p><b>病害描述：</b>${esc(d.description)}</p>
      <p><b>严重程度：</b>${esc(d.severity)}</p>
      <p><b>修缮方法：</b></p>
      <ol style="margin:4px 0 8px 24px;">
        ${(d.repairMethod || []).map((s: string) => `<li>${esc(s)}</li>`).join('')}
      </ol>
      <p><b>修缮材料：</b>${esc(d.materials)}</p>
      <p><b>预防措施：</b>${esc(d.preventionMeasures)}</p>
    </div>`
  }).join('')

  const priorityHtml = ([
    { key: 'urgentItems', title: '紧急处理（重度）', color: '#dc2626', suffix: '建议立即修缮' },
    { key: 'importantItems', title: '重点关注（中度）', color: '#d97706', suffix: '尽快安排修缮' },
    { key: 'routineItems', title: '常规维护（轻度）', color: '#16a34a', suffix: '纳入日常维护' }
  ] as const).map(b => {
    const items = r.repairPlan?.[b.key] || []
    if (!items.length) return ''
    return `
      <div style="border:1px solid #ddd;border-radius:4px;padding:10px 14px;margin-bottom:10px;">
        <h4 style="margin:0 0 6px;color:${b.color};">${b.title}</h4>
        <ul style="margin:0 0 0 24px;">
          ${items.map((it: any) => `<li><b>${esc(it.name)}</b> — ${it.count} 处，${b.suffix}</li>`).join('')}
        </ul>
      </div>`
  }).join('')

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${esc(r.title || '砖墙修缮报告')}</title>
<style>
  body { font-family: 'Microsoft YaHei', SimSun, sans-serif; line-height:1.7; color:#333; padding:20px; }
  h1 { color:#003a66; text-align:center; margin-bottom:8px; }
  h2 { color:#0070C0; border-bottom:2px solid #0070C0; padding-bottom:6px; margin-top:24px; }
  h3 { color:#003a66; }
  table { border-collapse:collapse; width:100%; margin:10px 0; }
  td, th { border:1px solid #888; padding:8px 12px; }
  th { background:#e6f2fb; }
  .meta { text-align:center; color:#666; font-size:12px; margin-bottom:20px; }
  .risk { padding:12px 16px; border-radius:4px; margin:14px 0; }
  .risk-high { background:#fff5f5; border:1px solid #fecaca; color:#dc2626; }
  .risk-mid { background:#fffbeb; border:1px solid #fde68a; color:#d97706; }
  .risk-low { background:#f0fdf4; border:1px solid #bbf7d0; color:#16a34a; }
</style>
</head>
<body>
  <h1>${esc(r.title || '红砖墙病害修缮报告')}</h1>
  <p class="meta">生成时间：${fmtDate(r.generatedAt)}　·　检测模型：YOLOv11-BrickWall　·　部署平台：阿里云 PAI</p>

  <h2>01 总体评估</h2>
  <table>
    <tr><th>病害种类</th><td>${a.totalDiseaseTypes} 种</td>
        <th>检出总数</th><td>${a.totalDetections} 处</td></tr>
    <tr><th>风化面积</th><td>${a.weatheringArea} m²</td>
        <th>泛碱面积</th><td>${a.efflorescenceArea} m²</td></tr>
    <tr><th>修缮费用初估</th><td colspan="3" style="color:#b45309;">功能待开发</td></tr>
  </table>
  <div class="risk ${riskClass.value}">
    <b>综合风险等级：${esc(a.overallRisk)}</b><br/>${esc(a.recommendation)}
  </div>
  ${r.professionalNote ? `<p style="color:#0369a1;background:#f0f9ff;padding:10px;border-radius:4px;margin-top:10px;">ℹ️ ${esc(r.professionalNote)}</p>` : ''}

  <h2>02 五类病害详情与修缮方案</h2>
  ${diseaseHtml}

  <h2>03 修缮优先级计划</h2>
  ${priorityHtml || '<p>无需修缮</p>'}
</body>
</html>`

  const blob = new Blob(['\ufeff' + html], { type: 'application/msword' })
  download(blob, filename('doc'), 'application/msword')
  ElMessage.success('Word 报告已导出')
}
</script>

<style scoped>
.report-wrap { margin-bottom:24px; }
.report-glass {
  background:rgba(255,255,255,.88); backdrop-filter:blur(12px);
  border:1px solid rgba(0,112,192,.08); border-radius:16px;
  box-shadow:0 4px 24px rgba(0,112,192,.07), 0 1px 3px rgba(0,0,0,.04);
  padding:28px; transition:box-shadow .3s;
}
.report-glass:hover { box-shadow:0 8px 32px rgba(0,112,192,.1); }

/* Report Top */
.rpt-top { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
.rpt-top-left { display:flex; align-items:center; gap:14px; }
.rpt-icon {
  width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg,#0070C0,#0080CB); color:#fff;
}
.rpt-title { font-size:20px; font-weight:700; color:#003a66; margin:0; }
.rpt-time { font-size:12px; color:#8899aa; margin-top:2px; }

/* Section head */
.rpt-section { margin-bottom:28px; }
.section-head { display:flex; align-items:center; gap:12px; margin-bottom:18px; }
.sec-num {
  font-size:13px; font-weight:700; color:#0070C0; background:#e6f2fb;
  padding:4px 10px; border-radius:6px; letter-spacing:1px;
}
.section-head h3 { font-size:17px; color:#003a66; margin:0; font-weight:600; }

/* Assessment grid */
.assessment-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px; }
.assess-card {
  border-radius:12px; padding:16px; display:flex; align-items:center; gap:12px;
  color:#fff; transition:transform .2s;
}
.assess-card:hover { transform:translateY(-2px); }
.ac-blue { background:linear-gradient(135deg,#005a99,#0080CB); }
.ac-teal { background:linear-gradient(135deg,#0d9488,#14b8a6); }
.ac-red { background:linear-gradient(135deg,#dc2626,#f87171); }
.ac-purple { background:linear-gradient(135deg,#7c3aed,#a78bfa); }
.ac-icon {
  width:42px; height:42px; border-radius:10px; background:rgba(255,255,255,.2);
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.ac-body { flex:1; }
.ac-val { font-size:22px; font-weight:700; line-height:1.2; }
.ac-val small { font-size:12px; font-weight:500; opacity:.85; }
.ac-lbl { font-size:12px; opacity:.85; margin-top:2px; }

/* Risk banner */
.risk-banner {
  border-radius:12px; padding:16px 20px; display:flex; align-items:center; justify-content:space-between;
  gap:20px; flex-wrap:wrap;
}
.risk-banner.risk-high { background:#fff5f5; border:1px solid #fecaca; }
.risk-banner.risk-mid { background:#fffbeb; border:1px solid #fde68a; }
.risk-banner.risk-low { background:#f0fdf4; border:1px solid #bbf7d0; }
.risk-left { display:flex; align-items:center; gap:12px; }
.risk-label { font-size:13px; color:#888; }
.risk-val { font-size:20px; font-weight:700; }
.risk-high .risk-val { color:#dc2626; }
.risk-mid .risk-val { color:#d97706; }
.risk-low .risk-val { color:#16a34a; }
.risk-rec { font-size:14px; color:#555; flex:1; text-align:right; }

/* Disease detail cards */
.dd-card {
  border:1px solid #d6ebf7; border-radius:12px; margin-bottom:16px; overflow:hidden;
  transition:all .2s;
}
.dd-card.detected { border-color:#a8d0ec; }
.dd-card:hover { box-shadow:0 4px 16px rgba(0,112,192,.08); }
.dd-top {
  display:flex; align-items:center; gap:10px; padding:14px 18px;
  background:linear-gradient(180deg,#f4faff,#eaf4fb); border-left:4px solid #ccc; flex-wrap:wrap;
}
.dd-idx {
  width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  color:#fff; font-size:13px; font-weight:700;
}
.dd-name { font-size:15px; font-weight:700; color:#003a66; }
.dd-stat { font-size:13px; color:#666; margin-left:auto; }
.dd-body { padding:16px 18px; }
.dd-field { display:flex; gap:12px; margin-bottom:10px; font-size:14px; line-height:1.7; }
.dd-fl {
  flex-shrink:0; width:72px; color:#8899aa; font-weight:600; font-size:12px;
  padding-top:2px; text-align:right;
}
.dd-fv { color:#444; flex:1; }
.repair-step { display:flex; align-items:flex-start; gap:8px; margin-bottom:6px; }
.rs-num {
  width:20px; height:20px; border-radius:50%; background:#e6f2fb; color:#0070C0;
  font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center;
  flex-shrink:0; margin-top:2px;
}

/* Priority blocks */
.pri-block { border-radius:10px; padding:16px 20px; margin-bottom:12px; }
.pri-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.pri-head h4 { font-size:15px; margin:0; color:#333; }
.pri-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
.urgent-dot { background:#dc2626; }
.important-dot { background:#d97706; }
.routine-dot { background:#16a34a; }
.pri-block ul { padding-left:24px; margin:0; }
.pri-block li { margin-bottom:4px; font-size:14px; color:#444; line-height:1.6; }
.pri-block.urgent { background:#fff5f5; border:1px solid #fecaca; }
.pri-block.important { background:#fffbeb; border:1px solid #fde68a; }
.pri-block.routine { background:#f0fdf4; border:1px solid #bbf7d0; }

/* Cost card */
.ac-gold { background:linear-gradient(135deg,#d97706,#fbbf24); }
.cost-card { grid-column:span 4; }
.cost-val { color:#d97706; font-weight:700; }
.cost-val small { color:#888; font-weight:400; }
.dd-cost { background:#fffbeb; border-radius:8px; padding:10px 12px !important; margin-top:8px; }
/* 功能待开发 */
.cost-pending .ac-val.pending-val {
  font-size:14px; font-weight:600; letter-spacing:.5px; opacity:.9;
}
.pending-inline {
  color:#b45309; background:#fef3c7; border:1px solid #fde68a;
  padding:2px 10px; border-radius:6px; font-size:12px; font-weight:600;
}

/* Professional note */
.professional-note {
  display:flex; align-items:center; gap:8px; margin-top:16px;
  padding:12px 16px; background:#f0f9ff; border:1px solid #bae6fd;
  border-radius:8px; font-size:13px; color:#0369a1;
}
.professional-note .el-icon { flex-shrink:0; }

/* Grid analysis */
.grid-analysis { margin-top:12px; }
.grid-disease-tag {
  display:inline-block; background:#e6f2fb; color:#0070C0;
  padding:2px 8px; border-radius:4px; font-size:12px; margin-right:6px; margin-bottom:4px;
}
.priority-badge {
  display:inline-block; padding:2px 8px; border-radius:4px;
  font-size:12px; font-weight:700; color:#fff;
}
.priority-badge.p1 { background:#dc2626; }
.priority-badge.p2 { background:#d97706; }
.priority-badge.p3 { background:#16a34a; }

/* Report bottom */
.rpt-bottom {
  display:flex; justify-content:space-between; padding-top:18px; margin-top:8px;
  border-top:1px solid #d6ebf7; flex-wrap:wrap; gap:8px;
}
.rb-item { font-size:13px; color:#8899aa; }
.rb-label { font-weight:600; margin-right:6px; }

.arrow-icon { margin-left:4px; font-size:12px; transition:transform .2s; }
.el-dropdown.is-opened .arrow-icon { transform:rotate(180deg); }

@media print {
  .rpt-top .el-button, .rpt-top .el-dropdown { display:none !important; }
  .report-glass { box-shadow:none; border:none; backdrop-filter:none; }
}

/* Tablet */
@media (max-width:992px) {
  .assessment-grid { grid-template-columns:repeat(2, 1fr); }
  .cost-card { grid-column:span 2; }
  .rpt-top { flex-direction:column; align-items:flex-start; gap:12px; }
}

/* Mobile */
@media (max-width:768px) {
  .report-wrap { padding:0; }
  .report-glass { padding:14px; border-radius:12px; }
  
  .rpt-top { flex-direction:column; align-items:stretch; gap:10px; }
  .rpt-top-left { gap:10px; }
  .rpt-icon { width:36px; height:36px; }
  .rpt-title { font-size:16px; }
  .rpt-time { font-size:11px; }
  
  .rpt-top .el-dropdown { width:100%; }
  .rpt-top .el-dropdown .el-button { width:100%; justify-content:center; }
  
  .section-head { margin-bottom:14px; }
  .sec-num { font-size:18px; }
  .section-head h3 { font-size:15px; }
  
  .assessment-grid { grid-template-columns:1fr 1fr; gap:8px; }
  .assess-card { padding:12px 10px; gap:8px; border-radius:10px; }
  .ac-icon { width:36px; height:36px; border-radius:8px; }
  .ac-val { font-size:18px; }
  .ac-val small { font-size:10px; }
  .ac-lbl { font-size:11px; }
  .cost-card { grid-column:span 2; }
  
  .risk-banner { padding:12px 14px; flex-direction:column; gap:8px; border-radius:10px; }
  .risk-left { gap:8px; }
  .risk-label { font-size:12px; }
  .risk-val { font-size:18px; }
  .risk-rec { text-align:left; font-size:13px; }
  
  .professional-note { padding:10px 12px; font-size:12px; border-radius:6px; margin-top:12px; }
  
  .dd-card { border-radius:10px; margin-bottom:12px; }
  .dd-top { padding:12px 14px; gap:8px; }
  .dd-idx { width:22px; height:22px; font-size:11px; }
  .dd-name { font-size:14px; }
  .dd-stat { font-size:12px; margin-left:0; width:100%; margin-top:6px; }
  .dd-body { padding:12px 14px; }
  .dd-field { flex-direction:column; gap:4px; margin-bottom:12px; font-size:13px; }
  .dd-fl { width:auto; text-align:left; font-size:11px; }
  .repair-step { gap:6px; margin-bottom:8px; }
  .rs-num { width:18px; height:18px; font-size:10px; }
  .dd-cost { padding:8px 10px !important; }
  
  .pri-block { padding:12px 14px; border-radius:8px; margin-bottom:10px; }
  .pri-head h4 { font-size:14px; }
  .pri-block ul { padding-left:20px; }
  .pri-block li { font-size:13px; margin-bottom:6px; }
  
  .grid-analysis { margin-top:10px; overflow-x:auto; }
  .grid-disease-tag { font-size:11px; padding:2px 6px; margin-right:4px; }
  .priority-badge { font-size:11px; padding:2px 6px; }
  
  .rpt-bottom { flex-direction:column; gap:6px; padding-top:14px; }
  .rb-item { font-size:12px; }
}

/* Small mobile */
@media (max-width:480px) {
  .report-glass { padding:12px; }
  .rpt-title { font-size:15px; }
  .assessment-grid { grid-template-columns:1fr; gap:8px; }
  .assess-card { flex-direction:row; }
  .cost-card { grid-column:span 1; }
  .ac-val { font-size:20px; }
  .risk-val { font-size:16px; }
  .dd-name { font-size:13px; }
  .section-head h3 { font-size:14px; }
}

/* Touch optimizations */
@media (hover:none) and (pointer:coarse) {
  .dd-card:hover { box-shadow:none; }
  .assess-card:hover { transform:none; }
  .pri-block { padding:14px 16px; }
  .dd-top { padding:14px 16px; }
}
</style>
