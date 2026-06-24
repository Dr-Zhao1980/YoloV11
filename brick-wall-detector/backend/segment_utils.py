"""
病害实例分割：YOLO 掩膜解码、检测框内病害区域提取、五色多边形标注
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

# 荧光色配色（FPI 高对比可视化原则，与 frontend/diseaseColors.ts 一致）
DISEASE_COLORS_RGB: Dict[str, Tuple[int, int, int]] = {
    '风化': (255, 31, 143),     # #FF1F8F 荧光品红
    '泛碱': (0, 240, 255),      # #00F0FF 荧光青
    '裂缝': (255, 242, 0),      # #FFF200 荧光黄
    '植物附着': (212, 0, 255),   # #D400FF 荧光紫
    '缺损': (0, 255, 122),      # #00FF7A 荧光绿
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

FILL_ALPHA = 133  # ~52% 荧光半透明
STROKE_RGBA = (0, 0, 0, 235)
STROKE_WIDTH = 1  # PIL 最细可靠线宽（约 1 物理像素）
NUM_CLASSES = 5
MASK_COEFFS = 32


def _cv2():
    try:
        import cv2
        return cv2
    except ImportError:
        return None


def display_name(det: Dict[str, Any]) -> str:
    raw = det.get('raw_class_name') or det.get('class_name') or ''
    if raw in RAW_CLASS_TO_DISPLAY:
        return RAW_CLASS_TO_DISPLAY[raw]
    cls_id = det.get('class_id', 0)
    return ID_TO_DISPLAY.get(cls_id, det.get('class_name', '病害'))


def color_rgb(det: Dict[str, Any]) -> Tuple[int, int, int]:
    return DISEASE_COLORS_RGB.get(display_name(det), (255, 64, 129))


def label_text_color(rgb: Tuple[int, int, int]) -> Tuple[int, int, int]:
    r, g, b = rgb
    luminance = 0.299 * r + 0.587 * g + 0.114 * b
    return (26, 26, 26) if luminance > 165 else (255, 255, 255)


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


def _simplify_polygon(points: List[List[int]], eps_ratio: float = 0.012) -> List[List[int]]:
    if len(points) <= 8:
        return points
    cv2 = _cv2()
    if cv2 is None:
        return _simplify_polar(points, max_pts=48)
    arr = np.array(points, dtype=np.int32).reshape(-1, 1, 2)
    peri = cv2.arcLength(arr, True)
    approx = cv2.approxPolyDP(arr, max(1.5, eps_ratio * peri), True)
    out = [[int(p[0][0]), int(p[0][1])] for p in approx]
    return out if len(out) >= 3 else points


def _simplify_polar(points: List[List[int]], max_pts: int = 48) -> List[List[int]]:
    if len(points) < 3:
        return points
    xs = np.array([p[0] for p in points], dtype=np.float32)
    ys = np.array([p[1] for p in points], dtype=np.float32)
    cx, cy = xs.mean(), ys.mean()
    ang = np.arctan2(ys - cy, xs - cx)
    rad = np.hypot(xs - cx, ys - cy)
    bins = np.linspace(-np.pi, np.pi, max_pts + 1)
    out: List[List[int]] = []
    for i in range(max_pts):
        m = (ang >= bins[i]) & (ang < bins[i + 1])
        if not np.any(m):
            continue
        idx = np.where(m)[0][int(np.argmax(rad[m]))]
        out.append([int(xs[idx]), int(ys[idx])])
    return out if len(out) >= 3 else points


def _mask_to_polygon(mask: np.ndarray, x_off: int = 0, y_off: int = 0,
                     scale_x: float = 1.0, scale_y: float = 1.0) -> Optional[List[List[int]]]:
    """二值掩膜 → 原图坐标多边形"""
    if mask is None or mask.size == 0:
        return None
    binary = (mask > 0.45).astype(np.uint8) * 255
    if binary.sum() < 24:
        return None

    cv2 = _cv2()
    if cv2 is not None:
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None
        cnt = max(contours, key=cv2.contourArea)
        if cv2.contourArea(cnt) < 16:
            return None
        poly = [[int(p[0][0] / scale_x + x_off), int(p[0][1] / scale_y + y_off)] for p in cnt]
        poly = _simplify_polygon(poly)
        return poly if len(poly) >= 3 else None

    ys, xs = np.where(binary > 0)
    if len(xs) < 8:
        return None
    pts = [[int(x / scale_x + x_off), int(y / scale_y + y_off)] for x, y in zip(xs, ys)]
    return _simplify_polar(pts, max_pts=40)


def decode_yolo_seg_mask(
    coeffs: np.ndarray,
    proto: np.ndarray,
    x1: int, y1: int, x2: int, y2: int,
    orig_w: int, orig_h: int,
) -> Optional[List[List[int]]]:
    """YOLO-seg：mask 系数 × prototype → 原图尺寸多边形"""
    c, mh, mw = proto.shape
    mask_small = (coeffs.astype(np.float32) @ proto.reshape(c, -1)).reshape(mh, mw)
    mask_small = 1.0 / (1.0 + np.exp(-mask_small))

    cv2 = _cv2()
    if cv2 is not None:
        mask_full = cv2.resize(mask_small, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
    else:
        ys = np.linspace(0, mh - 1, orig_h).astype(int)
        xs = np.linspace(0, mw - 1, orig_w).astype(int)
        mask_full = mask_small[np.ix_(ys, xs)]

    mask_bin = (mask_full > 0.45).astype(np.uint8) * 255
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(orig_w, x2), min(orig_h, y2)
    if x2 > x1 and y2 > y1:
        outside = np.ones_like(mask_bin, dtype=bool)
        outside[y1:y2, x1:x2] = False
        mask_bin[outside] = 0

    return _mask_to_polygon(mask_bin)


def disease_mask_from_bbox(image_rgb: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> Optional[np.ndarray]:
    """
    在检测框内提取病害区域二值掩膜（无分割头时的精修）
    策略：边框砖色基准 + 色差/纹理 + GrabCut（若 OpenCV 可用）
    """
    h, w = image_rgb.shape[:2]
    pad = max(4, int(min(x2 - x1, y2 - y1) * 0.08))
    x1p, y1p = max(0, x1 - pad), max(0, y1 - pad)
    x2p, y2p = min(w, x2 + pad), min(h, y2 + pad)
    roi = image_rgb[y1p:y2p, x1p:x2p].copy()
    rh, rw = roi.shape[:2]
    if rh < 10 or rw < 10:
        return None

    cv2 = _cv2()
    if cv2 is not None:
        try:
            rect = (max(1, pad), max(1, pad), max(4, rw - 2 * pad), max(4, rh - 2 * pad))
            bgd = np.zeros((1, 65), np.float64)
            fgd = np.zeros((1, 65), np.float64)
            mask_gc = np.zeros((rh, rw), np.uint8)
            mask_gc[:] = cv2.GC_BGD
            cx0, cy0 = rw // 4, rh // 4
            mask_gc[cy0:rh - cy0, cx0:rw - cx0] = cv2.GC_PR_FGD
            cv2.grabCut(roi, mask_gc, rect, bgd, fgd, 3, cv2.GC_INIT_WITH_RECT)
            fg = np.where((mask_gc == cv2.GC_FGD) | (mask_gc == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kernel, iterations=2)
            fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, kernel, iterations=1)
            if fg.sum() > 255 * 12:
                return fg
        except Exception:
            pass

    gray = roi.mean(axis=2).astype(np.float32)
    border = np.concatenate([
        gray[0, :], gray[-1, :], gray[:, 0], gray[:, -1],
    ])
    ref = float(np.median(border))
    diff = np.abs(gray - ref)
    lab = _rgb_to_lab_simple(roi)
    brick_ref = np.median(lab.reshape(-1, 3), axis=0)
    color_dist = np.linalg.norm(lab - brick_ref, axis=2)
    combined = 0.55 * (diff / (diff.max() + 1e-6)) + 0.45 * (color_dist / (color_dist.max() + 1e-6))
    thr = max(float(np.percentile(combined, 68)), 0.35)
    mask = (combined >= thr).astype(np.uint8) * 255

    if cv2 is not None:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
        num, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        if num > 1:
            best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            mask = np.where(labels == best, 255, 0).astype(np.uint8)

    return mask if mask.sum() > 255 * 8 else None


def _rgb_to_lab_simple(rgb: np.ndarray) -> np.ndarray:
    x = rgb.astype(np.float32) / 255.0
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return np.stack([L, A, B], axis=-1)


def contour_polygon_from_roi(
    image_rgb: np.ndarray,
    x1: int, y1: int, x2: int, y2: int,
    pad: int = 0,
) -> Optional[List[List[int]]]:
    h, w = image_rgb.shape[:2]
    x1 = max(0, x1 - pad)
    y1 = max(0, y1 - pad)
    x2 = min(w, x2 + pad)
    y2 = min(h, y2 + pad)

    mask = disease_mask_from_bbox(image_rgb, x1, y1, x2, y2)
    if mask is not None:
        poly = _mask_to_polygon(mask, x1, y1, 1.0, 1.0)
        if poly and len(poly) >= 3 and not _is_axis_aligned_rect(poly, x1, y1, x2, y2):
            return poly

    cv2 = _cv2()
    if cv2 is None:
        return None

    roi = image_rgb[y1:y2, x1:x2]
    gray = cv2.cvtColor(roi, cv2.COLOR_RGB2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 30, 100)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    cnt = max(contours, key=cv2.contourArea)
    if cv2.contourArea(cnt) < 20:
        return None
    poly = [[int(p[0][0] + x1), int(p[0][1] + y1)] for p in cnt]
    return _simplify_polygon(poly)


def _is_axis_aligned_rect(poly: List[List[int]], x1: int, y1: int, x2: int, y2: int, tol: int = 3) -> bool:
    if len(poly) != 4:
        return False
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return (
        max(xs) - min(xs) >= (x2 - x1) - tol
        and max(ys) - min(ys) >= (y2 - y1) - tol
        and len(set(xs)) <= 2
        and len(set(ys)) <= 2
    )


def mask_xy_to_polygon(mask_xy) -> Optional[List[List[int]]]:
    if mask_xy is None:
        return None
    try:
        pts = [[int(float(x)), int(float(y))] for x, y in mask_xy]
        pts = _simplify_polygon(pts, eps_ratio=0.008)
        return pts if len(pts) >= 3 else None
    except Exception:
        return None


def shrinkwrap_polygon(image_rgb: np.ndarray, x1: int, y1: int, x2: int, y2: int, n_bins: int = 32) -> List[List[int]]:
    """最后兜底：按角度取外缘点，形成不规则多边形（优于矩形）"""
    h, w = image_rgb.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    roi = image_rgb[y1:y2, x1:x2]
    gray = roi.mean(axis=2)
    border = np.concatenate([gray[0], gray[-1], gray[:, 0], gray[:, -1]])
    ref = float(np.median(border))
    diff = np.abs(gray - ref)
    thr = max(float(np.percentile(diff, 55)), float(diff.mean() * 1.15))
    ys, xs = np.where(diff >= thr)
    if len(xs) < 6:
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        rx, ry = (x2 - x1) * 0.42, (y2 - y1) * 0.42
        return [
            [int(x1 + (x2 - x1) * 0.15), y1],
            [x2, int(y1 + (y2 - y1) * 0.2)],
            [int(x2 - (x2 - x1) * 0.12), y2],
            [x1, int(y2 - (y2 - y1) * 0.15)],
            [int(x1 + (x2 - x1) * 0.08), int(cy - ry * 0.3)],
        ]
    gx = xs + x1
    gy = ys + y1
    cx, cy = float(gx.mean()), float(gy.mean())
    ang = np.arctan2(gy - cy, gx - cx)
    rad = np.hypot(gx - cx, gy - cy)
    bins = np.linspace(-np.pi, np.pi, n_bins + 1)
    pts: List[List[int]] = []
    for i in range(n_bins):
        m = (ang >= bins[i]) & (ang < bins[i + 1])
        if not np.any(m):
            continue
        idx = np.where(m)[0][int(np.argmax(rad[m]))]
        pts.append([int(gx[idx]), int(gy[idx])])
    if len(pts) < 3:
        return [
            [x1 + 2, y1 + 2],
            [x2 - 2, y1 + 2],
            [x2 - 2, y2 - 2],
            [x1 + 2, y2 - 2],
            [int((x1 + x2) / 2), int((y1 + y2) / 2)],
        ]
    return _simplify_polar(pts, max_pts=36)


def bbox_as_polygon(xyxy: Sequence[int]) -> List[List[int]]:
    x1, y1, x2, y2 = map(int, xyxy)
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]


def ensure_polygon(det: Dict[str, Any], image_rgb=None) -> List[List[int]]:
    poly = det.get('polygon')
    if poly and len(poly) >= 3:
        src = det.get('polygon_source', '')
        if src in ('mask', 'onnx_mask', 'contour', 'grabcut') or len(poly) > 4:
            return [[int(p[0]), int(p[1])] for p in poly]

    xyxy = det.get('xyxy')
    if not xyxy:
        xyxy = bbox_to_xyxy(det.get('bbox', [0, 0, 0, 0]))

    if image_rgb is not None:
        refined = contour_polygon_from_roi(image_rgb, *xyxy)
        if refined:
            det['polygon'] = refined
            det['polygon_source'] = 'grabcut'
            return refined

        wrap = shrinkwrap_polygon(image_rgb, *xyxy)
        if wrap and len(wrap) >= 3:
            det['polygon'] = wrap
            det['polygon_source'] = 'shrinkwrap'
            return wrap

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
        draw.polygon(
            flat,
            fill=(r, g, b, FILL_ALPHA),
            outline=STROKE_RGBA,
            width=STROKE_WIDTH,
        )

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
        draw2.rectangle([lx, ly, lx + tw + 6, ly + th + 4], fill=(r, g, b, 224))
        tr, tg, tb = label_text_color((r, g, b))
        draw2.text((lx + 3, ly + 2), label, fill=(tr, tg, tb, 255), font=font)

    base_out, ext = os.path.splitext(image_path)
    annotated_path = base_out + '_annotated' + (ext if ext else '.jpg')
    composed.convert('RGB').save(annotated_path, quality=90)
    return annotated_path
