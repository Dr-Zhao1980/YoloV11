"""
病害实例分割可视化：五类固定配色 + 不规则多边形区域绘制
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Sequence, Tuple

# BGR（OpenCV）/ 对外 JSON 用 RGB 列表
DISEASE_COLORS_RGB: Dict[str, Tuple[int, int, int]] = {
    '裂缝': (243, 156, 18),      # 橙 #f39c12
    '缺损': (26, 188, 156),      # 青 #1abc9c
    '植物附着': (155, 89, 182),  # 紫 #9b59b6
    '风化': (231, 76, 60),       # 红 #e74c3c
    '泛碱': (52, 152, 219),      # 蓝 #3498db
}

RAW_CLASS_TO_DISPLAY = {
    '01:LF': '裂缝',
    '02:QS': '缺损',
    '03:P': '植物附着',
    '04:B-FH': '风化',
    '05:B-FJ': '泛碱',
}

ID_TO_DISPLAY = {0: '裂缝', 1: '缺损', 2: '植物附着', 3: '风化', 4: '泛碱'}
ID_TO_RAW = {0: '01:LF', 1: '02:QS', 2: '03:P', 3: '04:B-FH', 4: '05:B-FJ'}

FILL_ALPHA = 105
STROKE_ALPHA = 230


def display_name(det: Dict[str, Any]) -> str:
    raw = det.get('raw_class_name') or det.get('class_name') or ''
    if raw in RAW_CLASS_TO_DISPLAY:
        return RAW_CLASS_TO_DISPLAY[raw]
    cls_id = det.get('class_id', 0)
    return ID_TO_DISPLAY.get(cls_id, det.get('class_name', '病害'))


def color_rgb(det: Dict[str, Any]) -> Tuple[int, int, int]:
    name = display_name(det)
    return DISEASE_COLORS_RGB.get(name, (128, 128, 128))


def bbox_to_xyxy(bbox: Sequence[float]) -> Tuple[int, int, int, int]:
    x, y, w, h = bbox
    return int(x), int(y), int(x + w), int(y + h)


def polygon_area(points: Sequence[Sequence[float]]) -> float:
    if not points or len(points) < 3:
        return 0.0
    area = 0.0
    n = len(points)
    for i in range(n):
        x1, y1 = points[i][0], points[i][1]
        x2, y2 = points[(i + 1) % n][0], points[(i + 1) % n][1]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def _simplify_polygon(points: List[List[int]], eps: float = 2.0) -> List[List[int]]:
    if len(points) <= 6:
        return points
    try:
        import cv2
        import numpy as np
        arr = np.array(points, dtype=np.int32).reshape(-1, 1, 2)
        peri = cv2.arcLength(arr, True)
        approx = cv2.approxPolyDP(arr, max(eps, 0.01 * peri), True)
        return [[int(p[0][0]), int(p[0][1])] for p in approx]
    except Exception:
        return points


def contour_polygon_from_roi(
    image_rgb,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    pad: int = 6,
) -> Optional[List[List[int]]]:
    """检测框内基于图像纹理提取不规则轮廓（无分割头时的回退）"""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return None

    h, w = image_rgb.shape[:2]
    x1 = max(0, x1 - pad)
    y1 = max(0, y1 - pad)
    x2 = min(w, x2 + pad)
    y2 = min(h, y2 + pad)
    if x2 - x1 < 8 or y2 - y1 < 8:
        return None

    roi = image_rgb[y1:y2, x1:x2]
    gray = cv2.cvtColor(roi, cv2.COLOR_RGB2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 40, 120)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    cnt = max(contours, key=cv2.contourArea)
    if cv2.contourArea(cnt) < 24:
        return None
    poly = [[int(p[0][0] + x1), int(p[0][1] + y1)] for p in cnt]
    poly = _simplify_polygon(poly)
    return poly if len(poly) >= 3 else None


def mask_xy_to_polygon(mask_xy) -> Optional[List[List[int]]]:
    if mask_xy is None:
        return None
    try:
        pts = [[int(float(x)), int(float(y))] for x, y in mask_xy]
        pts = _simplify_polygon(pts, eps=1.5)
        return pts if len(pts) >= 3 else None
    except Exception:
        return None


def bbox_as_polygon(xyxy: Sequence[int]) -> List[List[int]]:
    x1, y1, x2, y2 = map(int, xyxy)
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]


def ensure_polygon(det: Dict[str, Any], image_rgb=None) -> List[List[int]]:
    poly = det.get('polygon')
    if poly and len(poly) >= 3:
        return [[int(p[0]), int(p[1])] for p in poly]

    xyxy = det.get('xyxy')
    if not xyxy:
        xyxy = bbox_to_xyxy(det.get('bbox', [0, 0, 0, 0]))

    if image_rgb is not None:
        refined = contour_polygon_from_roi(image_rgb, *xyxy)
        if refined:
            det['polygon'] = refined
            det['polygon_source'] = 'contour'
            return refined

    rect = bbox_as_polygon(xyxy)
    det['polygon'] = rect
    det['polygon_source'] = 'bbox'
    return rect


def draw_segmentation_annotations(
    image_path: str,
    detections: List[Dict[str, Any]],
    image_rgb=None,
) -> str:
    from PIL import Image, ImageDraw, ImageFont

    if image_rgb is None:
        base = Image.open(image_path).convert('RGB')
        import numpy as np
        image_rgb = np.array(base)
    else:
        base = Image.fromarray(image_rgb)

    w, h = base.size
    overlay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, 'RGBA')

    try:
        font = ImageFont.truetype(
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            max(14, min(w, h) // 80),
        )
    except Exception:
        font = ImageFont.load_default()

    for d in detections:
        poly = ensure_polygon(d, image_rgb)
        r, g, b = color_rgb(d)
        flat = [(p[0], p[1]) for p in poly]
        draw.polygon(flat, fill=(r, g, b, FILL_ALPHA), outline=(r, g, b, STROKE_ALPHA))

    composed = Image.alpha_composite(base.convert('RGBA'), overlay)
    draw2 = ImageDraw.Draw(composed)

    for d in detections:
        poly = d.get('polygon') or ensure_polygon(d, image_rgb)
        r, g, b = color_rgb(d)
        raw = d.get('raw_class_name') or ID_TO_RAW.get(d.get('class_id', 0), '?')
        label = f"{raw} {d.get('confidence', 0):.2f}"
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        lx, ly = min(xs), max(0, min(ys) - 4)
        try:
            tb = draw2.textbbox((0, 0), label, font=font)
            tw, th = tb[2] - tb[0], tb[3] - tb[1]
        except Exception:
            tw, th = len(label) * 8, 14
        ly = max(0, ly - th - 4)
        draw2.rectangle([lx, ly, lx + tw + 6, ly + th + 4], fill=(r, g, b, 255))
        draw2.text((lx + 3, ly + 2), label, fill=(255, 255, 255, 255), font=font)

    base_out, ext = os.path.splitext(image_path)
    annotated_path = base_out + '_annotated' + (ext if ext else '.jpg')
    composed.convert('RGB').save(annotated_path, quality=90)
    return annotated_path
