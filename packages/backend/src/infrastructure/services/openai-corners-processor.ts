import sharp from 'sharp';
import { sanitizeDocumentCorners, type DocumentImagePoint } from './document-image-processor.js';
import {
  applyPerspectiveFromCornersFast,
  FastWarpFailedError,
  FastWarpTimeoutError,
  type AIWarpMetadata,
} from './ai-corners-fast-warp.js';
import { getMapImageAiWarpTimeoutConfig } from '../config/map-image-ai-warp-timeout-config.js';
import { detectDocumentQuad, refineDocumentCorners } from './node-document-detect.js';
import { orderDocumentCorners } from './node-perspective-warp.js';
import type {
  OpenAICornersPayload,
  OpenAIImageAnalysis,
  OpenAIImageMetadata,
} from './openai-image-processor.js';
import type { OpenAIImageConfig } from '../config/openai-image-config.js';
import {
  mapAICornersRejectionToFailureReason,
  type MapProcessingFailureReason,
} from './map-image-processing-reasons.js';

export type AICornersRejectionReason =
  | MapProcessingFailureReason
  | 'missing_corners'
  | 'corners_out_of_bounds'
  | 'invalid_geometry'
  | 'inner_content_detected'
  | 'low_confidence'
  | 'auto_crop_not_recommended'
  | 'document_not_detected';

export type { OpenAICornersPayload } from './openai-image-processor.js';
export {
  cornersPayloadToPoints,
  parseCornersPayload,
  pointsToCornersPayload,
} from './openai-corners-utils.js';

export interface AICornersMetadata {
  source: 'openai';
  /** @deprecated use warpSuccess */
  applied: boolean;
  detected?: boolean;
  valid?: boolean;
  appliedToWarp?: boolean;
  warpSuccess?: boolean;
  warpError?: string;
  warpTimeout?: boolean;
  confidence?: number;
  imageSizeSent?: { width: number; height: number };
  originalImageSize?: { width: number; height: number };
  cornersSentImage?: OpenAICornersPayload;
  cornersOriginalImage?: DocumentImagePoint[];
  geometryValid?: boolean;
  rejectionReason?: AICornersRejectionReason;
}

export type ProcessingFailureStage =
  | 'openai_detection'
  | 'corner_validation'
  | 'ai_warp'
  | 'local_pipeline'
  | 'sharp_fallback';

export type ProcessingOrigin =
  | 'openai-corners-fast-warp'
  | 'openai-corners-warp-failed'
  | 'openai-corners'
  | 'local'
  | 'manual'
  | 'fallback';

export type { AIWarpMetadata };

export interface OpenAICornersEvaluation {
  shouldApply: boolean;
  geometryValid: boolean;
  rejectionReason?: AICornersRejectionReason;
  cornersSentImage?: OpenAICornersPayload;
  cornersOriginalImage?: DocumentImagePoint[];
  imageSizeSent?: { width: number; height: number };
}

export interface AppliedOpenAICornersResult {
  processedBase64: string;
  thumbnailBase64?: string;
  tamanhoBytes: number;
  confiancaDeteccao: number;
  fallbackUsado: boolean;
  dimensoesFinais: { width: number; height: number };
  processador: 'openai-corners-fast-warp';
  metadata: Record<string, unknown>;
}

export function scaleCornersToOriginal(
  corners: DocumentImagePoint[],
  sentWidth: number,
  sentHeight: number,
  originalWidth: number,
  originalHeight: number
): DocumentImagePoint[] {
  if (sentWidth <= 0 || sentHeight <= 0 || originalWidth <= 0 || originalHeight <= 0) {
    return corners;
  }
  const scaleX = originalWidth / sentWidth;
  const scaleY = originalHeight / sentHeight;
  return corners.map((corner) => ({
    x: Number((corner.x * scaleX).toFixed(2)),
    y: Number((corner.y * scaleY).toFixed(2)),
  }));
}

function polygonArea(points: DocumentImagePoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function cornersAreaRatio(points: DocumentImagePoint[], width: number, height: number): number {
  if (width <= 0 || height <= 0 || points.length !== 4) {
    return 0;
  }
  return polygonArea(points) / Math.max(1, width * height);
}

/** Cantos colados na borda da foto (cena inteira) em vez da folha física. */
export function cornersHugImageFrame(
  points: DocumentImagePoint[],
  width: number,
  height: number,
  borderRatio = 0.03
): boolean {
  if (points.length !== 4 || width <= 0 || height <= 0) return false;
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const borderX = width * borderRatio;
  const borderY = height * borderRatio;
  return minX <= borderX && minY <= borderY && maxX >= width - borderX && maxY >= height - borderY;
}

export function angularSkew(points: DocumentImagePoint[]): number {
  const bySumAsc = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = bySumAsc[0]!;
  const br = bySumAsc[3]!;
  const rem = [bySumAsc[1]!, bySumAsc[2]!];
  const tr = rem.reduce((a, b) => (a.x - a.y > b.x - b.y ? a : b));
  const bl = rem.find((p) => p !== tr)!;
  const W = Math.hypot(tr.x - tl.x, tr.y - tl.y) || 1;
  const H = Math.hypot(bl.x - tl.x, bl.y - tl.y) || 1;
  return (
    Math.abs(tr.y - tl.y) / W +
    Math.abs(br.y - bl.y) / W +
    Math.abs(bl.x - tl.x) / H +
    Math.abs(br.x - tr.x) / H +
    Math.abs(tr.x - tl.x - (br.x - bl.x)) / W
  );
}

function deflateCornersToTargetArea(
  points: DocumentImagePoint[],
  width: number,
  height: number,
  targetAreaRatio = 0.68
): DocumentImagePoint[] {
  if (points.length !== 4 || width <= 0 || height <= 0) return points;
  let current = points.map((p) => ({ x: p.x, y: p.y }));
  let area = cornersAreaRatio(current, width, height);
  if (area <= targetAreaRatio) return current;

  const cx = current.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = current.reduce((sum, p) => sum + p.y, 0) / 4;

  for (let step = 0; step < 48 && area > targetAreaRatio; step += 1) {
    current = current.map((p) => ({
      x: cx + (p.x - cx) * 0.985,
      y: cy + (p.y - cy) * 0.985,
    }));
    area = cornersAreaRatio(current, width, height);
  }
  return current;
}

export function selectWarpCorners(
  aiCorners: DocumentImagePoint[],
  nativeDetection: Awaited<ReturnType<typeof detectDocumentQuad>>,
  imgW: number,
  imgH: number
): { corners: DocumentImagePoint[]; source: 'native-detect' | 'openai' } {
  const aiArea = cornersAreaRatio(aiCorners, imgW, imgH);
  const aiSkew = angularSkew(aiCorners);
  const aiHugsFrame = cornersHugImageFrame(aiCorners, imgW, imgH) || aiArea > 0.78;
  const aiLooksReliable = !aiHugsFrame && aiArea >= 0.52 && aiArea <= 0.76 && aiSkew >= 0.12;

  if (aiLooksReliable) {
    return { corners: aiCorners, source: 'openai' };
  }

  if (aiHugsFrame) {
    const deflated = deflateCornersToTargetArea(aiCorners, imgW, imgH, 0.66);
    const deflatedArea = cornersAreaRatio(deflated, imgW, imgH);
    const deflatedSkew = angularSkew(deflated);
    if (deflatedArea >= 0.48 && deflatedArea <= 0.76 && deflatedSkew >= 0.1) {
      return { corners: deflated, source: 'openai' };
    }
  }

  if (!nativeDetection || nativeDetection.corners.length !== 4) {
    return { corners: aiCorners, source: 'openai' };
  }

  const nativeCorners = nativeDetection.corners;
  const nativeArea = cornersAreaRatio(nativeCorners, imgW, imgH);
  const nativeValidArea = nativeArea >= 0.15 && nativeArea <= 0.88;

  if (nativeValidArea) {
    const nativeSkew = angularSkew(nativeCorners);
    if (nativeSkew > aiSkew * 1.05) {
      return { corners: nativeCorners, source: 'native-detect' };
    }
  }

  return { corners: aiCorners, source: 'openai' };
}

/**
 * A IA tende a marcar cantos ligeiramente dentro da folha (cortando o mapa).
 * Expande para fora nas bordas direita/inferior/superior, sem puxar a esquerda
 * (sombra da mesa costuma estar nesse lado).
 */
export function expandDocumentCornersForWarp(
  points: DocumentImagePoint[],
  imgW: number,
  imgH: number
): DocumentImagePoint[] {
  if (points.length !== 4 || imgW <= 0 || imgH <= 0) return points;
  const margin = Math.max(16, Math.round(Math.min(imgW, imgH) * 0.02));
  const ordered = orderDocumentCorners(points);
  const tl = ordered[0]!;
  const tr = ordered[1]!;
  const br = ordered[2]!;
  const bl = ordered[3]!;
  return [
    { x: tl.x, y: Math.max(0, tl.y - margin * 0.4) },
    { x: Math.min(imgW, tr.x + margin), y: Math.max(0, tr.y - margin * 0.4) },
    { x: Math.min(imgW, br.x + margin), y: Math.min(imgH, br.y + margin) },
    { x: bl.x, y: Math.min(imgH, bl.y + margin) },
  ];
}

function normalizeRejectionReason(
  rejectionReason: AICornersRejectionReason | undefined
): MapProcessingFailureReason | undefined {
  if (!rejectionReason) return undefined;
  return (
    mapAICornersRejectionToFailureReason(rejectionReason) ??
    (rejectionReason as MapProcessingFailureReason)
  );
}

function cornersWithinImage(width: number, height: number, points: DocumentImagePoint[]): boolean {
  return points.every(
    (point) =>
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= width &&
      point.y <= height &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y)
  );
}

export function shouldApplyAutoCrop(
  analysis: OpenAIImageAnalysis,
  config: OpenAIImageConfig
): boolean {
  if (!config.autoCropEnabled) return false;
  if (!analysis.documentDetected) return false;
  if (!analysis.corners) return false;
  if (analysis.confidence < config.minCornerConfidence) return false;
  if (
    analysis.recommendedAction === 'retake' ||
    analysis.recommendedAction === 'manual_adjust' ||
    analysis.recommendedAction === 'use_original'
  ) {
    return false;
  }
  if (analysis.problems.includes('cropped') || analysis.problems.includes('partial_document')) {
    return false;
  }
  // Bloqueia 'inner_content_only' apenas quando a IA não recomendou crop
  // explicitamente. Se a IA disse 'auto_crop' com confiança suficiente, o
  // problema é informativo (mapa colorido no centro) e não deve bloquear.
  if (
    analysis.problems.includes('inner_content_only') &&
    analysis.recommendedAction !== 'auto_crop' &&
    analysis.recommendedAction !== 'ai_correct'
  ) {
    return false;
  }
  return (
    analysis.recommendedAction === 'auto_crop' ||
    analysis.recommendedAction === 'ai_correct' ||
    analysis.recommendedAction === 'local_correct' ||
    analysis.recommendedAction === 'use'
  );
}

export function evaluateOpenAICorners(
  analysis: OpenAIImageAnalysis,
  config: OpenAIImageConfig,
  sentWidth: number,
  sentHeight: number,
  originalWidth: number,
  originalHeight: number,
  cornerPoints: DocumentImagePoint[]
): OpenAICornersEvaluation {
  const base: OpenAICornersEvaluation = {
    shouldApply: false,
    geometryValid: false,
    cornersSentImage: analysis.corners,
    imageSizeSent: { width: sentWidth, height: sentHeight },
  };

  if (!analysis.corners) {
    return { ...base, rejectionReason: 'missing_corners' };
  }

  if (!cornersWithinImage(sentWidth, sentHeight, cornerPoints)) {
    return { ...base, rejectionReason: 'corners_out_of_bounds' };
  }

  const sentAreaRatio = cornersAreaRatio(cornerPoints, sentWidth, sentHeight);
  if (sentAreaRatio > 0 && sentAreaRatio < config.minDocumentAreaRatio) {
    return {
      ...base,
      geometryValid: false,
      rejectionReason: 'inner_content_detected',
    };
  }

  const scaledCorners = scaleCornersToOriginal(
    cornerPoints,
    sentWidth,
    sentHeight,
    originalWidth,
    originalHeight
  );
  const validated = sanitizeDocumentCorners(scaledCorners, originalWidth, originalHeight);
  base.geometryValid = Boolean(validated);
  base.cornersOriginalImage = validated ?? scaledCorners;

  if (!validated) {
    return { ...base, rejectionReason: 'invalid_geometry' };
  }

  const originalAreaRatio = cornersAreaRatio(validated, originalWidth, originalHeight);
  if (originalAreaRatio > 0 && originalAreaRatio < config.minDocumentAreaRatio) {
    return {
      ...base,
      geometryValid: false,
      rejectionReason: 'inner_content_detected',
    };
  }

  if (!shouldApplyAutoCrop(analysis, config)) {
    return {
      ...base,
      rejectionReason:
        analysis.confidence < config.minCornerConfidence
          ? 'low_confidence'
          : analysis.documentDetected
            ? 'auto_crop_not_recommended'
            : 'document_not_detected',
    };
  }

  return {
    ...base,
    shouldApply: true,
    cornersOriginalImage: validated,
  };
}

export function resolveAICornersFailureReason(
  rejectionReason: AICornersRejectionReason | undefined
): MapProcessingFailureReason | undefined {
  return normalizeRejectionReason(rejectionReason);
}

export function buildAICornersMetadataBase(
  evaluation: OpenAICornersEvaluation,
  confidence: number
): AICornersMetadata {
  return {
    source: 'openai',
    applied: false,
    detected: evaluation.shouldApply,
    valid: evaluation.geometryValid,
    appliedToWarp: false,
    warpSuccess: false,
    confidence,
    imageSizeSent: evaluation.imageSizeSent,
    originalImageSize: undefined,
    cornersSentImage: evaluation.cornersSentImage,
    cornersOriginalImage: evaluation.cornersOriginalImage,
    geometryValid: evaluation.geometryValid,
    rejectionReason: evaluation.rejectionReason,
  };
}

export async function applyOpenAICornersFastWarp(
  imageBuffer: Buffer,
  mimeType: string,
  corners: DocumentImagePoint[],
  openaiMetadata: OpenAIImageMetadata,
  aiCornersMetadata: AICornersMetadata,
  options?: { quality?: number; timeoutMs?: number }
): Promise<AppliedOpenAICornersResult> {
  const originalMeta = await sharp(imageBuffer, { failOn: 'none' }).metadata();
  const warpStartedAt = Date.now();

  let cornerSource: 'native-detect' | 'openai' | 'refined' = 'openai';
  let cornersToUse = corners;
  let detection: Awaited<ReturnType<typeof detectDocumentQuad>> = null;
  try {
    detection = await detectDocumentQuad(imageBuffer);
  } catch {
    detection = null;
  }

  const imgW = originalMeta.width ?? 0;
  const imgH = originalMeta.height ?? 0;
  if (detection && imgW > 0 && imgH > 0) {
    const selected = selectWarpCorners(corners, detection, imgW, imgH);
    cornersToUse = selected.corners;
    cornerSource = selected.source;
  }

  // Encaixe nas bordas físicas reais a partir da estimativa (IA/native).
  // Refino só substitui quando ao menos metade das arestas foi confirmada.
  let refinedCoverage: number | undefined;
  if (imgW > 0 && imgH > 0) {
    try {
      const refined = await refineDocumentCorners(imageBuffer, cornersToUse);
      if (refined && refined.edgeCoverage >= 0.5) {
        cornersToUse = refined.corners;
        cornerSource = 'refined';
        refinedCoverage = refined.edgeCoverage;
      }
    } catch {
      // Mantém cantos da seleção anterior.
    }
  }

  // Sem refino confiável, adiciona margem de segurança para não cortar conteúdo.
  if (imgW > 0 && imgH > 0 && cornerSource !== 'refined') {
    cornersToUse = expandDocumentCornersForWarp(cornersToUse, imgW, imgH);
  }

  const warpResult = await applyPerspectiveFromCornersFast(imageBuffer, mimeType, cornersToUse, {
    quality: options?.quality ?? 92,
    timeoutMs: options?.timeoutMs ?? getMapImageAiWarpTimeoutConfig().aiWarpTimeoutMs,
  });

  const successMetadata: AICornersMetadata = {
    ...aiCornersMetadata,
    applied: true,
    detected: true,
    valid: true,
    appliedToWarp: true,
    warpSuccess: true,
    warpTimeout: false,
    cornersOriginalImage: cornersToUse,
    originalImageSize: {
      width: originalMeta.width ?? 0,
      height: originalMeta.height ?? 0,
    },
  };

  return {
    processedBase64: `data:${warpResult.mimeType};base64,${warpResult.processedBuffer.toString('base64')}`,
    thumbnailBase64: `data:image/jpeg;base64,${warpResult.thumbnailBuffer.toString('base64')}`,
    tamanhoBytes: warpResult.processedBuffer.length,
    confiancaDeteccao: Math.max(warpResult.confidence, openaiMetadata.confidence ?? 0),
    fallbackUsado: false,
    dimensoesFinais: {
      width: warpResult.width,
      height: warpResult.height,
    },
    processador: 'openai-corners-fast-warp',
    metadata: {
      originalWidth: originalMeta.width,
      originalHeight: originalMeta.height,
      documentClass: 'map_document',
      decision: 'python_detected',
      postprocess: {
        manualMode: 'faithful-document',
        cornersSource: cornerSource,
        manualCornersReceived: false,
        pythonUsed: false,
        manualFinalizeUsed: false,
        borderCleanup: false,
        isolateExterior: false,
        marginMode: 'clean-white',
        paperNormalization: 'faithful-scan',
        shadowBalance: true,
        onlyWarpAndMargin: false,
        contentPreserved: true,
      },
      corners: cornersToUse,
      faithfulScan: {
        processingMode: 'faithful-scan',
        usedGenerativeAI: false,
        perspectiveCorrected: true,
        contentPreservationMode: true,
        documentRatio: warpResult.faithfulScan.documentRatio,
      },
      warnings: [],
      openai: openaiMetadata,
      aiCorners: successMetadata,
      aiWarp: warpResult.aiWarp,
      documentDetection: detection
        ? {
            used: cornerSource === 'native-detect',
            areaRatio: Number(detection.areaRatio.toFixed(3)),
            rectangularity: Number(detection.rectangularity.toFixed(3)),
            threshold: detection.threshold,
          }
        : { used: false },
      cornerRefinement: {
        applied: cornerSource === 'refined',
        edgeCoverage: refinedCoverage ?? 0,
      },
      processing: {
        origin: 'openai-corners-fast-warp',
        engine: 'openai-corners-fast-warp',
        cornerSource,
        manualReviewRecommended: false,
      },
      processingTiming: {
        aiWarpMs: warpResult.aiWarp.durationMs ?? warpResult.warpMs,
        localProcessorMs: Date.now() - warpStartedAt,
        pythonStartupMs: warpResult.aiWarp.pythonStartupMs,
        cv2ImportMs: warpResult.aiWarp.cv2ImportMs,
        warpStageMs: warpResult.aiWarp.warpMs,
        outputMs: warpResult.aiWarp.outputMs,
      },
    },
  };
}

/** @deprecated use applyOpenAICornersFastWarp */
export async function applyOpenAICornersToDocument(
  imageBuffer: Buffer,
  mimeType: string,
  corners: DocumentImagePoint[],
  openaiMetadata: OpenAIImageMetadata,
  aiCornersMetadata: AICornersMetadata
): Promise<AppliedOpenAICornersResult | null> {
  try {
    return await applyOpenAICornersFastWarp(
      imageBuffer,
      mimeType,
      corners,
      openaiMetadata,
      aiCornersMetadata
    );
  } catch (error) {
    if (error instanceof FastWarpTimeoutError || error instanceof FastWarpFailedError) {
      return null;
    }
    throw error;
  }
}

export { FastWarpFailedError, FastWarpTimeoutError };
