#!/usr/bin/env python3
"""
将 PyTorch 权重导出为 ONNX（供 Node / onnxruntime 直接推理）

用法:
    python3 export_onnx.py                    # 导出 brick-wall-v2.pt（即 Plus.pt）→ brick-wall-v2.onnx
    python3 export_onnx.py brick-wall-v2.pt   # 指定源文件（第二版源权重 Plus.pt）
"""
import os
import sys
import shutil
from pathlib import Path

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BACKEND_DIR, 'models')

try:
    from ultralytics import YOLO
except ImportError:
    print('错误: 需要安装 ultralytics 与 torch。请运行:')
    print('  pip install -r backend/requirements.txt')
    sys.exit(1)


def export_pt_to_onnx(pt_name: str) -> str:
    pt_path = os.path.join(MODELS_DIR, pt_name)
    if not os.path.exists(pt_path):
        print(f'错误: 模型文件不存在 {pt_path}')
        sys.exit(1)

    onnx_name = pt_name.replace('.pt', '.onnx')
    onnx_path = os.path.join(MODELS_DIR, onnx_name)

    print(f'加载模型: {pt_path}')
    model = YOLO(pt_path)
    print(f'task={model.task} names={model.names}')
    print('导出为 ONNX 格式 (imgsz=640)...')
    model.export(format='onnx', imgsz=640, simplify=True, opset=12, dynamic=False)

    exported = Path(pt_path).with_suffix('.onnx')
    if exported.exists() and str(exported.resolve()) != os.path.abspath(onnx_path):
        shutil.move(str(exported), onnx_path)

    if not os.path.exists(onnx_path):
        print(f'错误: 导出失败，未找到 {onnx_path}')
        sys.exit(1)

    print(f'导出成功: {onnx_path}')
    print(f'文件大小: {os.path.getsize(onnx_path) / 1024 / 1024:.1f} MB')
    return onnx_path


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else 'brick-wall-v2.pt'
    export_pt_to_onnx(src)
