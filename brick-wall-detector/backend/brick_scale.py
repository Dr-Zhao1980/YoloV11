#!/usr/bin/env python3
"""
砖块比例尺自动标定脚本（基于 numpy/Pillow，无需 OpenCV）
用法: python3 brick_scale.py <image_path> <brick_length_mm_A> <brick_width_mm_B> [annotated_output_path]
输出: JSON → stdout
"""
import sys
import os
import json
import math

MORTAR_MM = 10.0  # 典型灰缝厚度（mm）


def detect_brick_scale(image_path, brick_A_mm, brick_B_mm, annotated_path=None):
    """
    使用 OpenCV + 梯度/投影/FFT 组合估算砖缝周期，建立 px/mm 比例尺。
    重点针对超大正射图做安全缩放与多区域采样，避免内存与误检问题。
    """
    try:
        import numpy as np
        from PIL import Image, ImageDraw
    except ImportError as e:
        return {"success": False, "message": f"缺少依赖: {e}", "method": "none"}

    try:
        import cv2
    except Exception as e:
        cv2 = None
        opencv_error = str(e)
    else:
        opencv_error = ''

    Image.MAX_IMAGE_PIXELS = None
    try:
        img = Image.open(image_path).convert("RGB")
    except Exception as e:
        return {"success": False, "message": f"无法读取图像: {e}", "method": "none"}

    orig_w, orig_h = img.size
    # 超大图先做安全缩放，保证特征提取稳定
    max_side = 2400
    sf = min(1.0, max_side / max(orig_w, orig_h))
    if sf < 1.0:
        img = img.resize((max(1, int(orig_w * sf)), max(1, int(orig_h * sf))), Image.LANCZOS)

    gray = np.array(img.convert("L"), dtype=np.uint8)
    sm_h, sm_w = gray.shape

    def fft_dominant_period(profile, min_period=4, max_period_frac=0.5):
        n = len(profile)
        if n < 20:
            return 0.0
        x = np.arange(n, dtype=np.float64)
        p = np.polyfit(x, profile, 1)
        detrended = profile - np.polyval(p, x)
        detrended -= detrended.mean()
        window = np.hanning(n)
        fft_coeffs = np.fft.rfft(detrended * window)
        power = np.abs(fft_coeffs) ** 2
        freqs = np.fft.rfftfreq(n)
        min_f = 1.0 / (n * max_period_frac)
        max_f = 1.0 / min_period
        valid = (freqs >= min_f) & (freqs <= max_f)
        if not valid.any():
            return 0.0
        pw = power.copy()
        pw[~valid] = 0.0
        idx = int(np.argmax(pw))
        f = freqs[idx]
        return 0.0 if f < 1e-9 else float(1.0 / f)

    def band_profiles(gray_img):
        if cv2 is None:
            blur = gray_img
            edges = None
        else:
            blur = cv2.GaussianBlur(gray_img, (5, 5), 0)
            edges = cv2.Canny(blur, 35, 110)
        # 中央优先，避免边缘裁切与天空/地面干扰
        x0, x1 = int(sm_w * 0.15), int(sm_w * 0.85)
        y0, y1 = int(sm_h * 0.15), int(sm_h * 0.85)
        central = blur[y0:y1, x0:x1]
        if edges is not None:
            central_edges = edges[y0:y1, x0:x1]
            h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(9, central.shape[1] // 25), 1))
            v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(9, central.shape[0] // 25)))
            h_resp = cv2.morphologyEx(central_edges, cv2.MORPH_OPEN, h_kernel)
            v_resp = cv2.morphologyEx(central_edges, cv2.MORPH_OPEN, v_kernel)
            row_profile = h_resp.mean(axis=1).astype(np.float64)
            col_profile = v_resp.mean(axis=0).astype(np.float64)
        else:
            gy = np.abs(np.diff(central.astype(np.float32), axis=0))
            gx = np.abs(np.diff(central.astype(np.float32), axis=1))
            row_profile = gy.mean(axis=1).astype(np.float64)
            col_profile = gx.mean(axis=0).astype(np.float64)
        return row_profile, col_profile, edges

    row_profile, col_profile, edges = band_profiles(gray)
    h_period_small = fft_dominant_period(row_profile, min_period=4, max_period_frac=0.42)
    v_period_small = fft_dominant_period(col_profile, min_period=4, max_period_frac=0.42)

    # 兜底：若中央区域过于平滑，再从上/中/下三条带做一次投票
    if h_period_small <= 0 or v_period_small <= 0:
        bands = []
        step = sm_h // 4
        for start in [step // 2, step, step + step // 2]:
            y0 = max(0, start)
            y1 = min(sm_h, start + step)
            band = gray[y0:y1, :]
            if band.shape[0] < 20:
                continue
            gy = np.abs(np.diff(band.astype(np.float32), axis=0))
            gx = np.abs(np.diff(band.astype(np.float32), axis=1))
            rp = gy.mean(axis=1).astype(np.float64)
            cp = gx.mean(axis=0).astype(np.float64)
            bands.append((fft_dominant_period(rp, min_period=4, max_period_frac=0.42), fft_dominant_period(cp, min_period=4, max_period_frac=0.42)))
        valid_h = [b[0] for b in bands if b[0] > 0]
        valid_v = [b[1] for b in bands if b[1] > 0]
        if valid_h:
            h_period_small = float(np.median(valid_h))
        if valid_v:
            v_period_small = float(np.median(valid_v))

    h_period_px = h_period_small / sf if sf > 0 else h_period_small
    v_period_px = v_period_small / sf if sf > 0 else v_period_small

    scales = []
    detail_parts = []
    if h_period_px > 2 and brick_B_mm > 0:
        course_mm = brick_B_mm + MORTAR_MM
        sy = h_period_px / course_mm
        scales.append(sy)
        detail_parts.append(f"水平周期={h_period_px:.1f}px / (B+灰缝={course_mm:.0f}mm) → {sy:.4f}px/mm")
    if v_period_px > 2 and brick_A_mm > 0:
        brick_step_mm = brick_A_mm + MORTAR_MM
        sx = v_period_px / brick_step_mm
        scales.append(sx)
        detail_parts.append(f"垂直周期={v_period_px:.1f}px / (A+灰缝={brick_step_mm:.0f}mm) → {sx:.4f}px/mm")

    if not scales:
        return {
            "success": False,
            "message": f"未检测到显著砖缝特征（OpenCV: {opencv_error or 'ok'}），建议使用墙体尺寸估算比例尺",
            "method": "opencv-fft",
            "image_width": orig_w,
            "image_height": orig_h,
        }

    final_scale = float(sum(scales) / len(scales))

    if annotated_path:
        try:
            _draw_annotation(image_path, annotated_path, h_period_px, v_period_px, final_scale, orig_w, orig_h, edges)
        except Exception:
            pass

    return {
        "success": True,
        "scale_px_per_mm": round(final_scale, 5),
        "method": "opencv-fft",
        "h_period_px": round(h_period_px, 2),
        "v_period_px": round(v_period_px, 2),
        "image_width": orig_w,
        "image_height": orig_h,
        "annotated_image_path": annotated_path if annotated_path and os.path.exists(annotated_path or "") else None,
        "detail": "; ".join(detail_parts),
    }


def _draw_annotation(src_path, out_path, h_period_px, v_period_px, scale, img_w, img_h, edges=None):
    """在缩略图上绘制检测到的砖缝网格线并标注比例尺信息。"""
    from PIL import Image, ImageDraw
    preview_max = 1200
    img = Image.open(src_path).convert("RGB")
    sf = min(1.0, preview_max / max(img.width, img.height))
    pw = int(img.width * sf)
    ph = int(img.height * sf)
    img = img.resize((pw, ph), Image.LANCZOS)
    draw = ImageDraw.Draw(img, "RGBA")

    h_step = h_period_px * sf
    v_step = v_period_px * sf

    if edges is not None:
        try:
            import numpy as np
            edge_arr = edges if edges.ndim == 2 else edges[:, :, 0]
            edge_img = Image.fromarray(edge_arr.astype(np.uint8), mode='L').resize((pw, ph))
            img = Image.blend(img.convert('RGBA'), edge_img.convert('RGB').convert('RGBA'), 0.12)
            draw = ImageDraw.Draw(img, "RGBA")
        except Exception:
            pass

    if h_step > 2:
        y = h_step
        while y < ph:
            draw.line([(0, y), (pw, y)], fill=(180, 240, 120, 150), width=1)
            y += h_step

    if v_step > 2:
        x = v_step
        while x < pw:
            draw.line([(x, 0), (x, ph)], fill=(120, 220, 255, 150), width=1)
            x += v_step

    info = f"Scale: {scale:.4f} px/mm  |  H-period: {h_period_px:.1f}px  V-period: {v_period_px:.1f}px"
    draw.rectangle([0, 0, pw, 28], fill=(0, 0, 0, 160))
    draw.text((6, 6), info, fill=(255, 255, 80))

    img.convert('RGB').save(out_path, "JPEG", quality=88)


def main():
    if len(sys.argv) < 4:
        print(json.dumps({
            "success": False,
            "message": "用法: brick_scale.py <image> <A_mm> <B_mm> [annotated_path]"
        }))
        sys.exit(1)

    image_path = sys.argv[1]
    try:
        brick_A = float(sys.argv[2])
        brick_B = float(sys.argv[3])
    except ValueError:
        print(json.dumps({"success": False, "message": "A_mm 和 B_mm 必须为数字"}))
        sys.exit(1)

    annotated_out = sys.argv[4] if len(sys.argv) > 4 else None
    result = detect_brick_scale(image_path, brick_A, brick_B, annotated_out)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
