import sharp from 'sharp';
import type { DocumentImagePoint } from './document-image-processor.js';

export interface NativeWarpTiming {
  warpMs: number;
  outputMs: number;
  durationMs: number;
}

export interface NativeWarpResult {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  inputWidth: number;
  inputHeight: number;
  timing: NativeWarpTiming;
}

export interface NativeWarpOptions {
  maxDimension?: number;
  marginRatio?: number;
  jpegQuality?: number;
  /** Aplica acabamento leve (contraste/legibilidade/nitidez). Default: true. Use false para pós-processamento externo. */
  enhance?: boolean;
  /** Proporção de saída do warp. AUTO usa arestas medidas do quad. */
  documentRatio?: DocumentRatioMode;
}

export type DocumentRatioMode = 'A1_PORTRAIT' | 'A1_LANDSCAPE' | 'AUTO';

/** A1 ISO: 841 × 594 mm */
export const A1_WIDTH_MM = 841;
export const A1_HEIGHT_MM = 594;

const DEFAULT_MAX_DIMENSION = 1800;
const DEFAULT_MARGIN_RATIO = 0.03;
const DEFAULT_JPEG_QUALITY = 92;
const MARGIN_FILL = 250;

interface Point {
  x: number;
  y: number;
}
interface Quad {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}
interface Homography {
  h0: number;
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  h5: number;
  h6: number;
  h7: number;
}

/**
 * Ordena 4 pontos em [topLeft, topRight, bottomRight, bottomLeft]
 * usando soma/diferença das coordenadas (mesmo critério do warp OpenCV).
 */
export function orderDocumentCorners(points: DocumentImagePoint[]): DocumentImagePoint[] {
  const quad = orderCorners(points);
  return [quad.tl, quad.tr, quad.br, quad.bl];
}

function orderCorners(points: DocumentImagePoint[]): Quad {
  if (points.length !== 4) {
    throw new Error('Warp nativo requer exatamente 4 cantos.');
  }
  const pts: Point[] = points.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
  if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error('Cantos com coordenadas inválidas.');
  }
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.y - a.x - (b.y - b.x));
  return {
    tl: bySum[0] as Point,
    br: bySum[3] as Point,
    tr: byDiff[0] as Point,
    bl: byDiff[3] as Point,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function outputSize(
  quad: Quad,
  maxDimension: number,
  documentRatio: DocumentRatioMode = 'AUTO'
): { width: number; height: number } {
  const top = distance(quad.tr, quad.tl);
  const bottom = distance(quad.br, quad.bl);
  const left = distance(quad.bl, quad.tl);
  const right = distance(quad.br, quad.tr);
  const rawWidth = Math.max(top, bottom, 1);
  const rawHeight = Math.max(left, right, 1);

  if (documentRatio === 'A1_PORTRAIT') {
    const targetHeight = Math.min(maxDimension, Math.max(Math.round(rawHeight), 400));
    const targetWidth = Math.max(1, Math.round(targetHeight * (A1_HEIGHT_MM / A1_WIDTH_MM)));
    return { width: targetWidth, height: targetHeight };
  }

  if (documentRatio === 'A1_LANDSCAPE') {
    const targetWidth = Math.min(maxDimension, Math.max(Math.round(rawWidth), 400));
    const targetHeight = Math.max(1, Math.round(targetWidth * (A1_HEIGHT_MM / A1_WIDTH_MM)));
    return { width: targetWidth, height: targetHeight };
  }

  // AUTO: infer portrait vs landscape from measured quad
  const inferredPortrait = rawHeight >= rawWidth;
  if (inferredPortrait) {
    const targetHeight = Math.min(maxDimension, Math.max(Math.round(rawHeight), 400));
    const targetWidth = Math.max(1, Math.round(targetHeight * (A1_HEIGHT_MM / A1_WIDTH_MM)));
    return { width: targetWidth, height: targetHeight };
  }

  const targetWidth = Math.min(maxDimension, Math.max(Math.round(rawWidth), 400));
  const targetHeight = Math.max(1, Math.round(targetWidth * (A1_HEIGHT_MM / A1_WIDTH_MM)));
  return { width: targetWidth, height: targetHeight };
}

export interface RawWarpResult {
  buffer: Buffer;
  width: number;
  height: number;
  inputWidth: number;
  inputHeight: number;
  warpMs: number;
}

/** Warp perspectivo puro (RGB raw), sem margem, JPEG ou realce. */
export async function warpPerspectiveRaw(
  inputBuffer: Buffer,
  corners: DocumentImagePoint[],
  options: Pick<NativeWarpOptions, 'maxDimension' | 'documentRatio'> = {}
): Promise<RawWarpResult> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const documentRatio = options.documentRatio ?? 'AUTO';

  return warpPerspectiveRawFromRotatedBuffer(
    await sharp(inputBuffer, { failOn: 'none' })
      .rotate()
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    corners,
    maxDimension,
    documentRatio
  );
}

async function warpPerspectiveRawFromRotatedBuffer(
  rotated: { data: Buffer; info: sharp.OutputInfo },
  corners: DocumentImagePoint[],
  maxDimension: number,
  documentRatio: DocumentRatioMode
): Promise<RawWarpResult> {
  const { data, info } = rotated;
  const srcWidth = info.width;
  const srcHeight = info.height;
  const channels = info.channels;
  if (channels < 3) {
    throw new Error('Imagem de origem precisa de pelo menos 3 canais.');
  }

  const quad = orderCorners(corners);
  const { width: outWidth, height: outHeight } = outputSize(quad, maxDimension, documentRatio);

  const dstQuad: Quad = {
    tl: { x: 0, y: 0 },
    tr: { x: outWidth, y: 0 },
    br: { x: outWidth, y: outHeight },
    bl: { x: 0, y: outHeight },
  };
  const h = homographyDestToSource(dstQuad, quad);

  const warpStart = Date.now();
  const out = Buffer.alloc(outWidth * outHeight * 3);
  const maxX = srcWidth - 1;
  const maxY = srcHeight - 1;

  for (let oy = 0; oy < outHeight; oy += 1) {
    const yh1 = h.h1 * oy;
    const yh4 = h.h4 * oy;
    const yh7 = h.h7 * oy;
    let rowOffset = oy * outWidth * 3;
    for (let ox = 0; ox < outWidth; ox += 1) {
      const den = h.h6 * ox + yh7 + 1;
      const sx = (h.h0 * ox + yh1 + h.h2) / den;
      const sy = (h.h3 * ox + yh4 + h.h5) / den;

      let cx = sx;
      let cy = sy;
      if (cx < 0) cx = 0;
      else if (cx > maxX) cx = maxX;
      if (cy < 0) cy = 0;
      else if (cy > maxY) cy = maxY;

      const x0 = Math.floor(cx);
      const y0 = Math.floor(cy);
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;
      const fx = cx - x0;
      const fy = cy - y0;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * srcWidth + x0) * channels;
      const i10 = (y0 * srcWidth + x1) * channels;
      const i01 = (y1 * srcWidth + x0) * channels;
      const i11 = (y1 * srcWidth + x1) * channels;

      out[rowOffset] = data[i00]! * w00 + data[i10]! * w10 + data[i01]! * w01 + data[i11]! * w11;
      out[rowOffset + 1] =
        data[i00 + 1]! * w00 + data[i10 + 1]! * w10 + data[i01 + 1]! * w01 + data[i11 + 1]! * w11;
      out[rowOffset + 2] =
        data[i00 + 2]! * w00 + data[i10 + 2]! * w10 + data[i01 + 2]! * w01 + data[i11 + 2]! * w11;

      rowOffset += 3;
    }
  }

  return {
    buffer: out,
    width: outWidth,
    height: outHeight,
    inputWidth: srcWidth,
    inputHeight: srcHeight,
    warpMs: Date.now() - warpStart,
  };
}

/**
 * Homografia que mapeia o retângulo de destino (saída) -> quadrilátero de origem.
 * Resolve um sistema 8x8 por eliminação de Gauss (matriz aumentada plana em
 * Float64Array). Permite amostrar a origem percorrendo cada pixel de saída.
 */
function homographyDestToSource(dst: Quad, src: Quad): Homography {
  const n = 8;
  const cols = n + 1;
  const m = new Float64Array(n * cols);
  const dstPts = [dst.tl, dst.tr, dst.br, dst.bl];
  const srcPts = [src.tl, src.tr, src.br, src.bl];

  for (let i = 0; i < 4; i += 1) {
    const d = dstPts[i] as Point;
    const s = srcPts[i] as Point;
    const r1 = 2 * i * cols;
    m[r1 + 0] = d.x;
    m[r1 + 1] = d.y;
    m[r1 + 2] = 1;
    m[r1 + 6] = -d.x * s.x;
    m[r1 + 7] = -d.y * s.x;
    m[r1 + 8] = s.x;
    const r2 = (2 * i + 1) * cols;
    m[r2 + 3] = d.x;
    m[r2 + 4] = d.y;
    m[r2 + 5] = 1;
    m[r2 + 6] = -d.x * s.y;
    m[r2 + 7] = -d.y * s.y;
    m[r2 + 8] = s.y;
  }

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row * cols + col]!) > Math.abs(m[pivot * cols + col]!)) {
        pivot = row;
      }
    }
    if (Math.abs(m[pivot * cols + col]!) < 1e-12) {
      throw new Error('Geometria de cantos degenerada para o warp.');
    }
    if (pivot !== col) {
      for (let c = 0; c < cols; c += 1) {
        const tmp = m[col * cols + c]!;
        m[col * cols + c] = m[pivot * cols + c]!;
        m[pivot * cols + c] = tmp;
      }
    }
    const pivotValue = m[col * cols + col]!;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row * cols + col]! / pivotValue;
      if (factor === 0) continue;
      for (let c = col; c < cols; c += 1) {
        m[row * cols + c] = m[row * cols + c]! - factor * m[col * cols + c]!;
      }
    }
  }

  const h = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    h[i] = m[i * cols + n]! / m[i * cols + i]!;
  }
  return {
    h0: h[0]!,
    h1: h[1]!,
    h2: h[2]!,
    h3: h[3]!,
    h4: h[4]!,
    h5: h[5]!,
    h6: h[6]!,
    h7: h[7]!,
  };
}

/**
 * Aplica correção de perspectiva por 4 cantos usando apenas Node + sharp,
 * sem depender de Python/OpenCV. Amostragem bilinear com inverse mapping.
 */
export async function warpPerspectiveNative(
  inputBuffer: Buffer,
  corners: DocumentImagePoint[],
  options: NativeWarpOptions = {}
): Promise<NativeWarpResult> {
  const startedAt = Date.now();
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const marginRatio = options.marginRatio ?? DEFAULT_MARGIN_RATIO;
  const jpegQuality = options.jpegQuality ?? DEFAULT_JPEG_QUALITY;

  const { data, info } = await sharp(inputBuffer, { failOn: 'none' })
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const srcWidth = info.width;
  const srcHeight = info.height;
  const channels = info.channels;
  if (channels < 3) {
    throw new Error('Imagem de origem precisa de pelo menos 3 canais.');
  }

  const quad = orderCorners(corners);
  const documentRatio = options.documentRatio ?? 'AUTO';
  const { width: outWidth, height: outHeight } = outputSize(quad, maxDimension, documentRatio);

  const dstQuad: Quad = {
    tl: { x: 0, y: 0 },
    tr: { x: outWidth, y: 0 },
    br: { x: outWidth, y: outHeight },
    bl: { x: 0, y: outHeight },
  };
  const h = homographyDestToSource(dstQuad, quad);

  const warpStart = Date.now();
  const out = Buffer.alloc(outWidth * outHeight * 3);
  const maxX = srcWidth - 1;
  const maxY = srcHeight - 1;

  for (let oy = 0; oy < outHeight; oy += 1) {
    const yh1 = h.h1 * oy;
    const yh4 = h.h4 * oy;
    const yh7 = h.h7 * oy;
    let rowOffset = oy * outWidth * 3;
    for (let ox = 0; ox < outWidth; ox += 1) {
      const den = h.h6 * ox + yh7 + 1;
      const sx = (h.h0 * ox + yh1 + h.h2) / den;
      const sy = (h.h3 * ox + yh4 + h.h5) / den;

      let cx = sx;
      let cy = sy;
      if (cx < 0) cx = 0;
      else if (cx > maxX) cx = maxX;
      if (cy < 0) cy = 0;
      else if (cy > maxY) cy = maxY;

      const x0 = Math.floor(cx);
      const y0 = Math.floor(cy);
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;
      const fx = cx - x0;
      const fy = cy - y0;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * srcWidth + x0) * channels;
      const i10 = (y0 * srcWidth + x1) * channels;
      const i01 = (y1 * srcWidth + x0) * channels;
      const i11 = (y1 * srcWidth + x1) * channels;

      out[rowOffset] = data[i00]! * w00 + data[i10]! * w10 + data[i01]! * w01 + data[i11]! * w11;
      out[rowOffset + 1] =
        data[i00 + 1]! * w00 + data[i10 + 1]! * w10 + data[i01 + 1]! * w01 + data[i11 + 1]! * w11;
      out[rowOffset + 2] =
        data[i00 + 2]! * w00 + data[i10 + 2]! * w10 + data[i01 + 2]! * w01 + data[i11 + 2]! * w11;

      rowOffset += 3;
    }
  }
  const warpMs = Date.now() - warpStart;

  const outputStart = Date.now();
  const margin = Math.max(8, Math.round(Math.min(outWidth, outHeight) * marginRatio));
  const enhance = options.enhance ?? true;

  let pipeline = sharp(out, {
    raw: { width: outWidth, height: outHeight, channels: 3 },
  });

  if (enhance) {
    // Acabamento "scan profissional", leve e seguro (preserva cor de mapas):
    //  1. contraste global suave para limpar o papel e firmar o texto;
    //  2. CLAHE (contraste local) para realçar legibilidade de texto/linhas;
    //  3. micro-ajuste de brilho/saturação para um papel mais limpo;
    //  4. nitidez leve (unsharp) sem halos agressivos.
    const claheTile = Math.min(256, Math.max(32, Math.round(Math.min(outWidth, outHeight) / 8)));
    pipeline = pipeline
      .linear(1.08, -10)
      .clahe({ width: claheTile, height: claheTile, maxSlope: 2 })
      .modulate({ brightness: 1.02, saturation: 1.03 })
      .sharpen({ sigma: 0.8, m1: 0.4, m2: 1.6 });
  }

  const buffer = await pipeline
    .extend({
      top: margin,
      bottom: margin,
      left: margin,
      right: margin,
      background: { r: MARGIN_FILL, g: MARGIN_FILL, b: MARGIN_FILL },
    })
    .jpeg({ quality: jpegQuality, mozjpeg: true })
    .toBuffer();
  const outputMs = Date.now() - outputStart;

  return {
    buffer,
    mimeType: 'image/jpeg',
    width: outWidth + margin * 2,
    height: outHeight + margin * 2,
    inputWidth: srcWidth,
    inputHeight: srcHeight,
    timing: {
      warpMs,
      outputMs,
      durationMs: Date.now() - startedAt,
    },
  };
}
