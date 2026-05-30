#!/usr/bin/env python3
"""
一次性导出脚本：将 best.pt 转换为 best.onnx
在有 ultralytics 的环境中运行一次即可，之后 Node.js 直接加载 ONNX 推理。

用法:
    python3 export_onnx.py
"""
import os
import sys
from pathlib import Path

MODEL_PT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'best.pt')
MODEL_ONNX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'best.onnx')

try:
    from ultralytics import YOLO
except ImportError:
    print("错误: 需要安装 ultralytics。请在有网络的环境中运行:")
    print("  pip install ultralytics")
    sys.exit(1)

if not os.path.exists(MODEL_PT):
    print(f"错误: 模型文件不存在 {MODEL_PT}")
    sys.exit(1)

print(f"加载模型: {MODEL_PT}")
model = YOLO(MODEL_PT)

print("导出为 ONNX 格式...")
model.export(
    format='onnx',
    imgsz=640,
    simplify=True,
    opset=12,
    dynamic=False
)

# ultralytics 默认导出到 .pt 同目录
exported = Path(MODEL_PT).with_suffix('.onnx')
if exported.exists() and str(exported) != MODEL_ONNX:
    import shutil
    shutil.move(str(exported), MODEL_ONNX)

print(f"导出成功: {MODEL_ONNX}")
print(f"文件大小: {os.path.getsize(MODEL_ONNX) / 1024 / 1024:.1f} MB")
print()
print("现在可以用 Node.js onnxruntime 直接推理，无需 Python！")
