# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-05-21

### Added
- 本地 YOLOv11 模型推理支持（ONNX Runtime）
- 强制模型调用模式：模型失败直接返回错误，不回退演示数据
- 角色权限控制：管理员/普通用户区分
- 侧边栏折叠/展开 UI，支持移动端
- 历史记录、系统日志、系统设置功能
- 用户注册功能（新用户默认 role=user）
- 导出 ONNX 模型脚本（export_onnx.py）

### Changed
- 推理引擎：优先使用 ONNX Runtime（内存 < 2GB 时自动切换），避免 ultralytics OOM
- 移除 PAI API 回退和演示数据回退
- 移除 ONNX-Node.js 原生推理（使用 Python 子进程更稳定）
- 病害类别更新："脱落" → "植物附着"
- 版本升级：v1.0.0 → v2.0.0

### Fixed
- OOM 问题：大图推理时 Python 子进程被系统杀死（exit 137）
- 模型未调用问题：run_inference.py 的 main() 现在强制调用 infer_onnxruntime
- 错误日志截断问题：完整输出 Python 子进程 stderr/stdout/exit code
- NMS 参数名不匹配：iou_threshold → iou_thr

### Security
- 注册接口限制：禁止注册 admin 用户名
- 认证中间件：Bearer Token 验证，过期自动失效

## [1.0.0] - 2026-05-06

### Added
- Initial release
- Vue 3 + Express.js 架构
- 阿里云 PAI-EAS YOLOv11 集成
- 病害检测、修缮报告、AI 分析功能
