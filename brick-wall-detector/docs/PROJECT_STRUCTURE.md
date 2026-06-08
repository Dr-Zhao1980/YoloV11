# 项目结构与文件说明

> 本文档帮助新成员**快速理解项目做什么**、**代码放在哪**、**各文件职责是什么**。  
> 阅读顺序建议：第一节（项目概览）→ 第二节（目录树）→ 第三节（模块说明）→ 第四节（文件索引）。

---

## 一、项目概览

### 1.1 项目是什么

**红砖墙病害智能检测与查勘平台**（`brick-wall-detector`）是一套面向历史建筑清水砖墙的 **Web 查勘系统**：

- 上传墙面照片或立面全景图  
- 调用 **YOLOv11** 识别五类病害（裂缝、缺损、植物附着、风化、泛碱）  
- 统计数量与面积、生成修缮报告、支持立面切片普查与热力图  
- 提供用户登录、历史记录、系统日志等基础管理能力  

技术形态：**浏览器 + Node.js 后端 + Python 推理脚本**，生产环境单服务部署（Express 托管前端构建产物）。

### 1.2 两类核心业务

| 模式 | 典型用户操作 | 主要代码入口 |
|------|----------------|--------------|
| **单图敏捷查勘** | 上传一张墙照 → AI 检测 → 修缮报告 | `Home.vue`（单图 Tab）、`POST /api/detect` |
| **立面普查** | 上传全景正射图 → 画线标定比例尺 → 切片推理 → 网格统计/热力图/整墙报告 | `Home.vue`（立面 Tab）、`POST /api/facade/*` |

### 1.3 数据怎么流动（简化）

```
用户浏览器 (Vue 3)
    ↓ HTTP /api/*
Express 后端 (server.js)
    ↓ 子进程 / 可选云端
YOLOv11 推理 (run_inference.py + backend/models/*.onnx|*.pt)
    ↓
检测结果 JSON → 前端展示 / 报告导出 / backend/data 持久化
```

更完整的课题背景见 [platform-integration.md](./platform-integration.md)。

---

## 二、仓库与目录树（总览）

本 Git 仓库名为 **YoloV11**，**可运行的完整系统**在子目录 `brick-wall-detector/` 中。

```
YoloV11/                              # Git 仓库根目录
├── README.md                         # 仓库总说明、快速入口
├── .gitignore                        # 忽略 node_modules、权重、运行时数据等
├── .gitattributes                    # Git LFS 等属性（若有）
│
├── brick-wall-detector/              # ★ 主项目（Web 系统，npm 命令在此执行）
│   ├── README.md                     # 安装、启动、功能说明
│   ├── CHANGELOG.md                  # 版本变更记录
│   ├── package.json                  # 依赖与 npm 脚本
│   ├── .env.example / .env           # 环境变量模板 / 本地配置（勿提交 .env）
│   │
│   ├── docs/                         # 扩展文档
│   ├── frontend/                     # Vue 3 前端源码
│   ├── backend/                      # Express 后端 + 推理脚本
│   ├── dist/                         # npm run build 产物（gitignore，部署用）
│   └── logs/                         # 运行日志（gitignore）
│
├── service.sh                        # 可选：服务启停脚本（仓库根）
├── *.pt                              # 可选：根目录放的训练权重副本（通常不入库）
├── reports/                          # 可选：本地代码统计报告（不入库）
└── code_counter.py                   # 可选：代码行数统计工具（不入库）
```

> **注意**：日常开发请 `cd brick-wall-detector` 后再执行 `npm install` / `npm run build` / `npm start`。

---

## 三、一级模块说明（brick-wall-detector）

| 路径 | 角色 | 何时关心 |
|------|------|----------|
| **frontend/** | 用户界面、交互、报告渲染、热力图 | 改页面、组件、导出格式 |
| **backend/** | API、上传、切片、推理调度、鉴权、数据持久化 | 改接口、推理流程、任务状态 |
| **docs/** | 文档（API、部署、热力图、本文档） | 写说明、交接、结题材料 |
| **dist/** | 前端打包结果，由 `npm run build` 生成 | 部署、生产环境静态资源 |
| **package.json** | 项目元信息、脚本：`dev` / `build` / `start` | 安装依赖、启动方式 |

---

## 四、二级目录详解

### 4.1 `docs/` — 文档

| 文件 | 说明 |
|------|------|
| [README.md](./README.md) | 文档索引 |
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | **本文档**：目录树与文件职责 |
| [API.md](./API.md) | REST API 端点摘要 |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | 生产部署、备份、Nginx |
| [HEATMAP.md](./HEATMAP.md) | 病害严重程度热力图（heatmap.js） |
| [platform-integration.md](./platform-integration.md) | 课题 2.4 专章：平台定位与数据资产 |
| `../2.4_…md` | 旧路径重定向，指向 `platform-integration.md` |

---

### 4.2 `frontend/` — 前端

```
frontend/
├── entry.html              # Vite HTML 入口
├── vite.config.ts          # 构建配置、开发代理 /api → 后端
├── tsconfig.json           # 前端 TS 配置
├── tsconfig.node.json      # Vite 配置用 TS
└── src/
    ├── main.ts             # Vue 应用启动
    ├── App.vue             # 根组件、全局样式
    ├── env.d.ts            # 类型声明（*.vue 等）
    ├── router/             # 路由：登录、首页、系统页
    ├── api/                # 封装所有后端 HTTP 请求
    ├── views/              # 页面级组件
    ├── components/         # 可复用业务组件
    ├── utils/              # 纯逻辑：坐标、切片计算、导出、热力图
    ├── types/              # TS 类型补充
    └── vendor/             # 第三方补丁库（heatmap.js ESM）
```

#### `frontend/src/router/`

| 文件 | 说明 |
|------|------|
| `index.ts` | 路由表：登录页、布局壳、首页 `Home`、历史/日志/设置 |

#### `frontend/src/views/` — 页面

| 文件 | 说明 |
|------|------|
| `Home.vue` | **核心业务页**：单图检测 + 立面普查（上传、标定、分析、报告、热力图） |
| `layout/index.vue` | 侧边栏布局、菜单、用户信息 |
| `login/index.vue` | 登录 / 注册 |
| `system/HistoryRecordPage.vue` | 检测历史列表 |
| `system/SystemLogPage.vue` | 系统操作日志 |
| `system/SystemSettingPage.vue` | 系统参数（管理员） |

#### `frontend/src/api/` — 接口层

| 文件 | 说明 |
|------|------|
| `request.ts` | Axios 实例、Token、错误处理 |
| `index.ts` | 检测、报告、立面任务、AI 等**主业务 API** |
| `auth.ts` | 登录、注册、当前用户 |
| `history.ts` | 历史记录 CRUD |
| `logs.ts` | 系统日志查询 |
| `settings.ts` | 系统设置读写 |

#### `frontend/src/components/` — 组件（按业务分组）

**单图查勘**

| 组件 | 说明 |
|------|------|
| `ShootingGuide.vue` | 标准拍摄三步法引导 |
| `DashboardView.vue` | 单图检测统计看板 |
| `RepairReport.vue` | 单图修缮报告展示与导出 |
| `DetectionMaskOverlay.vue` | 单图检测：五色半透明多边形叠加层 |

**立面普查**

| 组件 | 说明 |
|------|------|
| `FacadeManualScaleSelector.vue` | 弹窗：沿砖块长边手动画线标定 |
| `FacadeScaleFineTune.vue` | 比例尺视觉微调 + 嵌入切片预览 |
| `FacadeAutoPreview.vue` | 智能切片预览（绿框 ROI、网格、自动去黑边） |
| `FacadeROISelector.vue` | ROI 选区（若单独使用） |
| `FacadeGridPreview.vue` | 网格划分预览（旧/辅助） |
| `FacadeHeatmapCanvas.vue` | 网格强度热力（区域热力） |
| `FacadeSeverityHeatmapPanel.vue` | 点密度病害严重程度热力图 |
| `FacadeTileGridView.vue` | 拼合图 + 切片网格浏览 |
| `FacadeDashboard.vue` | 立面统计看板 |
| `FacadeProblemReport.vue` | 病害详细列表 |
| `FacadeRepairReport.vue` | 整墙修缮报告 |
| `FacadeCoordDialog.vue` | 墙坐标查看（米制） |
| `GridSliceDialog.vue` | 打开某网格对应切片大图 |

#### `frontend/src/utils/` — 工具函数

| 文件 | 说明 |
|------|------|
| `facadeTileMetrics.ts` | 切片像素尺寸、ROI 内块数计算（与后端一致） |
| `facadeCoordTransform.ts` | 像素坐标 ↔ 墙坐标（米，原点左下） |
| `facadeCoordExport.ts` | 导出坐标 TXT 等 |
| `facadeProblemReportExport.ts` | 立面问题汇报导出 |
| `facadeWallReportExport.ts` | 整墙报告 Word/PDF 等 |
| `reportExport.ts` | 通用导出、文件名生成 |
| `severityHeatmapRenderer.ts` | heatmap.js 渲染纯热力图 / 叠加图 |
| `imageContentBounds.ts` | 检测全景图有效内容区（去黑边） |
| `diseaseColors.ts` | 五类病害固定颜色（前后端一致） |

#### 其他前端文件

| 文件 | 说明 |
|------|------|
| `vendor/heatmap.js` | heatmap.js 的 Vite/ESM 兼容补丁版 |
| `types/heatmapjs.d.ts` | heatmap 库类型声明 |

---

### 4.3 `backend/` — 后端

```
backend/
├── server.js               # ★ 主服务：路由、立面任务、静态托管、报告逻辑
├── auth.js                 # 用户认证、Token、密码
├── run_inference.py        # ★ YOLO 子进程推理（ONNX / PyTorch）
├── brick_scale.py          # 砖缝 FFT 标定（接口仍保留，前台已隐藏）
├── model_service.py        # 模型相关辅助
├── onnx_infer.js           # ONNX 推理预留/实验
├── export_onnx.py          # 导出 ONNX 权重脚本
├── models/                 # 放置 best.onnx / best.pt（权重通常不入 Git）
├── data/                   # 运行时 JSON 数据（部分 gitignore）
├── uploads/                # 用户上传图、切片图（gitignore）
└── test-images/            # 本地测试样例图
```

#### 核心后端文件

| 文件 | 说明 |
|------|------|
| `server.js` | Express 应用：`/api/detect`、立面 upload/analyze、报告、健康检查；`createAutoScaleTiles` 智能切片；生产托管 `dist/` |
| `run_inference.py` | 读取图片 → YOLO 推理 → stdout 输出 JSON（含 `polygon` 多边形）；五色半透明标注图 |
| `segment_utils.py` | 实例分割可视化：掩膜/轮廓转多边形、五类固定配色、绘制标注图 |
| `auth.js` | 注册/登录、Bearer 校验、默认管理员初始化 |
| `brick_scale.py` | 砖缝周期检测、比例尺估算（供 `/api/facade/calibrate-scale`） |

#### `backend/data/` — 持久化（轻量 JSON）

| 文件/目录 | 说明 | Git |
|-----------|------|-----|
| `users.json` | 用户账号 | 通常忽略 |
| `users.example.json` | 账号结构示例 | 提交 |
| `settings.json` | 系统配置 | 通常忽略 |
| `settings.example.json` | 配置示例 | 提交 |
| `history.json` | 检测历史 | 通常忽略 |
| `logs.json` | 系统日志 | 通常忽略 |
| `facade-jobs/*.json` | 每个立面分析任务的完整状态 | 忽略 |

#### `backend/models/`

| 内容 | 说明 |
|------|------|
| `best.onnx` | 推荐：ONNX 推理，内存占用较低 |
| `best.pt` | PyTorch / ultralytics 回退 |
| `.gitkeep` | 保留空目录结构 |

#### `backend/uploads/`（运行时）

| 子路径 | 说明 |
|--------|------|
| `panoramas/` | 立面全景原图 |
| `tiles/` | 切片 JPG、ROI 裁切图 |

---

## 五、配置文件与脚本（速查）

| 文件 | 说明 |
|------|------|
| `package.json` | 项目名 `brick-wall-detector`、v1.3.0；脚本见下表 |
| `.env.example` | 端口、PAI-EAS、SiliconFlow 等环境变量说明 |
| `.env` | 本地真实配置（**勿提交**） |
| `frontend/vite.config.ts` | 入口 `entry.html`、别名 `@`、`/api` 代理 |
| `.gitignore`（根与子目录） | 忽略 `node_modules`、`dist`、权重、`uploads`、任务 JSON 等 |

### npm 脚本

| 命令 | 作用 |
|------|------|
| `npm run dev` | 同时启动后端 + Vite 开发服务器 |
| `npm run dev:server` | 仅后端（默认 3080） |
| `npm run dev:client` | 仅前端（5173，代理 API） |
| `npm run build` | 构建前端到 `dist/` |
| `npm start` | 生产模式：Node 托管 API + 静态页 |

---

## 六、按「我想改 XXX」快速定位

| 目标 | 优先查看 |
|------|----------|
| 改检测接口或切片逻辑 | `backend/server.js`、`run_inference.py` |
| 改单图 UI / 流程 | `frontend/src/views/Home.vue`、`RepairReport.vue` |
| 改立面标定与切片预览 | `FacadeManualScaleSelector.vue`、`FacadeScaleFineTune.vue`、`FacadeAutoPreview.vue` |
| 改热力图 | `FacadeSeverityHeatmapPanel.vue`、`severityHeatmapRenderer.ts` |
| 改报告内容与导出 | `RepairReport.vue`、`FacadeRepairReport.vue`、`*ReportExport.ts` |
| 改登录与权限 | `auth.js`、`api/auth.ts`、`router/index.ts` |
| 改坐标单位与导出 | `facadeCoordTransform.ts`、`FacadeCoordDialog.vue` |
| 部署上线 | [DEPLOYMENT.md](./DEPLOYMENT.md)、`npm run build` + `npm start` |

---

## 七、与版本文档的关系

| 文档 | 用途 |
|------|------|
| [../README.md](../README.md) | 对外说明：功能、安装、FAQ |
| [CHANGELOG.md](../CHANGELOG.md) | 每个版本改了什么 |
| [API.md](./API.md) | 接口字段与路径 |
| **PROJECT_STRUCTURE.md**（本文） | 代码地图、文件职责 |

---

## 八、后续阅读建议

1. 本地跑起来： [../README.md](../README.md) 快速启动  
2. 理解业务闭环： [platform-integration.md](./platform-integration.md) 第 2.4.4–2.4.9 节  
3. 改接口： [API.md](./API.md) + `backend/server.js` 内路由注释  
4. 改立面热力图： [HEATMAP.md](./HEATMAP.md)  

若目录结构有增删，请同步更新本文「第二节目录树」与「第四节文件表」。
