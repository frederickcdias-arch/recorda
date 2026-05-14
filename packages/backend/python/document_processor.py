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


@dataclass
class DetectionResult:
    corners: np.ndarray | None
    confidence: float
    fallback_used: bool
    message: str | None = None


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


def reduce_shadows_and_balance(image: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(8, 8))
    l_eq = clahe.apply(l_channel)

    blur = cv2.GaussianBlur(l_eq, (0, 0), sigmaX=17, sigmaY=17)
    normalized = cv2.divide(l_eq, blur, scale=164)
    normalized = cv2.addWeighted(l_eq, 0.68, normalized, 0.32, 0)
    merged = cv2.merge((normalized.astype(np.uint8), a_channel, b_channel))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


def denoise_and_sharpen(image: np.ndarray) -> np.ndarray:
    denoised = cv2.fastNlMeansDenoisingColored(image, None, 2, 2, 7, 15)
    blur = cv2.GaussianBlur(denoised, (0, 0), sigmaX=0.9, sigmaY=0.9)
    sharpened = cv2.addWeighted(denoised, 1.08, blur, -0.08, 0)
    return np.clip(sharpened, 0, 255).astype(np.uint8)


def enhance_document(image: np.ndarray) -> np.ndarray:
    balanced = reduce_shadows_and_balance(image)
    return denoise_and_sharpen(balanced)


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
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
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


def process_document_image(input_path: str, output_path: str) -> dict[str, Any]:
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

    detection = detect_document(source)

    if detection.corners is not None and detection.confidence >= MIN_CONFIDENCE:
        processed, (width, height) = warp_document(source, detection.corners)
        processed = enhance_document(processed)
        output_file = write_output(processed, output_path)
        return {
            'success': True,
            'output_path': output_file,
            'confidence': round(float(detection.confidence), 4),
            'final_dimensions': {'width': width, 'height': height},
            'fallback_used': False,
            'output_format': Path(output_file).suffix.lower().lstrip('.'),
        }

    fallback = enhance_document(source)
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
    }


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Recorda document image processor')
    parser.add_argument('--input', required=True, dest='input_path')
    parser.add_argument('--output', required=True, dest='output_path')
    parser.add_argument('--json', action='store_true', dest='emit_json')
    return parser


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()
    result = process_document_image(args.input_path, args.output_path)
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
