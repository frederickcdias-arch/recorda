from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np


DETECT_MAX = 1400
OUTPUT_MAX = 2600
MIN_CONFIDENCE = 0.58
OUTPUT_MARGIN_RATIO = 0.03
FRINGE_CROP_RATIO = 0.012
MARGIN_FILL_VALUE = 248
MANUAL_MODE_DEFAULT = 'faithful-document'
# Reservado para um modo futuro mais agressivo, sem ativacao por padrao no fluxo manual.
MANUAL_MODE_ENHANCED = 'enhanced-document'


@dataclass
class DetectionResult:
    corners: np.ndarray | None
    confidence: float
    fallback_used: bool
    message: str | None = None


def build_postprocess_metadata(
    *,
    manual_mode: str | None = None,
    border_cleanup: bool = True,
    paper_normalization: str | bool = 'soft',
    corners_source: str = 'auto-detect',
    manual_corners_received: bool = False,
    python_used: bool = True,
    manual_finalize_used: bool = False,
    isolate_exterior: bool = True,
    shadow_balance: bool = True,
    only_warp_and_margin: bool = False,
) -> dict[str, Any]:
    return {
        'manualMode': manual_mode,
        'cornersSource': corners_source,
        'manualCornersReceived': manual_corners_received,
        'pythonUsed': python_used,
        'manualFinalizeUsed': manual_finalize_used,
        'borderCleanup': border_cleanup,
        'isolateExterior': isolate_exterior,
        'marginMode': 'clean-white',
        'paperNormalization': paper_normalization,
        'shadowBalance': shadow_balance,
        'onlyWarpAndMargin': only_warp_and_margin,
        'contentPreserved': True,
    }


def load_corners_file(corners_file: str | None) -> np.ndarray | None:
    if not corners_file:
        return None
    payload = json.loads(Path(corners_file).read_text(encoding='utf-8'))
    if not isinstance(payload, list) or len(payload) != 4:
        raise ValueError('Arquivo de cantos invalido: esperado array com 4 pontos.')
    points = np.asarray([[float(p['x']), float(p['y'])] for p in payload], dtype=np.float32)
    if points.shape != (4, 2):
        raise ValueError('Arquivo de cantos invalido: formato incorreto.')
    return order_points(points)


def order_points(points: np.ndarray) -> np.ndarray:
    pts = np.asarray(points, dtype=np.float32).reshape(4, 2)
    sums = pts.sum(axis=1)
    diffs = np.diff(pts, axis=1).reshape(-1)
    ordered = np.zeros((4, 2), dtype=np.float32)
    ordered[0] = pts[np.argmin(sums)]
    ordered[2] = pts[np.argmax(sums)]
    ordered[1] = pts[np.argmin(diffs)]
    ordered[3] = pts[np.argmax(diffs)]
    return ordered


def resize_for_detection(image: np.ndarray) -> tuple[np.ndarray, float]:
    height, width = image.shape[:2]
    scale = min(1.0, DETECT_MAX / float(max(height, width)))
    if scale >= 0.999:
        return image.copy(), 1.0
    resized = cv2.resize(
        image,
        (max(1, int(round(width * scale))), max(1, int(round(height * scale)))),
        interpolation=cv2.INTER_AREA,
    )
    return resized, scale


def estimate_background_bgr(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    border = max(3, int(round(min(height, width) * 0.03)))
    strips = [
        image[:border, :, :],
        image[-border:, :, :],
        image[:, :border, :],
        image[:, -border:, :],
    ]
    samples = np.concatenate([strip.reshape(-1, 3) for strip in strips], axis=0)
    return np.median(samples, axis=0).astype(np.float32)


def build_document_mask(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    background = estimate_background_bgr(image)
    distance = np.linalg.norm(image.astype(np.float32) - background, axis=2)

    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    bg_luma = float(np.dot(background[::-1], np.array([0.299, 0.587, 0.114], dtype=np.float32)))

    color_mask = (distance > 26).astype(np.uint8) * 255
    paper_mask = (
        (gray > max(150, int(bg_luma + 18))) & (hsv[:, :, 1] < 64)
    ).astype(np.uint8) * 255

    mask = cv2.bitwise_or(color_mask, paper_mask)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.medianBlur(mask, 5)

    flood = mask.copy()
    flood_mask = np.zeros((height + 2, width + 2), dtype=np.uint8)
    cv2.floodFill(flood, flood_mask, (0, 0), 255)
    holes = cv2.bitwise_not(flood)
    filled = cv2.bitwise_or(mask, holes)

    return cv2.morphologyEx(filled, cv2.MORPH_CLOSE, kernel, iterations=1)


def contour_to_quad(contour: np.ndarray) -> np.ndarray | None:
    hull = cv2.convexHull(contour)
    perimeter = cv2.arcLength(hull, True)
    for epsilon_factor in (0.015, 0.02, 0.03, 0.04, 0.05):
        approx = cv2.approxPolyDP(hull, perimeter * epsilon_factor, True)
        if len(approx) == 4:
            return order_points(approx.reshape(4, 2))

    rect = cv2.minAreaRect(hull)
    box = cv2.boxPoints(rect)
    if len(box) == 4:
        return order_points(box)
    return None


def quad_area_ratio(quad: np.ndarray, width: int, height: int) -> float:
    area = cv2.contourArea(quad.reshape(-1, 1, 2))
    return float(area) / float(width * height)


def edge_balance(quad: np.ndarray) -> float:
    tl, tr, br, bl = quad
    top = np.linalg.norm(tr - tl)
    right = np.linalg.norm(br - tr)
    bottom = np.linalg.norm(br - bl)
    left = np.linalg.norm(bl - tl)
    horizontal = min(top, bottom) / max(top, bottom, 1.0)
    vertical = min(left, right) / max(left, right, 1.0)
    return float(min(horizontal, vertical))


def quad_border_margin_ratio(quad: np.ndarray, width: int, height: int) -> float:
    xs = quad[:, 0]
    ys = quad[:, 1]
    min_x = float(np.min(xs))
    max_x = float(np.max(xs))
    min_y = float(np.min(ys))
    max_y = float(np.max(ys))
    margins = np.array(
        [min_x, min_y, max(width - 1 - max_x, 0.0), max(height - 1 - max_y, 0.0)],
        dtype=np.float32,
    )
    return float(np.min(margins) / max(float(min(width, height)), 1.0))


def contour_border_touch_ratio(contour: np.ndarray, width: int, height: int) -> float:
    points = contour.reshape(-1, 2)
    touches = (
        (points[:, 0] <= 1)
        | (points[:, 1] <= 1)
        | (points[:, 0] >= width - 2)
        | (points[:, 1] >= height - 2)
    )
    return float(np.mean(touches.astype(np.float32)))


def detect_document(image: np.ndarray) -> DetectionResult:
    detect_image, scale = resize_for_detection(image)
    mask = build_document_mask(detect_image)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return DetectionResult(corners=None, confidence=0.0, fallback_used=True, message='Documento nao detectado')

    height, width = detect_image.shape[:2]
    image_area = float(width * height)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)

    for contour in contours[:5]:
        area = cv2.contourArea(contour)
        if area < image_area * 0.08:
            continue
        quad = contour_to_quad(contour)
        if quad is None:
            continue

        area_ratio = quad_area_ratio(quad, width, height)
        balance = edge_balance(quad)
        margin_ratio = quad_border_margin_ratio(quad, width, height)
        border_touch = contour_border_touch_ratio(contour, width, height)
        confidence = max(0.0, min(1.0, 0.5 * area_ratio + 0.3 * balance + 0.2 * margin_ratio * 12.0))
        if area_ratio < 0.12:
            confidence *= 0.75
        if area_ratio > 0.96:
            confidence *= 0.2
        elif area_ratio > 0.92 and margin_ratio < 0.015:
            confidence *= 0.25
        elif area_ratio > 0.88 and border_touch > 0.12:
            confidence *= 0.35
        elif margin_ratio < 0.01:
            confidence *= 0.45

        if scale != 1.0:
            quad = quad / scale

        return DetectionResult(
            corners=quad.astype(np.float32),
            confidence=confidence,
            fallback_used=confidence < MIN_CONFIDENCE,
            message=None if confidence >= MIN_CONFIDENCE else 'Deteccao com baixa confianca',
        )

    return DetectionResult(corners=None, confidence=0.0, fallback_used=True, message='Documento nao detectado')


def output_size_from_quad(quad: np.ndarray) -> tuple[int, int]:
    tl, tr, br, bl = quad
    top = np.linalg.norm(tr - tl)
    bottom = np.linalg.norm(br - bl)
    left = np.linalg.norm(bl - tl)
    right = np.linalg.norm(br - tr)

    width = max(top, bottom, 1.0)
    height = max(left, right, 1.0)
    scale = min(1.0, OUTPUT_MAX / max(width, height))

    return max(1, int(round(width * scale))), max(1, int(round(height * scale)))


def validate_supplied_corners(quad: np.ndarray, width: int, height: int) -> bool:
    area_ratio = quad_area_ratio(quad, width, height)
    if area_ratio < 0.12 or area_ratio > 0.98:
        return False
    if edge_balance(quad) < 0.55:
        return False
    if quad_border_margin_ratio(quad, width, height) < 0.002:
        return False
    return True


def reduce_shadows_and_balance(image: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=1.0, tileGridSize=(8, 8))
    l_eq = clahe.apply(l_channel)

    blur = cv2.GaussianBlur(l_eq, (0, 0), sigmaX=21, sigmaY=21)
    normalized = cv2.divide(l_eq, blur, scale=128)
    normalized = cv2.addWeighted(l_eq, 0.88, normalized, 0.12, 0)
    merged = cv2.merge((normalized.astype(np.uint8), a_channel, b_channel))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


def denoise_and_sharpen(image: np.ndarray) -> np.ndarray:
    denoised = cv2.fastNlMeansDenoisingColored(image, None, 2, 2, 7, 11)
    blur = cv2.GaussianBlur(denoised, (0, 0), sigmaX=0.6, sigmaY=0.6)
    sharpened = cv2.addWeighted(denoised, 1.02, blur, -0.02, 0)
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def normalize_paper_tone(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    edges = cv2.Canny(gray, 70, 160)
    edges = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)
    illum = cv2.GaussianBlur(gray, (0, 0), sigmaX=31, sigmaY=31)

    paper_mask = ((gray > 142) & (hsv[:, :, 1] < 52) & (edges == 0)).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    paper_mask = cv2.morphologyEx(paper_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    paper_mask = cv2.morphologyEx(paper_mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    result = image.astype(np.float32)
    gray_f = gray.astype(np.float32)
    illum_f = illum.astype(np.float32)
    edge_gap = np.abs(gray_f - illum_f)
    lift = np.clip((242.0 - illum_f) / 120.0, 0.0, 0.24) + 0.03
    lift *= np.clip((135.0 - edge_gap) / 135.0, 0.0, 1.0)
    target = np.full_like(result, 246.0)
    mask = (paper_mask > 0)[..., None]
    result = np.where(mask, result * (1.0 - lift[..., None]) + target * lift[..., None], result)
    return np.clip(result, 0, 255).astype(np.uint8)


def build_page_mask(image: np.ndarray) -> np.ndarray | None:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    mask = ((gray > 122) & (hsv[:, :, 1] < 96)).astype(np.uint8) * 255
    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)),
        iterations=2,
    )
    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
        iterations=1,
    )

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    height, width = gray.shape[:2]
    image_area = float(height * width)
    center = (width * 0.5, height * 0.5)
    selected = None
    selected_area = 0.0

    for contour in contours:
        area = cv2.contourArea(contour)
        area_ratio = area / max(image_area, 1.0)
        if area_ratio < 0.32 or area_ratio > 0.97:
            continue
        if cv2.pointPolygonTest(contour, center, False) < 0:
            continue
        if area > selected_area:
            selected = contour
            selected_area = area

    if selected is None:
        return None

    page_mask = np.zeros_like(gray, dtype=np.uint8)
    cv2.drawContours(page_mask, [selected], -1, 255, thickness=cv2.FILLED)
    page_mask = cv2.dilate(
        page_mask,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)),
        iterations=1,
    )
    return page_mask


def clean_border_noise(image: np.ndarray, page_mask: np.ndarray | None = None) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    local_blur = cv2.GaussianBlur(gray, (0, 0), sigmaX=9, sigmaY=9)
    local_gap = np.abs(gray.astype(np.float32) - local_blur.astype(np.float32))
    edges = cv2.Canny(gray, 60, 150)
    edges = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)), iterations=1)

    height, width = gray.shape[:2]
    if page_mask is not None and np.any(page_mask > 0):
        distance_to_exterior = cv2.distanceTransform((page_mask > 0).astype(np.uint8), cv2.DIST_L2, 3)
        inner_band = distance_to_exterior <= max(10.0, min(height, width) * 0.024)
        bottom_guard = np.zeros_like(gray, dtype=bool)
        footer_limit = max(18, int(round(height * 0.13)))
        bottom_guard[-footer_limit:, :] = True
        outer_zone = inner_band | ((page_mask > 0) & bottom_guard & (distance_to_exterior <= max(12.0, height * 0.032)))
    else:
        top_band = max(10, int(round(height * 0.022)))
        side_band = max(10, int(round(width * 0.02)))
        bottom_band = max(14, int(round(height * 0.03)))
        outer_zone = np.zeros_like(gray, dtype=bool)
        outer_zone[:top_band, :] = True
        outer_zone[-bottom_band:, :] = True
        outer_zone[:, :side_band] = True
        outer_zone[:, -side_band:] = True

    protect = (edges > 0) | (gray < 108) | (hsv[:, :, 1] > 88)
    candidate = outer_zone & ~protect & (gray > 136) & (local_gap < 16)
    candidate = cv2.morphologyEx(
        candidate.astype(np.uint8) * 255,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
        iterations=1,
    ) > 0

    alpha = np.clip((gray.astype(np.float32) - 142.0) / 64.0, 0.0, 0.46)
    alpha *= candidate.astype(np.float32)
    alpha = cv2.GaussianBlur(alpha, (0, 0), sigmaX=2.8, sigmaY=2.8)

    result = image.astype(np.float32)
    target = np.full_like(result, float(MARGIN_FILL_VALUE))
    result = result * (1.0 - alpha[..., None]) + target * alpha[..., None]
    return np.clip(result, 0, 255).astype(np.uint8)


def isolate_document_exterior(image: np.ndarray) -> np.ndarray:
    page_mask = build_page_mask(image)
    if page_mask is None:
        return image

    result = np.full_like(image, MARGIN_FILL_VALUE)
    keep = page_mask > 0
    result[keep] = image[keep]
    return result


def enhance_document(image: np.ndarray, *, clean_paper: bool = True) -> np.ndarray:
    balanced = reduce_shadows_and_balance(image)
    sharpened = denoise_and_sharpen(balanced)
    if clean_paper:
        normalized = normalize_paper_tone(sharpened)
        page_mask = build_page_mask(normalized)
        isolated = isolate_document_exterior(normalized) if page_mask is not None else normalized
        return clean_border_noise(isolated, page_mask)
    return sharpened


def finalize_manual_document(image: np.ndarray) -> np.ndarray:
    balanced = reduce_shadows_and_balance(image)
    return normalize_paper_tone(balanced)


def add_scan_margin(image: np.ndarray, *, trim_fringe: bool = True) -> np.ndarray:
    height, width = image.shape[:2]
    crop = max(1, int(round(min(height, width) * FRINGE_CROP_RATIO))) if trim_fringe else 0
    if crop > 0 and width > crop * 2 + 8 and height > crop * 2 + 8:
        image = image[crop : height - crop, crop : width - crop]
        height, width = image.shape[:2]

    margin = max(8, int(round(min(height, width) * OUTPUT_MARGIN_RATIO)))
    canvas = np.full((height + margin * 2, width + margin * 2, 3), MARGIN_FILL_VALUE, dtype=np.uint8)
    canvas[margin : margin + height, margin : margin + width] = image
    return canvas


def warp_document(image: np.ndarray, quad: np.ndarray) -> tuple[np.ndarray, tuple[int, int]]:
    ordered = order_points(quad)
    out_w, out_h = output_size_from_quad(ordered)
    destination = np.array(
        [[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(ordered, destination)
    warped = cv2.warpPerspective(
        image,
        matrix,
        (out_w, out_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(245, 245, 245),
    )
    return warped, (out_w, out_h)


def write_output(image: np.ndarray, output_path: str) -> str:
    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    suffix = out_path.suffix.lower()
    if suffix == '.png':
        ok = cv2.imwrite(str(out_path), image, [cv2.IMWRITE_PNG_COMPRESSION, 2])
    else:
        ok = cv2.imwrite(str(out_path), image, [cv2.IMWRITE_JPEG_QUALITY, 94])
    if not ok:
        raise RuntimeError(f'Falha ao gravar arquivo de saida: {out_path}')
    return str(out_path)


def process_document_image(input_path: str, output_path: str, corners_file: str | None = None) -> dict[str, Any]:
    source = cv2.imread(input_path, cv2.IMREAD_COLOR)
    if source is None:
        return {
            'success': False,
            'output_path': '',
            'confidence': 0.0,
            'final_dimensions': {'width': 0, 'height': 0},
            'fallback_used': True,
            'error': f'Nao foi possivel abrir a imagem: {input_path}',
        }

    supplied_corners = load_corners_file(corners_file)
    if supplied_corners is not None:
        height, width = source.shape[:2]
        if validate_supplied_corners(supplied_corners, width, height):
            processed, _ = warp_document(source, supplied_corners)
            processed = add_scan_margin(processed, trim_fringe=False)
            out_h, out_w = processed.shape[:2]
            output_file = write_output(processed, output_path)
            return {
                'success': True,
                'output_path': output_file,
                'confidence': 0.995,
                'final_dimensions': {'width': out_w, 'height': out_h},
                'fallback_used': False,
                'output_format': Path(output_file).suffix.lower().lstrip('.'),
                'postprocess': build_postprocess_metadata(
                    manual_mode=MANUAL_MODE_DEFAULT,
                    border_cleanup=False,
                    corners_source='manual',
                    manual_corners_received=True,
                    manual_finalize_used=False,
                    isolate_exterior=False,
                    paper_normalization=False,
                    shadow_balance=False,
                    only_warp_and_margin=True,
                ),
            }

    detection = detect_document(source)

    if detection.corners is not None and detection.confidence >= MIN_CONFIDENCE:
        processed, (width, height) = warp_document(source, detection.corners)
        processed = enhance_document(processed, clean_paper=False)
        processed = add_scan_margin(processed)
        height, width = processed.shape[:2]
        output_file = write_output(processed, output_path)
        return {
            'success': True,
            'output_path': output_file,
            'confidence': round(float(detection.confidence), 4),
            'final_dimensions': {'width': width, 'height': height},
            'fallback_used': False,
            'output_format': Path(output_file).suffix.lower().lstrip('.'),
            'postprocess': build_postprocess_metadata(
                corners_source='auto-detect',
                manual_corners_received=False,
                manual_finalize_used=False,
                isolate_exterior=False,
                paper_normalization='minimal',
            ),
        }

    fallback = enhance_document(source, clean_paper=False)
    fallback = add_scan_margin(fallback)
    height, width = fallback.shape[:2]
    output_file = write_output(fallback, output_path)
    return {
        'success': True,
        'output_path': output_file,
        'confidence': round(float(detection.confidence), 4),
        'final_dimensions': {'width': width, 'height': height},
        'fallback_used': True,
        'output_format': Path(output_file).suffix.lower().lstrip('.'),
        'error': detection.message,
        'postprocess': build_postprocess_metadata(
            border_cleanup=False,
            corners_source='fallback',
            manual_corners_received=False,
            manual_finalize_used=False,
            isolate_exterior=False,
            paper_normalization='minimal',
        ),
    }


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Recorda document image processor')
    parser.add_argument('--input', required=True, dest='input_path')
    parser.add_argument('--output', required=True, dest='output_path')
    parser.add_argument('--corners-file', dest='corners_file')
    parser.add_argument('--json', action='store_true', dest='emit_json')
    return parser


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()
    result = process_document_image(args.input_path, args.output_path, args.corners_file)
    if args.emit_json:
        print(json.dumps(result, ensure_ascii=True))
    else:
        print(result)
    return 0 if result.get('success') else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover
        print(json.dumps({'success': False, 'error': str(exc)}), file=sys.stderr)
        raise
