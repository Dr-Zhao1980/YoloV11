# 红砖墙病害智能检测与查勘平台

> **v1.3.0** · 基于 YOLOv11 的历史建筑清水砖墙病害识别、立面普查、定量统计与修缮报告 Web 系统

---

## 项目简介

本系统面向历史建筑红砖外墙**现场查勘**与**整墙立面普查**，提供：

- **单图敏捷查勘**：上传墙面照片 → AI 识别五类病害 → 面积/严重程度统计 → 修缮报告
- **立面普查模式**：正射全景图 → 比例尺校准 → 网格切片推理 → 网格化统计 → 病害热力图 → 整墙报告
- **数据与审计**：历史记录、系统日志、坐标导出（米）、多格式报告导出

**技术栈：** Vue 3 + TypeScript + Element Plus · Express.js · Sharp · Python YOLOv11 推理（ONNX / PyTorch）

---

## 功能一览

| 模块 | 能力 |
|------|------|
| 单图检测 | 五类病害识别、标注叠加、参考砖比例尺面积估算、拍摄质量初筛 |
| 立面普查 | 全景上传、ROI 选区、N×N 网格切片、跨切片 NMS、拼合预览 |
| 比例尺 | 自动/手动标定、微调、墙坐标系（原点左下，X 右 Y 上，**单位：米**） |
| 病害热力图 | heatmap.js 点密度图；无标注正射底图叠加；权重（置信度/面积/严重程度）；可调渲染半径 |
| 网格热力 | 按网格强度在立面图上绘制区域热力层 |
| 报告 | 单图修缮报告；立面问题汇报；TXT / Word / PDF 导出（**不含费用估算等不确定项**） |
| 系统管理 | 登录注册、历史记录、系统日志、系统设置（管理员） |

### 五类病害

| 类别 | 说明 | 典型统计 |
|------|------|----------|
| 风化 | 表面粉化、剥落 | 面积 m² |
| 泛碱 | 盐分析出 | 面积 m² |
| 裂缝 | 线性开裂 | 处数 / 长度 |
| 植物附着 | 植被、生物附着 | 处数 |
| 缺损 | 砖块缺失、空洞 | 处数 |

模型标签映射：`01:LF` 裂缝 · `02:QS` 缺损 · `03:P` 植物附着 · `04:B-FH` 风化 · `05:B-FJ` 泛碱

---

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 18 | 后端与构建 |
| npm | ≥ 8 | 包管理 |
| Python 3 | ≥ 3.8 | 本地 YOLO 推理（`run_inference.py`） |
| 可选 | onnxruntime 或 ultralytics | 见 `backend/run_inference.py` |

---

## 快速启动

```bash
# 1. 进入项目目录（必须在 brick-wall-detector 下执行 npm 命令）
cd brick-wall-detector

# 2. 环境变量
cp .env.example .env

# 3. Python 推理依赖 + 模型（置于 backend/models/）
pip install -r backend/requirements.txt
#    best.onnx  — YOLO11-seg（推荐，实例分割掩膜）
#    best.pt    — PyTorch（需 ultralytics）

# 4. 安装与构建
npm install
npm run build

# 5. 启动（生产模式，托管 dist/）
npm start
```

访问：**http://localhost:3080**

默认管理员（首次启动自动初始化，请及时修改密码）：见 `backend/data/users.example.json`。

### 开发模式

```bash
# 终端 1：后端（端口 3080）
npm run dev:server

# 终端 2：前端 Vite（端口 5173，代理 /api）
npm run dev:client
```

开发地址：**http://localhost:5173**

---

## 配置说明

编辑 `.env`（模板见 `.env.example`）：

| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口，默认 `3080` |
| `PAI_API_URL` / `PAI_API_TOKEN` | 可选，阿里云 PAI-EAS 远程推理 |
| `SILICONFLOW_*` | 可选，AI 分析报告 / 对话 |
| `PAI_LLM_*` | 可选，优先于 SiliconFlow |

**推理优先级：** 本地 `backend/models/best.onnx` 或 `best.pt` →（若配置）PAI-EAS → 未配置模型时单图可能进入演示逻辑（立面任务需真实模型）。

---

## 项目结构

```
brick-wall-detector/
├── package.json
├── .env.example
├── README.md                 # 本文件
├── CHANGELOG.md
├── docs/                     # 扩展文档
│   ├── README.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   ├── HEATMAP.md
│   └── platform-integration.md   # 课题 2.4 平台说明
├── frontend/
│   ├── entry.html
│   ├── vite.config.ts
│   └── src/
│       ├── views/Home.vue          # 主业务页
│       ├── components/             # 立面、报告、热力图等组件
│       ├── utils/                  # 坐标变换、报告导出、热力图渲染
│       └── vendor/heatmap.js       # heatmap.js（ESM 补丁版）
├── backend/
│   ├── server.js                   # Express 主服务
│   ├── auth.js
│   ├── run_inference.py            # YOLO 子进程推理
│   ├── models/                     # 放置 best.onnx / best.pt（git 可选 LFS）
│   ├── data/                       # 用户、历史、立面任务 JSON（运行时）
│   └── uploads/                    # 上传图片（运行时，已 gitignore）
└── dist/                           # npm run build 产物
```

---

## 核心 API（摘要）

完整列表见 [docs/API.md](docs/API.md)。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/detect` | 单图病害检测 |
| POST | `/api/report/generate` | 单图修缮报告 |
| POST | `/api/facade/upload` | 上传立面全景 |
| POST | `/api/facade/analyze/:jobId` | 启动立面分析 |
| GET | `/api/facade/job/:jobId` | 查询任务进度与结果 |
| GET | `/api/facade/report/:jobId` | 整墙修缮报告 |
| GET | `/api/facade/export-coords/:jobId` | 导出墙坐标（米） |
| POST | `/api/quality-check` | 拍摄质量初筛 |
| POST | `/api/ai/analyze` | AI 智能分析（可选） |

---

## 部署要点

- 生产环境执行 `npm run build` 后使用 `npm start`，由 Express 托管 `dist/`。
- 外网访问需在安全组/防火墙开放 `PORT`（默认 3080）。
- 持久化数据位于 `backend/data/` 与 `backend/uploads/`，部署时请备份。
- 详见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

---

## 常见问题

**Q: `npm start` 提示找不到 package.json？**  
必须在 `brick-wall-detector` 目录下执行，不是仓库根目录 `YoloV11`。

**Q: 标注图仍是矩形？**  
确认已安装 `opencv-python-headless`（`pip install -r backend/requirements.txt`），并使用 **best.onnx（seg）** 或 **best.pt**；重启服务后重新检测。

**Q: 立面热力图与底图错位？**  
请使用 v1.3.0+：叠加图基于无标注 `sourceImageUrl`，坐标已按 `cropOffset` 换算至分析区；重新点击「生成热力图」。

**Q: 如何导出 PDF？**  
在报告区域使用浏览器打印 →「另存为 PDF」，或使用 Word 导出后转换。

---

## 文档

- [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) — **项目目录与文件说明**（从概览到逐文件）  
- [docs/README.md](docs/README.md) — 文档索引  
- [docs/HEATMAP.md](docs/HEATMAP.md) — 病害严重程度热力图说明  
- [docs/platform-integration.md](docs/platform-integration.md) — 课题平台集成专章  
- [CHANGELOG.md](CHANGELOG.md) — 版本历史  

---

## 版本

当前版本：**1.3.0**（2026-06）

仓库地址：[github.com/Dr-Zhao1980/YoloV11](https://github.com/Dr-Zhao1980/YoloV11)
