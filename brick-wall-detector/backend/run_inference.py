#!/usr/bin/env python3
"""
YOLOv11 推理脚本（子进程模式）
优先 onnxruntime；.pt 使用 ultralytics（支持实例分割掩膜）
输出：检测框 + 不规则多边形 polygon + 五色半透明标注图
"""
import sys
import os
import json

from segment_utils import (
    RAW_CLASS_TO_DISPLAY,
    ID_TO_DISPLAY,
    ID_TO_RAW,
    mask_xy_to_polygon,
    ensure_polygon,
    draw_segmentation_annotations,
    polygon_area,
    decode_yolo_seg_mask,
)

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_CLASS_MAP = RAW_CLASS_TO_DISPLAY


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
            raw = d.get('raw_class_name') or d.get('class_name', '?')
            poly = d.get('polygon') or []
            if len(poly) >= 3:
                pts = ' '.join(f"({int(p[0])},{int(p[1])})" for p in poly[:8])
                if len(poly) > 8:
                    pts += ' ...'
                coord = f"多边形顶点: {pts}"
            else:
                x1, y1, x2, y2 = d['xyxy']
                coord = f"坐标: 左上({x1},{y1}) 右下({x2},{y2})"
            lines.append(
                f"目标 {i+1} | 类别: {raw} | 置信度: {d['confidence']:.2f} | {coord}"
            )
    return '\n'.join(lines)


def _finalize_detections(image_path, detections, confidence, engine, model_names, image_rgb):
    for idx, d in enumerate(detections):
        d['id'] = idx + 1
        ensure_polygon(d, image_rgb)
        if d.get('polygon'):
            d['area_px'] = round(polygon_area(d['polygon']), 2)

    annotated_path = draw_segmentation_annotations(image_path, detections, image_rgb)
    coord_txt = _build_coord_text(image_path, confidence, detections)
    orig_h, orig_w = image_rgb.shape[:2]

    return {
        'success': True,
        'total_detections': len(detections),
        'detections': detections,
        'model_names': model_names,
        'image_width': orig_w,
        'image_height': orig_h,
        'annotated_image_path': annotated_path,
        'coord_txt_content': coord_txt,
        'engine': engine,
    }


def infer_onnxruntime(image_path, confidence, model_path,
                      iou_threshold=0.45, imgsz=640):
    import onnxruntime as ort
    import numpy as np
    from PIL import Image

    INPUT_SIZE = imgsz if imgsz in (320, 416, 640, 1024, 1280) else 640
    img = Image.open(image_path).convert('RGB')
    image_rgb = np.array(img)
    orig_w, orig_h = img.size

    scale = min(INPUT_SIZE / orig_w, INPUT_SIZE / orig_h)
    new_w, new_h = int(orig_w * scale), int(orig_h * scale)
    pad_x = (INPUT_SIZE - new_w) // 2
    pad_y = (INPUT_SIZE - new_h) // 2

    resized = img.resize((new_w, new_h), Image.BILINEAR)
    canvas = Image.new('RGB', (INPUT_SIZE, INPUT_SIZE), (114, 114, 114))
    canvas.paste(resized, (pad_x, pad_y))

    arr = np.array(canvas, dtype=np.float32) / 255.0
    chw = arr.transpose(2, 0, 1)[np.newaxis]

    sess_options = ort.SessionOptions()
    sess_options.intra_op_num_threads = 1
    sess_options.inter_op_num_threads = 1

    sess = ort.InferenceSession(model_path, sess_options=sess_options,
                                providers=['CPUExecutionProvider'])
    outputs = sess.run(None, {sess.get_inputs()[0].name: chw})

    # 分割模型：第二输出为 mask prototype
    if len(outputs) >= 2 and getattr(outputs[1], 'ndim', 0) == 4:
        return _infer_onnx_segmentation(
            outputs, image_path, image_rgb, confidence, iou_threshold,
            scale, pad_x, pad_y, orig_w, orig_h,
        )

    output = outputs[0]
    _, rows, cols = output.shape
    num_classes = len(ID_TO_DISPLAY)
    detections = []

    for i in range(cols):
        cx, cy, bw, bh = output[0, 0, i], output[0, 1, i], output[0, 2, i], output[0, 3, i]
        scores = output[0, 4:4 + num_classes, i]
        cls_id = int(np.argmax(scores))
        conf = float(scores[cls_id])
        if conf < confidence:
            continue

        x1 = int(max(0, (cx - bw / 2 - pad_x) / scale))
        y1 = int(max(0, (cy - bh / 2 - pad_y) / scale))
        x2 = int(min(orig_w, (cx + bw / 2 - pad_x) / scale))
        y2 = int(min(orig_h, (cy + bh / 2 - pad_y) / scale))

        raw_name = ID_TO_RAW.get(cls_id, str(cls_id))
        detections.append({
            'class_id': cls_id,
            'raw_class_name': raw_name,
            'class_name': MODEL_CLASS_MAP.get(raw_name, ID_TO_DISPLAY.get(cls_id, f'class_{cls_id}')),
            'confidence': round(conf, 4),
            'bbox': [x1, y1, x2 - x1, y2 - y1],
            'xyxy': [x1, y1, x2, y2],
        })

    kept = nms(detections, iou_thr=iou_threshold)
    return _finalize_detections(
        image_path, kept, confidence, 'onnxruntime', ID_TO_RAW, image_rgb
    )


def _infer_onnx_segmentation(outputs, image_path, image_rgb, confidence, iou_threshold,
                             scale, pad_x, pad_y, orig_w, orig_h):
    """YOLO-seg ONNX：检测 + mask 系数，解码为多边形"""
    import numpy as np

    pred = outputs[0][0]
    proto = outputs[1][0]
    num_classes = len(ID_TO_DISPLAY)
    nm = proto.shape[0]
    num_det = pred.shape[1]
    detections = []

    for i in range(num_det):
        cx, cy, bw, bh = pred[0, i], pred[1, i], pred[2, i], pred[3, i]
        scores = pred[4:4 + num_classes, i]
        cls_id = int(np.argmax(scores))
        conf = float(scores[cls_id])
        if conf < confidence:
            continue

        x1 = int(max(0, (cx - bw / 2 - pad_x) / scale))
        y1 = int(max(0, (cy - bh / 2 - pad_y) / scale))
        x2 = int(min(orig_w, (cx + bw / 2 - pad_x) / scale))
        y2 = int(min(orig_h, (cy + bh / 2 - pad_y) / scale))

        coeffs = pred[4 + num_classes:4 + num_classes + nm, i]
        mask = decode_yolo_seg_mask(coeffs, proto, x1, y1, x2, y2, orig_w, orig_h)

        raw_name = ID_TO_RAW.get(cls_id, str(cls_id))
        item = {
            'class_id': cls_id,
            'raw_class_name': raw_name,
            'class_name': MODEL_CLASS_MAP.get(raw_name, ID_TO_DISPLAY.get(cls_id, f'class_{cls_id}')),
            'confidence': round(conf, 4),
            'bbox': [x1, y1, x2 - x1, y2 - y1],
            'xyxy': [x1, y1, x2, y2],
        }
        if mask:
            item['polygon'] = mask
            item['polygon_source'] = 'onnx_mask'
        detections.append(item)

    kept = nms(detections, iou_thr=iou_threshold)
    return _finalize_detections(
        image_path, kept, confidence, 'onnxruntime-seg', ID_TO_RAW, image_rgb
    )


def infer_ultralytics(image_path, confidence, model_path, iou_threshold=0.45, imgsz=640):
    from ultralytics import YOLO
    import numpy as np
    from PIL import Image

    model = YOLO(model_path)
    img = Image.open(image_path).convert('RGB')
    image_rgb = np.array(img)

    results = model.predict(
        source=image_path,
        imgsz=imgsz,
        conf=confidence,
        iou=iou_threshold,
        save=False,
        device='cpu',
        verbose=False,
        retina_masks=True,
    )
    result = results[0]

    detections = []
    if result.boxes is not None and len(result.boxes) > 0:
        has_masks = result.masks is not None and len(result.masks) > 0
        for i, box in enumerate(result.boxes):
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            cls_id = int(box.cls[0])
            raw_name = model.names.get(cls_id, str(cls_id))
            display_name = MODEL_CLASS_MAP.get(raw_name, raw_name)
            conf = float(box.conf[0])

            item = {
                'class_id': cls_id,
                'raw_class_name': raw_name,
                'class_name': display_name,
                'confidence': round(conf, 4),
                'bbox': [x1, y1, x2 - x1, y2 - y1],
                'xyxy': [x1, y1, x2, y2],
            }
            if has_masks and i < len(result.masks):
                poly = mask_xy_to_polygon(result.masks.xy[i])
                if poly:
                    item['polygon'] = poly
                    item['polygon_source'] = 'mask'
            detections.append(item)

    return _finalize_detections(
        image_path,
        detections,
        confidence,
        'ultralytics',
        model.names,
        image_rgb,
    )


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

    model_path = selected_model_path or os.environ.get(
        'YOLO_ONNX_PATH', os.path.join(BACKEND_DIR, 'models', 'best.onnx')
    )
    model_path = os.path.abspath(model_path)
    models_dir = os.path.abspath(os.path.join(BACKEND_DIR, 'models'))
    if not model_path.startswith(models_dir + os.sep):
        print(json.dumps({'success': False, 'message': '模型路径非法'}))
        sys.exit(1)
    if not os.path.exists(model_path):
        print(json.dumps({'success': False, 'message': f'模型文件不存在: {model_path}'}))
        sys.exit(1)

    try:
        ext = os.path.splitext(model_path)[1].lower()
        if ext == '.onnx':
            result = infer_onnxruntime(
                image_path, confidence, model_path,
                iou_threshold=iou_threshold, imgsz=imgsz,
            )
        elif ext == '.pt':
            result = infer_ultralytics(
                image_path, confidence, model_path,
                iou_threshold=iou_threshold, imgsz=imgsz,
            )
        else:
            raise ValueError(f'不支持的模型格式: {ext}')
        result['model_file'] = os.path.basename(model_path)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        sys.stderr.write(f'[model-inference] {type(e).__name__}: {e}\n')
        print(json.dumps({
            'success': False,
            'message': f'模型推理失败: {type(e).__name__}: {e}',
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
