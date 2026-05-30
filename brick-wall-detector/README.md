# 🧱 红砖墙病害智能检测与修缮报告系统

> 基于 YOLOv11 深度学习模型 + 阿里云 PAI 平台的建筑红砖墙病害自动识别、评估与修缮方案生成系统

---

## 📋 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术架构](#技术架构)
- [环境要求](#环境要求)
- [快速启动（3步）](#快速启动3步)
- [详细启动步骤](#详细启动步骤)
- [连接阿里云PAI模型](#连接阿里云pai模型)
- [项目结构](#项目结构)
- [功能说明](#功能说明)
- [API接口文档](#api接口文档)
- [外网访问配置](#外网访问配置)
- [常见问题](#常见问题)

---

## 项目简介

本系统为红砖墙建筑外立面病害智能检测工具。用户上传一张红砖墙照片，系统通过 AI 模型自动识别 **5 种病害类型**，计算风化与泛碱的受损面积，并生成一份包含修缮方案的专业报告。

**核心流程：** 上传图片 → AI 检测 → 查看结果（标注框 + 面积） → 生成修缮报告

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 📷 图片上传 | 支持拖拽 / 点击上传红砖墙照片，支持 JPG / PNG 格式 |
| 🤖 AI 检测 | 调用阿里云 PAI 平台部署的 YOLOv11 目标检测模型 |
| 🔍 五类病害识别 | 风化、泛碱、裂缝、植物附着、缺损 |
| 📐 面积计算 | 自动计算风化和泛碱的受损面积（m²） |
| 🖼️ 可视化标注 | 在原图上叠加彩色边界框，标注病害位置与置信度 |
| 📊 统计面板 | 实时显示病害数量、种类、面积等关键指标 |
| 📝 修缮报告 | 一键生成完整的修缮方案报告（病害详情、修缮建议、材料、工法） |
| 🤖 AI 智能分析 | 基于大模型的病害成因分析、修缮方案、预防建议 |
| � AI 对话 | 支持就检测结果向 AI 追问 |
| �🖨️ 导出打印 | 支持浏览器打印 / 导出 PDF |
| 🎯 演示模式 | 未配置 PAI API 时自动使用内置案例数据进行演示 |
| 🛠️ 服务控制面板 | 交互式 Shell 面板，一键启停/重启/查看日志 |

---

## 技术架构

```
┌─────────────────────────────────────────────────┐
│                   浏览器（前端）                    │
│   Vue 3 + TypeScript + Element Plus + Axios      │
│              src/api/ 统一 API 层                 │
└──────────────────────┬──────────────────────────┘
                       │  HTTP / REST API
┌──────────────────────▼──────────────────────────┐
│                Express.js 后端                    │
│   图片上传 │ PAI 代理 │ AI 分析 │ 报告生成         │
└────────┬─────────────────────────┬──────────────┘
         │  HTTPS                  │  HTTPS
┌────────▼────────┐      ┌─────────▼──────────────┐
│  阿里云 PAI-EAS  │      │   AI 大模型服务          │
│  YOLOv11 检测    │      │  PAI-LLM / SiliconFlow  │
└─────────────────┘      └────────────────────────┘
```

| 层级 | 技术 | 用途 |
|------|------|------|
| 前端 | Vue 3 + TypeScript | 单页应用框架 |
| UI 组件 | Element Plus | 表单、卡片、弹窗等 |
| API 层 | Axios + TypeScript | 前后端分离接口封装 |
| 构建工具 | Vite 5 | 极速热更新与打包 |
| 后端 | Express.js (Node 18+) | API 服务 + 静态文件托管 |
| 文件上传 | Multer | 处理 multipart/form-data |
| 目标检测 | 阿里云 PAI-EAS | 部署 YOLOv11 模型 |
| AI 分析 | SiliconFlow / PAI-LLM | 智能病害分析与对话 |

---

## 环境要求

| 依赖 | 最低版本 | 检查命令 |
|------|----------|----------|
| Node.js | ≥ 18.0.0 | `node -v` |
| npm | ≥ 8.0.0 | `npm -v` |

> ⚠️ **不需要** Java、MySQL、Redis 等后端服务，本项目是纯 Node.js 轻量架构。

---

## 快速启动（3步）

```bash
# 1. Clone 并进入子目录
git clone git@github.com:Dr-Zhao1980/YoloV11.git
cd YoloV11/brick-wall-detector

# 2. 复制并配置环境变量
cp .env.example .env   # 然后编辑 .env 填入 API 密钥

# 3. 安装依赖 + 构建前端
npm install && npm run build

# 4. 启动服务
npm start
```

启动后访问：**http://localhost:3080**

---

## 详细启动步骤

### 第一步：克隆仓库并进入项目目录

```bash
git clone git@github.com:Dr-Zhao1980/YoloV11.git
cd YoloV11/brick-wall-detector
```

> ⚠️ 注意：**必须进入 `brick-wall-detector` 子目录**，不是 `YoloV11` 根目录。

### 第二步：安装依赖

```bash
npm install
```

首次安装约需 1-3 分钟，将自动下载 Vue、Element Plus、Express 等所有依赖包。

### 第三步：配置环境变量

```bash
# 如果 .env 文件不存在，从模板复制
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 服务端口（默认 3080）
PORT=3080

# ==================== 目标检测模型 ====================
# 阿里云 PAI EAS 服务配置（YOLOv11 病害检测模型）
# PAI_API_URL=http://<service-name>.<region>.pai-eas.aliyuncs.com/api/predict/<service-name>
# PAI_API_TOKEN=<your-api-token>

# ==================== AI 大模型服务 ====================
# SiliconFlow API（测试用）
SILICONFLOW_URL=https://api.siliconflow.cn/v1/chat/completions
SILICONFLOW_KEY=<your-api-key>
SILICONFLOW_MODEL=Qwen/Qwen3-8B

# 阿里云 PAI 大模型（生产用，优先级高于 SiliconFlow）
# PAI_LLM_URL=<your-pai-llm-endpoint>
# PAI_LLM_TOKEN=<your-pai-llm-token>
```

> **AI 服务优先级**：PAI-LLM > SiliconFlow > 规则引擎（兜底）

### 第四步：构建前端

```bash
npm run build
```

构建约 6-10 秒，生成 `dist/` 目录。

### 第五步：启动生产服务

```bash
npm start
```

看到以下输出即为启动成功：

```
═══════════════════════════════════════════════════════
🧱  红砖墙病害智能检测系统 v1.0
═══════════════════════════════════════════════════════
📡  服务地址: http://0.0.0.0:3080
🔗  本地访问: http://localhost:3080
───────────────────────────────────────────────────────
📦  目标检测模型 (YOLOv11):
    ⚠️  未配置，使用演示模式
───────────────────────────────────────────────────────
🤖  AI 大模型服务:
    ✅ SiliconFlow: Qwen/Qwen3-8B（优先级 2）
───────────────────────────────────────────────────────
📚  API 端点:
    POST /api/detect          - 病害检测
    POST /api/report/generate - 生成报告
    POST /api/ai/analyze      - AI 智能分析
    POST /api/ai/chat         - AI 对话
    GET  /api/ai/status       - AI 服务状态
    GET  /api/health          - 健康检查
═══════════════════════════════════════════════════════
```

### 第六步：访问系统

打开浏览器访问：
- **本地访问**：http://localhost:3080
- **局域网访问**：http://<服务器内网IP>:3080
- **外网访问**：http://<服务器公网IP>:3080（需开放端口）

---

### 开发模式（可选）

如需修改代码并实时预览：

```bash
# 终端 1：启动后端
npm run dev:server

# 终端 2：启动前端开发服务器（带热更新）
npm run dev:client
```

开发模式下访问 http://localhost:5173（Vite 自动代理 API 请求到后端）。

---

## 连接阿里云PAI模型

### 1. PAI-EAS 服务部署

在阿里云 PAI 平台完成以下步骤：
1. 上传训练好的 YOLOv11 模型文件
2. 创建 EAS 在线推理服务
3. 获取 **服务地址（URL）** 和 **Token**

### 2. 配置 .env

```env
PAI_API_URL=http://your-service.cn-shanghai.pai-eas.aliyuncs.com/api/predict/brick_wall_yolov11
PAI_API_TOKEN=YTBhMjFlNDk2NWRiMDNlOTc4YmIxNzc5...
```

### 3. 重启服务

```bash
# 停止当前服务（Ctrl+C），然后：
npm start
```

控制台将显示：`✅ PAI EAS: http://your-service...`

### 4. PAI API 请求/响应格式

**请求：**
```json
{
  "image": "<base64编码的图片>"
}
```

**期望响应（以下任一格式均兼容）：**
```json
{
  "detections": [
    {
      "class": 0,
      "confidence": 0.94,
      "bbox": [x, y, width, height]
    }
  ]
}
```

类别映射：`01:LF=裂缝, 02:QS=缺损, 03:P=植物附着, 04:B-FH=风化, 05:B-FJ=泛碱`

> 系统同时兼容英文类名（weathering, efflorescence, crack, spalling, missing）和中文类名。

---

## 项目结构

```
brick-wall-detector/
├── server.js                # Express 后端（API + AI 服务 + 静态文件）
├── package.json             # 项目配置与依赖
├── vite.config.ts           # Vite 构建配置
├── tsconfig.json            # TypeScript 配置
├── tsconfig.node.json       # Node.js TypeScript 配置
├── entry.html               # 前端 HTML 入口
├── .env                     # 环境变量（端口、API 配置）
├── .env.example             # 环境变量模板
├── dist/                    # 前端构建产物（npm run build 后生成）
├── uploads/                 # 上传图片存放目录（自动创建）
└── src/                     # 前端源码
    ├── main.ts              # Vue 应用入口
    ├── env.d.ts             # TypeScript 类型声明
    ├── App.vue              # 根组件（全局样式 + 蓝色主题变量）
    ├── api/
    │   └── index.ts         # API 服务层（前后端分离接口封装）
    ├── views/
    │   └── Home.vue         # 主页面（上传 + 检测 + 统计面板）
    └── components/
        ├── ShootingGuide.vue   # 三步法快速查勘指南
        ├── DashboardView.vue   # 数据看板组件
        └── RepairReport.vue    # 修缮报告组件
```

---

## 功能说明

### 1. 图片上传

- 支持拖拽上传或点击选择文件
- 仅接受 JPG / PNG 格式，单文件上限 10MB
- 上传后即时预览，悬停可更换图片

### 2. AI 病害检测

点击「开始 AI 检测」后：
1. 图片上传至后端 `/api/detect`
2. 后端转发至 PAI-EAS 推理服务（或使用演示数据）
3. 返回检测结果：每个病害的类别、置信度、边界框坐标、面积

**五类病害：**

| 编号 | 病害类型 | 标注颜色 | 面积计算 |
|------|----------|----------|----------|
| 1 | 风化 | 🔴 红色 | ✅ 有 |
| 2 | 泛碱 | 🔵 蓝色 | ✅ 有 |
| 3 | 裂缝 | 🟡 橙色 | — |
| 4 | 植物附着 | 🟣 紫色 | — |
| 5 | 缺损 | 🟢 青色 | — |

### 3. 检测结果展示

- **左侧**：原图叠加彩色边界框，标注病害类型与置信度
- **右侧**：统计面板（检出数量、病害种类、风化面积、泛碱面积）+ 病害分布列表

### 4. 修缮报告

点击「生成修缮报告」后生成包含以下内容的专业报告：

- **总体评估**：病害种类数、检出总数、风化/泛碱面积、综合风险等级
- **五类病害修缮方案**：每类病害的描述、严重程度判定标准、分级修缮方法、推荐材料、预防措施
- **修缮建议**：对检出的病害进行简明罗列，包含病害名称、数量及修缮建议

---

## API接口文档

### GET /api/health

健康检查。

**响应：**
```json
{ "status": "ok", "timestamp": "2026-05-06T15:43:12.014Z" }
```

### POST /api/detect

上传图片进行病害检测。

**请求：** `multipart/form-data`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| image | File | 是 | JPG/PNG 图片，≤10MB |
| brickLengthMm | number | 否 | 参考砖长度（mm），默认 240 |

**响应：**
```json
{
  "success": true,
  "imagePath": "/uploads/1234567890-123456789.jpg",
  "totalDetections": 8,
  "detections": [
    { "id": 1, "class": "风化", "confidence": 0.94, "bbox": [52,38,245,180], "area": 0.21, "severity": "中度", "gridId": "G1-1" }
  ],
  "summary": {
    "风化": { "count": 2, "totalArea": 0.35, "maxSeverity": "中度" },
    "泛碱": { "count": 2, "totalArea": 0.22, "maxSeverity": "中度" }
  },
  "modelInfo": { "name": "YOLOv11-BrickWall", "version": "1.0", "platform": "阿里云PAI" }
}
```

### POST /api/report/generate

根据检测结果生成修缮报告。

**请求体：** `application/json`
```json
{ "detectionResult": { /* 上一步的检测结果 */ } }
```

**响应：** 包含总体评估、五类病害修缮方案、优先级计划的完整报告 JSON。

### POST /api/ai/analyze

AI 智能分析病害检测结果。

**请求体：** `application/json`
```json
{
  "detectionResult": { /* 检测结果 */ },
  "analysisType": "comprehensive"  // comprehensive | cause | repair | prevention
}
```

**响应：**
```json
{
  "success": true,
  "analysis": "## 病害检测分析报告\n\n...",
  "provider": "SiliconFlow",
  "analysisType": "comprehensive",
  "timestamp": "2026-05-07T11:30:00.000Z"
}
```

### POST /api/ai/chat

AI 对话问答。

**请求体：** `application/json`
```json
{
  "message": "红砖墙风化病害应该如何修缮？",
  "context": { /* 可选：检测结果上下文 */ }
}
```

**响应：**
```json
{
  "success": true,
  "reply": "红砖墙风化病害的修缮需根据风化类型和程度...",
  "provider": "SiliconFlow",
  "timestamp": "2026-05-07T11:30:00.000Z"
}
```

### GET /api/ai/status

获取 AI 服务状态。

**响应：**
```json
{
  "success": true,
  "aiServices": {
    "paiLlm": { "configured": false, "priority": 1, "description": "阿里云 PAI 大模型" },
    "siliconflow": { "configured": true, "model": "Qwen/Qwen3-8B", "priority": 2 },
    "ruleEngine": { "configured": true, "priority": 3, "description": "规则引擎（兜底）" }
  },
  "activeProvider": "SiliconFlow"
}
```

---

## 外网访问配置

### 阿里云 ECS 安全组

1. 登录阿里云控制台 → ECS → 安全组
2. 添加入方向规则：
   - **协议**：TCP
   - **端口范围**：3080/3080
   - **授权对象**：0.0.0.0/0
3. 保存后即可通过 `http://<公网IP>:3080` 访问

### 后台持久运行

```bash
# 使用 nohup 后台运行
cd YoloV11/brick-wall-detector
nohup npm start > app.log 2>&1 &

# 查看日志
tail -f app.log

# 停止服务
kill $(lsof -t -i:3080)
```

---

## 常见问题

### Q: 运行 npm 命令报错 "Could not read package.json"

**原因：** 未进入正确目录。

```bash
# ❌ 错误
cd YoloV11
npm start

# ✅ 正确
cd YoloV11/brick-wall-detector
npm start
```

### Q: 端口被占用

```bash
# 查看哪个进程占用了端口
lsof -i :3080

# 更换端口：编辑 .env 文件中的 PORT
```

### Q: 如何切换为真实 PAI 模型？

编辑 `.env`，取消注释并填入 PAI 服务地址和 Token，然后重启。

### Q: 检测结果全是演示数据？

这是因为 `.env` 中未配置 `PAI_API_URL` 和 `PAI_API_TOKEN`。系统自动进入演示模式，使用内置案例数据。

### Q: AI 分析功能不可用？

检查 `.env` 中的 `SILICONFLOW_KEY` 是否正确配置。访问 `/api/ai/status` 可查看当前 AI 服务状态。

### Q: 如何使用服务控制面板？

```bash
chmod +x service.sh
./service.sh
```

面板支持：启动/停止/重启服务、查看状态、查看日志、重新构建前端。

### Q: 如何导出报告为 PDF？

点击报告区域的「打印/导出PDF」按钮，在浏览器打印对话框中选择「另存为PDF」。
