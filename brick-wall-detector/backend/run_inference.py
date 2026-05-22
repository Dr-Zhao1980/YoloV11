#!/usr/bin/env python3
"""
YOLOv11 推理脚本（子进程模式）
优先使用 onnxruntime 加载 best.onnx，回退到 ultralytics 加载 best.pt
用法: python3 run_inference.py <image_path> [confidence]
输出: JSON 到 stdout
"""
import sys
import os
import json

# 模型真实类别名 -> 系统显示名
MODEL_CLASS_MAP = {
    '01:LF': '裂缝',
    '02:QS': '缺损',
    '03:P':  '植物附着',
    '04:B-FH': '风化',
    '05:B-FJ': '泛碱',
}
# 数字 ID -> 显示名（兜底）
DISEASE_CLASSES = {0: '裂缝', 1: '缺损', 2: '植物附着', 3: '风化', 4: '泛碱'}
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))


def nms(boxes, iou_thr=0.45):
    boxes.sort(key=lambda x: -x['confidence'])
    keep = []
    for box in boxes:
        suppressed = False
        for kept in keep:
            if iou(box['xyxy'], kept['xyxy']) > iou_thr:
                suppressed = True
                break
        if not suppressed:
            keep.append(box)
    return keep


def iou(a, b):
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / (area_a + area_b - inter + 1e-6)


_DRAW_COLORS = [
    (231, 76, 60),   # 红
    (52, 152, 219),  # 蓝
    (243, 156, 18),  # 橙
    (155, 89, 182),  # 紫
    (26, 188, 156),  # 青绿
]


def _draw_annotations(image_path, detections, raw_names_map):
    """在原图上绘制检测框和标签，返回标注图保存路径"""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.open(image_path).convert('RGB')
    draw = ImageDraw.Draw(img)
    w, h = img.size
    line_w = max(2, min(w, h) // 400)

    try:
        font = ImageFont.truetype(
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            max(14, min(w, h) // 80)
        )
    except Exception:
        font = ImageFont.load_default()

    for d in detections:
        x1, y1, x2, y2 = d['xyxy']
        cls_id = d.get('class_id', 0)
        color = _DRAW_COLORS[cls_id % len(_DRAW_COLORS)]
        # box
        draw.rectangle([x1, y1, x2, y2], outline=color, width=line_w)
        # label "<raw> <conf>"
        raw = d.get('raw_class_name') or raw_names_map.get(cls_id, str(cls_id))
        label = f"{raw} {d['confidence']:.2f}"
        try:
            tb = draw.textbbox((0, 0), label, font=font)
            tw, th = tb[2] - tb[0], tb[3] - tb[1]
        except Exception:
            tw, th = len(label) * 8, 14
        ly1 = max(0, y1 - th - 4)
        draw.rectangle([x1, ly1, x1 + tw + 6, ly1 + th + 4], fill=color)
        draw.text((x1 + 3, ly1 + 2), label, fill=(255, 255, 255), font=font)

    base, ext = os.path.splitext(image_path)
    annotated_path = base + '_annotated' + (ext if ext else '.jpg')
    img.save(annotated_path, quality=88)
    return annotated_path


def _build_coord_text(image_path, confidence, detections):
    lines = [
        f"图片名称: {os.path.basename(image_path)}",
        f"测试置信度: {confidence:.2f}",
        "-" * 40
    ]
    if not detections:
        lines.append("该置信度下未检测到任何病害。")
    else:
        for i, d in enumerate(detections):
            x1, y1, x2, y2 = d['xyxy']
            raw = d.get('raw_class_name') or d.get('class_name', '?')
            lines.append(
                f"目标 {i+1} | 类别: {raw} | 置信度: {d['confidence']:.2f} | "
                f"坐标: 左上({x1},{y1}) 右下({x2},{y2})"
            )
    return '\n'.join(lines)


# 模型类别 ID -> raw 标签的反向映射（用于 ONNX，没有 model.names）
_RAW_NAMES_FOR_ID = {
    0: '01:LF',
    1: '02:QS',
    2: '03:P',
    3: '04:B-FH',
    4: '05:B-FJ',
}


def infer_onnxruntime(image_path, confidence, model_path,
                      iou_threshold=0.45, imgsz=640):
    """使用 onnxruntime 推理 ONNX 模型（低内存路径）"""
    import onnxruntime as ort
    import numpy as np
    from PIL import Image

    INPUT_SIZE = imgsz if imgsz in (320, 416, 640, 1024, 1280) else 640
    img = Image.open(image_path).convert('RGB')
    orig_w, orig_h = img.size

    # letterbox
    scale = min(INPUT_SIZE / orig_w, INPUT_SIZE / orig_h)
    new_w, new_h = int(orig_w * scale), int(orig_h * scale)
    pad_x = (INPUT_SIZE - new_w) // 2
    pad_y = (INPUT_SIZE - new_h) // 2

    resized = img.resize((new_w, new_h), Image.BILINEAR)
    canvas = Image.new('RGB', (INPUT_SIZE, INPUT_SIZE), (114, 114, 114))
    canvas.paste(resized, (pad_x, pad_y))

    arr = np.array(canvas, dtype=np.float32) / 255.0
    chw = arr.transpose(2, 0, 1)[np.newaxis]  # [1,3,H,W]

    # 限制 ORT 线程数，进一步降低内存峰值
    sess_options = ort.SessionOptions()
    sess_options.intra_op_num_threads = 1
    sess_options.inter_op_num_threads = 1

    sess = ort.InferenceSession(model_path, sess_options=sess_options,
                                providers=['CPUExecutionProvider'])
    input_name = sess.get_inputs()[0].name
    output = sess.run(None, {input_name: chw})[0]  # [1, rows, cols]

    # YOLO11(-seg): rows = 4(bbox) + num_classes [+ 32(mask_coeff)]
    _, rows, cols = output.shape
    num_classes = len(DISEASE_CLASSES)
    detections = []

    for i in range(cols):
        cx, cy, w, h = output[0, 0, i], output[0, 1, i], output[0, 2, i], output[0, 3, i]
        scores = output[0, 4:4+num_classes, i]
        cls_id = int(np.argmax(scores))
        conf = float(scores[cls_id])
        if conf < confidence:
            continue

        x1 = int(max(0, (cx - w/2 - pad_x) / scale))
        y1 = int(max(0, (cy - h/2 - pad_y) / scale))
        x2 = int(min(orig_w, (cx + w/2 - pad_x) / scale))
        y2 = int(min(orig_h, (cy + h/2 - pad_y) / scale))

        raw_name = _RAW_NAMES_FOR_ID.get(cls_id, str(cls_id))
        detections.append({
            'class_id': cls_id,
            'raw_class_name': raw_name,
            'class_name': MODEL_CLASS_MAP.get(raw_name, DISEASE_CLASSES.get(cls_id, f'class_{cls_id}')),
            'confidence': round(conf, 4),
            'bbox': [x1, y1, x2-x1, y2-y1],
            'xyxy': [x1, y1, x2, y2]
        })

    # 自定义 IoU 阈值
    kept = nms(detections, iou_thr=iou_threshold)
    for idx, d in enumerate(kept):
        d['id'] = idx + 1

    annotated_path = _draw_annotations(image_path, kept, _RAW_NAMES_FOR_ID)
    coord_txt = _build_coord_text(image_path, confidence, kept)

    return {
        'success': True,
        'total_detections': len(kept),
        'detections': kept,
        'model_names': _RAW_NAMES_FOR_ID,
        'image_width': orig_w,
        'image_height': orig_h,
        'annotated_image_path': annotated_path,
        'coord_txt_content': coord_txt,
        'engine': 'onnxruntime'
    }


def infer_ultralytics(image_path, confidence, model_path, iou_threshold=0.45, imgsz=640):
    """使用 ultralytics 推理 .pt 模型（需要 torch）"""
    from ultralytics import YOLO
    model = YOLO(model_path)
    results = model.predict(source=image_path, imgsz=imgsz, conf=confidence,
                            iou=iou_threshold, save=False, device='cpu', verbose=False)
    result = results[0]

    # 保存标注后图片（ultralytics 自动绘制 "05:B-FJ 0.62" 样式标签）
    base, ext = os.path.splitext(image_path)
    annotated_path = base + '_annotated' + (ext if ext else '.jpg')
    result.save(filename=annotated_path)

    detections = []
    coord_lines = [
        f"图片名称: {os.path.basename(image_path)}",
        f"测试置信度: {confidence:.2f}",
        "-" * 40
    ]

    if result.boxes is not None and len(result.boxes) > 0:
        for i, box in enumerate(result.boxes):
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            cls_id = int(box.cls[0])
            raw_name = model.names.get(cls_id, str(cls_id))
            display_name = MODEL_CLASS_MAP.get(raw_name, raw_name)
            conf = float(box.conf[0])
            detections.append({
                'id': i + 1,
                'class_id': cls_id,
                'raw_class_name': raw_name,
                'class_name': display_name,
                'confidence': round(conf, 4),
                'bbox': [x1, y1, x2-x1, y2-y1],
                'xyxy': [x1, y1, x2, y2]
            })
            coord_lines.append(
                f"目标 {i+1} | 类别: {raw_name} | 置信度: {conf:.2f} | "
                f"坐标: 左上({x1},{y1}) 右下({x2},{y2})"
            )
    else:
        coord_lines.append("该置信度下未检测到任何病害。")

    h, w = result.orig_shape
    return {
        'success': True,
        'total_detections': len(detections),
        'detections': detections,
        'model_names': model.names,
        'image_width': w,
        'image_height': h,
        'annotated_image_path': annotated_path,
        'coord_txt_content': '\n'.join(coord_lines)
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'message': '缺少图片路径'}))
        sys.exit(1)

    image_path = sys.argv[1]
    confidence = float(sys.argv[2]) if len(sys.argv) > 2 else 0.30
    iou_threshold = float(sys.argv[3]) if len(sys.argv) > 3 else 0.45
    imgsz = int(sys.argv[4]) if len(sys.argv) > 4 else 640
    selected_model_path = sys.argv[5] if len(sys.argv) > 5 else ''

    if not os.path.exists(image_path):
        print(json.dumps({'success': False, 'message': f'图片不存在: {image_path}'}))
        sys.exit(1)

    model_path = selected_model_path or os.environ.get('YOLO_ONNX_PATH',
                                                       os.path.join(BACKEND_DIR, 'models', 'best.onnx'))
    model_path = os.path.abspath(model_path)
    models_dir = os.path.abspath(os.path.join(BACKEND_DIR, 'models'))
    if not model_path.startswith(models_dir + os.sep):
        print(json.dumps({'success': False,
                          'message': '模型路径非法'}))
        sys.exit(1)
    if not os.path.exists(model_path):
        print(json.dumps({'success': False,
                          'message': f'模型文件不存在: {model_path}'}))
        sys.exit(1)

    try:
        ext = os.path.splitext(model_path)[1].lower()
        if ext == '.onnx':
            result = infer_onnxruntime(image_path, confidence, model_path,
                                       iou_threshold=iou_threshold, imgsz=imgsz)
        elif ext == '.pt':
            result = infer_ultralytics(image_path, confidence, model_path,
                                       iou_threshold=iou_threshold, imgsz=imgsz)
            result['engine'] = 'ultralytics'
        else:
            raise ValueError(f'不支持的模型格式: {ext}')
        result['model_file'] = os.path.basename(model_path)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        sys.stderr.write(f'[model-inference] {type(e).__name__}: {e}\n')
        print(json.dumps({'success': False,
                          'message': f'模型推理失败: {type(e).__name__}: {e}'}))
        sys.exit(1)


if __name__ == '__main__':
    main()
