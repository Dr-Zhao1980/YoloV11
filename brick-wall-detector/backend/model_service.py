#!/usr/bin/env python3
"""
YOLOv11 本地模型推理服务
提供 HTTP API 供 Node.js 后端调用
"""
import os
import sys
import json
import base64
import tempfile
import traceback
from pathlib import Path

try:
    from flask import Flask, request, jsonify
except ImportError:
    print("请安装 flask: pip install flask", file=sys.stderr)
    sys.exit(1)

try:
    from ultralytics import YOLO
except ImportError:
    print("请安装 ultralytics: pip install ultralytics", file=sys.stderr)
    sys.exit(1)

app = Flask(__name__)

# 模型路径 - 从环境变量或默认路径加载
MODEL_PATH = os.environ.get(
    'YOLO_MODEL_PATH',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'best.pt')
)

CONFIDENCE_THRESHOLD = float(os.environ.get('YOLO_CONFIDENCE', '0.30'))
PORT = int(os.environ.get('MODEL_SERVICE_PORT', '5000'))

model = None


def load_model():
    global model
    abs_path = os.path.abspath(MODEL_PATH)
    print(f"[模型服务] 加载模型: {abs_path}")
    if not os.path.exists(abs_path):
        print(f"[模型服务] 错误: 模型文件不存在 {abs_path}", file=sys.stderr)
        sys.exit(1)
    model = YOLO(abs_path)
    print(f"[模型服务] 模型加载成功, 类别: {model.names}")

    # 写入就绪标志
    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
    os.makedirs(data_dir, exist_ok=True)
    flag_path = os.path.join(data_dir, 'model_ready.flag')
    with open(flag_path, 'w') as f:
        f.write('ready')
    print(f"[模型服务] 就绪标志已写入: {flag_path}")


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model_loaded': model is not None})


@app.route('/predict', methods=['POST'])
def predict():
    """
    接收图片进行检测
    支持两种方式:
    1. JSON body: { "image_base64": "..." } 或 { "image_path": "/path/to/image" }
    2. multipart/form-data: file field named 'image'
    """
    global model
    if model is None:
        return jsonify({'success': False, 'message': '模型未加载'}), 500

    tmp_path = None
    try:
        image_path = None

        # 方式1: JSON body
        if request.is_json:
            data = request.get_json()
            if 'image_path' in data:
                image_path = data['image_path']
            elif 'image_base64' in data:
                img_bytes = base64.b64decode(data['image_base64'])
                tmp_fd, tmp_path = tempfile.mkstemp(suffix='.jpg')
                os.close(tmp_fd)
                with open(tmp_path, 'wb') as f:
                    f.write(img_bytes)
                image_path = tmp_path
        # 方式2: form-data
        elif 'image' in request.files:
            file = request.files['image']
            tmp_fd, tmp_path = tempfile.mkstemp(suffix='.jpg')
            os.close(tmp_fd)
            file.save(tmp_path)
            image_path = tmp_path

        if not image_path or not os.path.exists(image_path):
            return jsonify({'success': False, 'message': '未提供有效图片'}), 400

        # 读取置信度阈值
        conf = CONFIDENCE_THRESHOLD
        if request.is_json and 'confidence' in request.get_json(silent=True, force=True):
            conf = float(request.get_json()['confidence'])
        elif request.form.get('confidence'):
            conf = float(request.form.get('confidence'))

        # 执行推理
        results = model.predict(
            source=image_path,
            imgsz=640,
            conf=conf,
            save=False,
            device='cpu',
            verbose=False
        )

        detections = []
        result = results[0]

        if result.boxes is not None and len(result.boxes) > 0:
            for i, box in enumerate(result.boxes):
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                cls_id = int(box.cls[0])
                cls_name = model.names.get(cls_id, str(cls_id))
                box_conf = float(box.conf[0])

                detections.append({
                    'id': i + 1,
                    'class_id': cls_id,
                    'class_name': cls_name,
                    'confidence': round(box_conf, 4),
                    'bbox': [x1, y1, x2 - x1, y2 - y1],  # [x, y, w, h]
                    'xyxy': [x1, y1, x2, y2]
                })

        # 保存标注图
        annotated_path = None
        if detections:
            ann_fd, annotated_path = tempfile.mkstemp(suffix='_annotated.jpg')
            os.close(ann_fd)
            result.save(annotated_path)

        resp = {
            'success': True,
            'total_detections': len(detections),
            'detections': detections,
            'model_names': model.names,
            'image_width': result.orig_shape[1] if hasattr(result, 'orig_shape') else 0,
            'image_height': result.orig_shape[0] if hasattr(result, 'orig_shape') else 0,
        }

        # 如果有标注图，返回 base64
        if annotated_path and os.path.exists(annotated_path):
            with open(annotated_path, 'rb') as f:
                resp['annotated_image_base64'] = base64.b64encode(f.read()).decode('utf-8')
            os.unlink(annotated_path)

        return jsonify(resp)

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except:
                pass


if __name__ == '__main__':
    load_model()
    print(f"[模型服务] 启动于端口 {PORT}")
    app.run(host='0.0.0.0', port=PORT, debug=False)
