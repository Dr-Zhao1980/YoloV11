# YoloV11 — 基于机器视觉的历史工业建筑外立面病害智能诊断系统

本仓库为 **YOLOv11 历史工业建筑外立面病害识别** 课题的工程化交付仓库，核心可运行系统位于子目录 [`brick-wall-detector/`](brick-wall-detector/)。

## 仓库结构

```
YoloV11/
├── README.md                 # 本文件（仓库总览）
├── brick-wall-detector/      # ★ 外立面病害智能诊断 Web 系统（主交付物）
│   ├── README.md             # 安装、功能、API 速览（请先阅读）
│   ├── docs/                 # 详细文档（架构、部署、课题说明等）
│   ├── backend/              # Express API + Python 推理
│   └── frontend/             # Vue 3 前端
├── *.pt                      # 训练权重（本地放置，默认不入库）
└── reports/                  # 本地分析报告（可选，不入库）
```

## 快速开始

```bash
git clone git@github.com:Dr-Zhao1980/YoloV11.git
cd YoloV11/brick-wall-detector

cp .env.example .env    # 按需配置端口与 API
npm install
npm run build
npm start
```

浏览器访问：**http://localhost:3080**

> 模型权重请置于 `brick-wall-detector/backend/models/`（如 `brick-wall-v2.onnx`），详见子项目 README。

## 文档索引

| 文档 | 说明 |
|------|------|
| [brick-wall-detector/README.md](brick-wall-detector/README.md) | 系统功能、环境、启动、结构 |
| [brick-wall-detector/docs/PROJECT_STRUCTURE.md](brick-wall-detector/docs/PROJECT_STRUCTURE.md) | **项目目录树与各文件职责**（分级说明） |
| [brick-wall-detector/docs/README.md](brick-wall-detector/docs/README.md) | 全部文档目录 |
| [brick-wall-detector/CHANGELOG.md](brick-wall-detector/CHANGELOG.md) | 版本变更记录 |

## 版本

当前交付版本：**v1.3.0**（见 `brick-wall-detector/package.json` 与 CHANGELOG）。

## 许可与联系

课题/工程用途软件；模型与现场数据请遵守相关单位保密要求。问题与协作请通过 GitHub Issues 或仓库维护者联系。
