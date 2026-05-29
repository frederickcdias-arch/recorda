import sharp from 'sharp';
import type { DocumentImagePoint } from './document-image-processor.js';
import { detectDocumentQuad } from './node-document-detect.js';
import { dewarpDocument } from './document-dewarp.js';
import {
  orderDocumentCorners,
  warpPerspectiveRaw,
  type DocumentRatioMode,
} from './node-perspective-warp.js';

export type { DocumentRatioMode };

export interface FaithfulDocumentCorners {
  topLeft: DocumentImagePoint;
  topRight: DocumentImagePoint;
  bottomRight: DocumentImagePoint;
  bottomLeft: DocumentImagePoint;
}

export interface FaithfulDocumentScanInput {
  imageBuffer: Buffer;
  mimeType?: string;
  corners?: FaithfulDocumentCorners | DocumentImagePoint[];
  /** Pontos médios manuais das 4 bordas: topo, direita, base, esquerda. */
  edgeMidpoints?: DocumentImagePoint[];
  documentRatio?: DocumentRatioMode;
  maxDimension?: number;
  jpegQuality?: number;
  marginRatio?: number;
  enhanceText?: boolean;
  reduceShadows?: boolean;
  sharpen?: boolean;
  /** Suavização gaussiana leve opcional antes da codificação final. */
  softenSigma?: number;
  /** Se true, tenta detectDocumentQuad quando cantos não são fornecidos. */
  autoDetectCorners?: boolean;
  /** Rotação fina pós-warp (desligada em mapas — linhas escuras confundem o detector). */
  enableFineAlignment?: boolean;
  /** Tenta dewarping por malha (corrige papel curvado) antes do warp planar. */
  enableMeshDewarp?: boolean;
}

export interface FaithfulDocumentScanOutput {
  imageBuffer: Buffer;
  thumbnailBuffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  cornersUsed: DocumentImagePoint[];
  processingMode: 'faithful-scan';
  usedGenerativeAI: false;
  perspectiveCorrected: true;
  contentPreservationMode: true;
  cornerSource: 'manual' | 'native-detect' | 'provided';
  documentRatio: DocumentRatioMode;
  /** Dewarping por malha aplicado (papel curvado corrigido). */
  meshDewarpApplied?: boolean;
  /** Flecha máxima das bordas (px) quando o dewarp foi aplicado. */
  meshDewarpBow?: number;
  timingMs: {
    warpMs: number;
    alignmentMs: number;
    illuminationMs: number;
    enhanceMs: number;
    totalMs: number;
  };
  alignmentApplied?: boolean;
  alignmentAngleDeg?: number;
}

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_JPEG_QUALITY = 92;
const DEFAULT_MARGIN_RATIO = 0.02;
const MARGIN_FILL = 252;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function cornersPayloadToArray(
  corners: FaithfulDocumentCorners | DocumentImagePoint[]
): DocumentImagePoint[] {
  if (Array.isArray(corners)) {
    return corners;
  }
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
}

function toCornersPayload(points: DocumentImagePoint[]): FaithfulDocumentCorners {
  const ordered = orderDocumentCorners(points);
  return {
    topLeft: ordered[0]!,
    topRight: ordered[1]!,
    bottomRight: ordered[2]!,
    bottomLeft: ordered[3]!,
  };
}

/** Box blur separável em canal de luminância (estimativa de fundo). */
function boxBlurChannel(
  channel: Float32Array,
  width: number,
  height: number,
  radius: number
): Float32Array {
  const tmp = new Float32Array(channel.length);
  const out = new Float32Array(channel.length);
  const diam = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) {
      const cx = Math.min(width - 1, Math.max(0, x));
      sum += channel[y * width + cx]!;
    }
    for (let x = 0; x < width; x += 1) {
      const xRemove = Math.min(width - 1, Math.max(0, x - radius - 1));
      const xAdd = Math.min(width - 1, Math.max(0, x + radius));
      sum += channel[y * width + xAdd]! - channel[y * width + xRemove]!;
      tmp[y * width + x] = sum / diam;
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) {
      const cy = Math.min(height - 1, Math.max(0, y));
      sum += tmp[cy * width + x]!;
    }
    for (let y = 0; y < height; y += 1) {
      const yRemove = Math.min(height - 1, Math.max(0, y - radius - 1));
      const yAdd = Math.min(height - 1, Math.max(0, y + radius));
      sum += tmp[yAdd * width + x]! - tmp[yRemove * width + x]!;
      out[y * width + x] = sum / diam;
    }
  }

  return out;
}

/** sRGB [0,255] → CIELAB L* [0,100], a*, b* */
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  let rr = r / 255;
  let gg = g / 255;
  let bb = b / 255;
  rr = rr <= 0.04045 ? rr / 12.92 : ((rr + 0.055) / 1.055) ** 2.4;
  gg = gg <= 0.04045 ? gg / 12.92 : ((gg + 0.055) / 1.055) ** 2.4;
  bb = bb <= 0.04045 ? bb / 12.92 : ((bb + 0.055) / 1.055) ** 2.4;

  const x = (rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375) / 0.95047;
  const y = rr * 0.2126729 + gg * 0.7151522 + bb * 0.072175;
  const z = (rr * 0.0193339 + gg * 0.119192 + bb * 0.9503041) / 1.08883;

  const fx = x > 0.008856 ? x ** (1 / 3) : 7.787 * x + 16 / 116;
  const fy = y > 0.008856 ? y ** (1 / 3) : 7.787 * y + 16 / 116;
  const fz = z > 0.008856 ? z ** (1 / 3) : 7.787 * z + 16 / 116;

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIELAB → sRGB [0,255] */
function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const inv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = 0.95047 * inv(fx);
  const y = inv(fy);
  const z = 1.08883 * inv(fz);

  const rr = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const gg = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const bb = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

  const toSrgb = (c: number) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return clampByte(v * 255);
  };

  return [toSrgb(rr), toSrgb(gg), toSrgb(bb)];
}

/**
 * Correção de iluminação não generativa no canal L (LAB):
 * estima fundo com blur grande e normaliza luminosidade.
 */
function correctIlluminationLab(
  rgb: Buffer,
  width: number,
  height: number,
  enabled: boolean
): Buffer {
  if (!enabled) return Buffer.from(rgb);

  const total = width * height;
  const L = new Float32Array(total);
  const A = new Float32Array(total);
  const B = new Float32Array(total);

  for (let i = 0, p = 0; i < total; i += 1, p += 3) {
    const [l, a, b] = rgbToLab(rgb[p]!, rgb[p + 1]!, rgb[p + 2]!);
    L[i] = l;
    A[i] = a;
    B[i] = b;
  }

  const radius = Math.max(16, Math.round(Math.min(width, height) / 10));
  const background = boxBlurChannel(L, width, height, radius);

  let meanBg = 0;
  for (let i = 0; i < total; i += 1) meanBg += background[i]!;
  meanBg /= total;

  const out = Buffer.alloc(rgb.length);
  for (let i = 0, p = 0; i < total; i += 1, p += 3) {
    const bg = Math.max(background[i]!, 8);
    const normalizedL = Math.min(100, Math.max(0, (L[i]! / bg) * meanBg));
    const [r, g, b] = labToRgb(normalizedL, A[i]!, B[i]!);
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
  }
  return out;
}

/** Estima rotação residual (graus) a partir de bordas horizontais dominantes. */
function estimateResidualSkewDegrees(rgb: Buffer, width: number, height: number): number {
  const samples: Array<{ x: number; y: number }> = [];
  const scanYs = [Math.round(height * 0.08), Math.round(height * 0.5), Math.round(height * 0.92)];

  for (const y of scanYs) {
    if (y < 0 || y >= height) continue;
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 3;
      const lum = rgb[p]! * 0.299 + rgb[p + 1]! * 0.587 + rgb[p + 2]! * 0.114;
      if (lum < 210) {
        if (left < 0) left = x;
        right = x;
      }
    }
    if (left >= 0 && right > left + width * 0.2) {
      samples.push({ x: left, y });
      samples.push({ x: right, y });
    }
  }

  if (samples.length < 4) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (const s of samples) {
    sumX += s.x;
    sumY += s.y;
    sumXX += s.x * s.x;
    sumXY += s.x * s.y;
  }
  const n = samples.length;
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-6) return 0;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const angleRad = Math.atan(slope);
  const angleDeg = (angleRad * 180) / Math.PI;
  return angleDeg;
}

async function applyFineAlignment(
  rgb: Buffer,
  width: number,
  height: number
): Promise<{ buffer: Buffer; width: number; height: number; applied: boolean; angle: number }> {
  const angle = estimateResidualSkewDegrees(rgb, width, height);
  if (Math.abs(angle) <= 0.05 || Math.abs(angle) >= 2) {
    return { buffer: rgb, width, height, applied: false, angle };
  }

  const rotated = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .rotate(-angle, { background: { r: 252, g: 252, b: 252 } })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: rotated.data,
    width: rotated.info.width,
    height: rotated.info.height,
    applied: true,
    angle,
  };
}

async function applyFaithfulEnhancement(
  rgb: Buffer,
  width: number,
  height: number,
  options: {
    enhanceText: boolean;
    sharpen: boolean;
    jpegQuality: number;
    margin: number;
    softenSigma?: number;
  }
): Promise<{ buffer: Buffer; width: number; height: number }> {
  let pipeline = sharp(rgb, { raw: { width, height, channels: 3 } });

  if (options.enhanceText) {
    // Clareamento leve do papel + contraste moderado (sem binarização).
    pipeline = pipeline
      .linear(1.08, -(255 * 0.05))
      .gamma(1.05)
      .modulate({ brightness: 1.04, saturation: 1.02 });
  }

  if (options.sharpen) {
    pipeline = pipeline.sharpen({ sigma: 0.7, m1: 0.8, m2: 1.2 });
  }

  if ((options.softenSigma ?? 0) > 0) {
    pipeline = pipeline.blur(options.softenSigma);
  }

  const buffer = await pipeline
    .extend({
      top: options.margin,
      bottom: options.margin,
      left: options.margin,
      right: options.margin,
      background: { r: MARGIN_FILL, g: MARGIN_FILL, b: MARGIN_FILL },
    })
    .jpeg({ quality: options.jpegQuality, mozjpeg: true })
    .toBuffer();

  return {
    buffer,
    width: width + options.margin * 2,
    height: height + options.margin * 2,
  };
}

async function createThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: 'none' })
    .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}

export class FaithfulDocumentScanError extends Error {
  constructor(
    message: string,
    readonly code: 'missing_corners' | 'invalid_corners' | 'warp_failed'
  ) {
    super(message);
    this.name = 'FaithfulDocumentScanError';
  }
}

/**
 * Scan fiel de documento técnico: warp perspectivo + iluminação + realce leve.
 * 100% determinístico — nunca usa IA generativa de imagem.
 */
export async function processFaithfulDocumentScan(
  input: FaithfulDocumentScanInput
): Promise<FaithfulDocumentScanOutput> {
  const startedAt = Date.now();
  const documentRatio = input.documentRatio ?? 'A1_PORTRAIT';
  const maxDimension = input.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const jpegQuality = input.jpegQuality ?? DEFAULT_JPEG_QUALITY;
  const marginRatio = input.marginRatio ?? DEFAULT_MARGIN_RATIO;
  const enhanceText = input.enhanceText ?? true;
  const reduceShadows = input.reduceShadows ?? true;
  const sharpen = input.sharpen ?? true;
  const softenSigma = input.softenSigma ?? 0;
  const autoDetect = input.autoDetectCorners ?? true;
  const enableFineAlignment = input.enableFineAlignment ?? true;
  const enableMeshDewarp = input.enableMeshDewarp ?? false;

  let cornerSource: FaithfulDocumentScanOutput['cornerSource'] = 'provided';
  let corners: DocumentImagePoint[];

  if (input.corners) {
    corners = orderDocumentCorners(cornersPayloadToArray(input.corners));
    cornerSource = 'manual';
  } else if (autoDetect) {
    const detection = await detectDocumentQuad(input.imageBuffer);
    if (!detection || detection.corners.length !== 4) {
      throw new FaithfulDocumentScanError(
        'Não foi possível detectar a folha com segurança. Marque os quatro cantos manualmente.',
        'missing_corners'
      );
    }
    corners = orderDocumentCorners(detection.corners);
    cornerSource = 'native-detect';
  } else {
    throw new FaithfulDocumentScanError(
      'Cantos da folha são obrigatórios quando autoDetectCorners=false.',
      'missing_corners'
    );
  }

  if (corners.length !== 4 || corners.some((c) => !Number.isFinite(c.x) || !Number.isFinite(c.y))) {
    throw new FaithfulDocumentScanError(
      'Cantos inválidos para correção de perspectiva.',
      'invalid_corners'
    );
  }

  // Dewarping por malha quando o papel está curvado o suficiente; caso contrário
  // (ou se não há bordas confiáveis) cai no warp planar de 4 cantos.
  let meshDewarpApplied = false;
  let meshDewarpBow: number | undefined;
  let warpBuffer: Buffer | undefined;
  let warpW = 0;
  let warpH = 0;
  const warpStart = Date.now();

  if (enableMeshDewarp) {
    try {
      const dewarped = await dewarpDocument(input.imageBuffer, corners, {
        maxDimension,
        returnRaw: true,
        minEdgeCoverage: 0.75,
        minBowRatio: 0.015,
        manualEdgeMidpoints: input.edgeMidpoints,
      });
      if (dewarped) {
        warpBuffer = dewarped.buffer;
        warpW = dewarped.width;
        warpH = dewarped.height;
        meshDewarpApplied = true;
        meshDewarpBow = dewarped.maxEdgeBow;
      }
    } catch {
      // Fallback para warp planar.
    }
  }

  if (!warpBuffer) {
    try {
      const warpResult = await warpPerspectiveRaw(input.imageBuffer, corners, {
        maxDimension,
        documentRatio,
      });
      warpBuffer = warpResult.buffer;
      warpW = warpResult.width;
      warpH = warpResult.height;
    } catch (error) {
      throw new FaithfulDocumentScanError(
        error instanceof Error ? error.message : 'Falha no warp perspectivo.',
        'warp_failed'
      );
    }
  }

  const warpMs = Date.now() - warpStart;
  const illumStart = Date.now();
  let working = warpBuffer;
  let workW = warpW;
  let workH = warpH;

  const alignStart = Date.now();
  const aligned = enableFineAlignment
    ? await applyFineAlignment(working, workW, workH)
    : { buffer: working, width: workW, height: workH, applied: false, angle: 0 };
  working = aligned.buffer;
  workW = aligned.width;
  workH = aligned.height;
  const alignmentMs = Date.now() - alignStart;

  const illuminated = correctIlluminationLab(working, workW, workH, reduceShadows);
  const illuminationMs = Date.now() - illumStart - alignmentMs;

  const margin = Math.max(6, Math.round(Math.min(workW, workH) * marginRatio));
  const enhanceStart = Date.now();
  const enhanced = await applyFaithfulEnhancement(illuminated, workW, workH, {
    enhanceText,
    sharpen,
    jpegQuality,
    margin,
    softenSigma,
  });
  const enhanceMs = Date.now() - enhanceStart;

  const thumbnailBuffer = await createThumbnail(enhanced.buffer);

  return {
    imageBuffer: enhanced.buffer,
    thumbnailBuffer,
    mimeType: 'image/jpeg',
    width: enhanced.width,
    height: enhanced.height,
    cornersUsed: corners,
    processingMode: 'faithful-scan',
    usedGenerativeAI: false,
    perspectiveCorrected: true,
    contentPreservationMode: true,
    cornerSource,
    documentRatio,
    meshDewarpApplied,
    meshDewarpBow: meshDewarpApplied ? Number((meshDewarpBow ?? 0).toFixed(1)) : undefined,
    timingMs: {
      warpMs,
      alignmentMs,
      illuminationMs,
      enhanceMs,
      totalMs: Date.now() - startedAt,
    },
    alignmentApplied: aligned.applied,
    alignmentAngleDeg: aligned.applied ? Number(aligned.angle.toFixed(3)) : undefined,
  };
}

export { toCornersPayload, orderDocumentCorners };
