#!/usr/bin/env python3
"""Warp mínimo de perspectiva por 4 cantos — sem detecção nem pipeline pesado."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

SCRIPT_START = time.perf_counter()

CV2_IMPORT_START = time.perf_counter()
import cv2  # noqa: E402
import numpy as np  # noqa: E402

CV2_IMPORT_MS = int((time.perf_counter() - CV2_IMPORT_START) * 1000)
PYTHON_STARTUP_MS = int((CV2_IMPORT_START - SCRIPT_START) * 1000)

OUTPUT_MAX = 2600
OUTPUT_MARGIN_RATIO = 0.03
MARGIN_FILL_VALUE = 248
JPEG_QUALITY = 92


def elapsed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


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


def output_size_from_quad(quad: np.ndarray) -> tuple[int, int]:
    tl, tr, br, bl = quad
    top = float(np.linalg.norm(tr - tl))
    bottom = float(np.linalg.norm(br - bl))
    left = float(np.linalg.norm(bl - tl))
    right = float(np.linalg.norm(br - tr))
    width = max(top, bottom, 1.0)
    height = max(left, right, 1.0)
    scale = min(1.0, OUTPUT_MAX / max(width, height))
    return max(1, int(round(width * scale))), max(1, int(round(height * scale)))


def validate_corners(quad: np.ndarray, width: int, height: int) -> bool:
    if quad.shape != (4, 2):
        return False
    if np.any(quad[:, 0] < 0) or np.any(quad[:, 1] < 0):
        return False
    if np.any(quad[:, 0] > width) or np.any(quad[:, 1] > height):
        return False
    area = cv2.contourArea(quad.astype(np.float32))
    if area <= 0:
        return False
    area_ratio = area / float(max(1, width * height))
    return 0.08 <= area_ratio <= 0.98


def load_corners(corners_file: str) -> np.ndarray:
    payload = json.loads(Path(corners_file).read_text(encoding='utf-8'))
    if not isinstance(payload, list) or len(payload) != 4:
        raise ValueError('Esperado array JSON com 4 pontos.')
    points = np.asarray([[float(p['x']), float(p['y'])] for p in payload], dtype=np.float32)
    return order_points(points)


def add_margin(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    margin = max(8, int(round(min(height, width) * OUTPUT_MARGIN_RATIO)))
    canvas = np.full((height + margin * 2, width + margin * 2, 3), MARGIN_FILL_VALUE, dtype=np.uint8)
    canvas[margin : margin + height, margin : margin + width] = image
    return canvas


def light_enhance(image: np.ndarray) -> np.ndarray:
    enhanced = cv2.convertScaleAbs(image, alpha=1.03, beta=2)
    return cv2.GaussianBlur(enhanced, (0, 0), 0.6)


def warp_image(source: np.ndarray, quad: np.ndarray) -> np.ndarray:
    ordered = order_points(quad)
    out_w, out_h = output_size_from_quad(ordered)
    destination = np.array(
        [[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(ordered, destination)
    warped = cv2.warpPerspective(
        source,
        matrix,
        (out_w, out_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(245, 245, 245),
    )
    warped = light_enhance(warped)
    return add_margin(warped)


def write_jpeg(image: np.ndarray, output_path: str) -> None:
    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    ok = cv2.imwrite(str(out_path), image, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise RuntimeError(f'Falha ao gravar JPEG: {out_path}')


def build_response(
    *,
    success: bool,
    output_path: str = '',
    input_width: int = 0,
    input_height: int = 0,
    output_width: int = 0,
    output_height: int = 0,
    warp_ms: int = 0,
    output_ms: int = 0,
    error: str | None = None,
) -> dict[str, Any]:
    duration_ms = int((time.perf_counter() - SCRIPT_START) * 1000)
    return {
        'success': success,
        'output_path': output_path,
        'confidence': 0.995 if success else 0.0,
        'final_dimensions': {'width': output_width, 'height': output_height},
        'input_dimensions': {'width': input_width, 'height': input_height},
        'fallback_used': False,
        'output_format': 'jpeg',
        'method': 'python-fast-script',
        'timing': {
            'duration_ms': duration_ms,
            'python_startup_ms': PYTHON_STARTUP_MS,
            'cv2_import_ms': CV2_IMPORT_MS,
            'warp_ms': warp_ms,
            'output_ms': output_ms,
        },
        'error': error,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description='Fast perspective warp by corners')
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--corners-file', required=True)
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()

    try:
        read_start = time.perf_counter()
        source = cv2.imread(args.input, cv2.IMREAD_COLOR)
        read_ms = elapsed_ms(read_start)
        if source is None:
            payload = build_response(success=False, error=f'Nao foi possivel abrir: {args.input}')
            print(json.dumps(payload))
            return 1

        input_height, input_width = source.shape[:2]
        corners = load_corners(args.corners_file)
        if not validate_corners(corners, input_width, input_height):
            payload = build_response(
                success=False,
                input_width=input_width,
                input_height=input_height,
                error='Cantos invalidos para warp rapido.',
            )
            print(json.dumps(payload))
            return 1

        warp_start = time.perf_counter()
        processed = warp_image(source, corners)
        warp_ms = elapsed_ms(warp_start) + read_ms

        output_start = time.perf_counter()
        out_height, out_width = processed.shape[:2]
        write_jpeg(processed, args.output)
        output_ms = elapsed_ms(output_start)

        payload = build_response(
            success=True,
            output_path=args.output,
            input_width=input_width,
            input_height=input_height,
            output_width=out_width,
            output_height=out_height,
            warp_ms=warp_ms,
            output_ms=output_ms,
        )
        print(json.dumps(payload))
        return 0
    except Exception as exc:  # noqa: BLE001
        payload = build_response(success=False, error=str(exc))
        print(json.dumps(payload))
        return 1


if __name__ == '__main__':
    sys.exit(main())
