import sharp from 'sharp';
import { isFaithfulScanMode } from '../config/map-image-faithful-scan-config.js';
import {
  tryProcessDocumentImageWithPython,
  type PythonProcessorCornersInput,
} from './document-image-python-processor.js';
import { processFaithfulDocumentScan } from './faithful-document-scan.js';
import { detectDocumentQuad, refineDocumentCorners } from './node-document-detect.js';

export type DocumentProcessingMode = 'color_document' | 'map_document' | 'text_document';
export type DocumentClassificationKind =
  | 'map_document'
  | 'color_document'
  | 'text_document'
  | 'low_confidence_capture';
export type DocumentProcessingDecision =
  | 'frontend_assisted'
  | 'python_detected'
  | 'backend_manual_corners'
  | 'backend_detected_corners'
  | 'safe_fallback'
  | 'manual_review_recommended';

export interface DocumentImagePoint {
  x: number;
  y: number;
}

export interface ProcessDocumentImageInput {
  imageBuffer: Buffer;
  mimeType: string;
  manualCorners?: DocumentImagePoint[];
  detectedCorners?: DocumentImagePoint[];
  assistedImageBuffer?: Buffer;
  assistedMimeType?: string;
  options?: {
    processingMode?: DocumentProcessingMode;
    preserveColors?: boolean;
    outputFormat?: 'jpeg' | 'png' | 'webp';
    quality?: number;
  };
}

export interface ProcessDocumentImageResult {
  success: boolean;
  processedBuffer: Buffer;
  thumbnailBuffer?: Buffer;
  outputMimeType: string;
  metadata: {
    engine: string;
    confidence: number;
    fallback: boolean;
    width: number;
    height: number;
    originalWidth?: number;
    originalHeight?: number;
    documentClass?: DocumentClassificationKind;
    decision?: DocumentProcessingDecision;
    analysis?: {
      paperLikeRatio: number;
      colorRatio: number;
      edgeDensity: number;
      dynamicRange: number;
      fillFrameLikelihood: number;
    };
    postprocess?: {
      manualMode?: string | null;
      cornersSource: string;
      manualCornersReceived: boolean;
      pythonUsed: boolean;
      manualFinalizeUsed: boolean;
      borderCleanup: boolean;
      isolateExterior: boolean;
      marginMode: string;
      paperNormalization: string | boolean;
      shadowBalance: boolean;
      onlyWarpAndMargin?: boolean;
      contentPreserved: boolean;
    };
    corners?: DocumentImagePoint[];
    warnings?: string[];
    faithfulScan?: {
      processingMode: 'faithful-scan';
      usedGenerativeAI: false;
      perspectiveCorrected: boolean;
      contentPreservationMode: boolean;
      documentRatio?: string;
      alignmentApplied?: boolean;
      alignmentAngleDeg?: number;
    };
  };
}

const MAX_OUTPUT_DIMENSION = 2600;
const MAX_THUMB_DIMENSION = 320;
const ANALYSIS_SIZE = 256;

interface DocumentImageAnalysis {
  kind: DocumentClassificationKind;
  paperLikeRatio: number;
  colorRatio: number;
  edgeDensity: number;
  dynamicRange: number;
  fillFrameLikelihood: number;
}

function isSupportedMimeType(mimeType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType);
}

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

function mimeTypeFromFormat(format: 'jpeg' | 'png' | 'webp'): string {
  switch (format) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

function encodeDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export function decodeImageDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  const mimeType = match?.[1];
  const payload = match?.[2];
  if (!mimeType || !payload) {
    throw new Error('Imagem inválida. Envie JPEG, PNG ou WEBP em data URI base64.');
  }

  return {
    mimeType,
    buffer: Buffer.from(payload.replace(/\s+/g, ''), 'base64'),
  };
}

async function analyzeImageBuffer(imageBuffer: Buffer): Promise<DocumentImageAnalysis> {
  const { data, info } = await sharp(imageBuffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: ANALYSIS_SIZE,
      height: ANALYSIS_SIZE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const total = Math.max(1, width * height);
  const border = Math.max(2, Math.round(Math.min(width, height) * 0.08));

  let paperLike = 0;
  let strongColor = 0;
  let lowTexturePaper = 0;
  let edgeHits = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let borderPaper = 0;
  let borderPixels = 0;

  const lumaAt = (x: number, y: number): number => {
    const idx = (y * width + x) * channels;
    const r = data[idx] ?? 0;
    const g = data[idx + 1] ?? 0;
    const b = data[idx + 2] ?? 0;
    return r * 0.299 + g * 0.587 + b * 0.114;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);

      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);

      const isPaperLike = luma > 150 && chroma < 36;
      if (isPaperLike) {
        paperLike++;
      }
      if (chroma > 46 && luma > 35 && luma < 235) {
        strongColor++;
      }

      if (x > 0 && y > 0) {
        const diff = Math.abs(luma - lumaAt(x - 1, y)) + Math.abs(luma - lumaAt(x, y - 1));
        if (diff > 52) {
          edgeHits++;
        }
        if (isPaperLike && diff < 20) {
          lowTexturePaper++;
        }
      }

      const onBorder = x < border || y < border || x >= width - border || y >= height - border;
      if (onBorder) {
        borderPixels++;
        if (isPaperLike) {
          borderPaper++;
        }
      }
    }
  }

  const paperLikeRatio = paperLike / total;
  const colorRatio = strongColor / total;
  const edgeDensity = edgeHits / total;
  const dynamicRange = (maxLuma - minLuma) / 255;
  const fillFrameLikelihood = borderPixels > 0 ? borderPaper / borderPixels : 0;
  const smoothPaperRatio = lowTexturePaper / total;

  let kind: DocumentClassificationKind;
  if (paperLikeRatio < 0.12 || dynamicRange < 0.16) {
    kind = 'low_confidence_capture';
  } else if (colorRatio > 0.18) {
    kind = 'map_document';
  } else if (colorRatio > 0.06 || smoothPaperRatio < 0.08) {
    kind = 'color_document';
  } else {
    kind = 'text_document';
  }

  if (fillFrameLikelihood > 0.72 && colorRatio < 0.08 && paperLikeRatio < 0.22) {
    kind = 'low_confidence_capture';
  }

  return {
    kind,
    paperLikeRatio,
    colorRatio,
    edgeDensity,
    dynamicRange,
    fillFrameLikelihood,
  };
}

function decideProcessingMode(
  requestedMode: DocumentProcessingMode | undefined,
  analysis: DocumentImageAnalysis
): DocumentProcessingMode {
  if (requestedMode) {
    return requestedMode;
  }
  if (analysis.kind === 'text_document') {
    return 'text_document';
  }
  return 'color_document';
}

function buildWarnings(
  analysis: DocumentImageAnalysis,
  manualCorners?: DocumentImagePoint[],
  detectedCorners?: DocumentImagePoint[],
  assistedImageBuffer?: Buffer
): string[] {
  const warnings: string[] = [];
  if (analysis.kind === 'low_confidence_capture') {
    warnings.push(
      'Captura com baixa confiança geométrica; revise o enquadramento ou ajuste as bordas.'
    );
  }
  if (
    analysis.fillFrameLikelihood > 0.78 &&
    !assistedImageBuffer &&
    !manualCorners?.length &&
    !detectedCorners?.length
  ) {
    warnings.push(
      'A folha ocupa quase todo o quadro; a detecção automática pode confundir papel e fundo.'
    );
  }
  if (analysis.paperLikeRatio < 0.18 && !assistedImageBuffer && !detectedCorners?.length) {
    warnings.push(
      'Pouca área de papel isolada na imagem original; o sistema deve preferir revisão manual.'
    );
  }
  return warnings;
}

function polygonArea(points: DocumentImagePoint[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

export function sanitizeDocumentCorners(
  corners: DocumentImagePoint[] | undefined,
  originalWidth: number,
  originalHeight: number
): DocumentImagePoint[] | undefined {
  if (!corners || corners.length !== 4 || originalWidth <= 0 || originalHeight <= 0) {
    return undefined;
  }

  const normalized = corners.map((corner) => ({
    x: Number(corner.x),
    y: Number(corner.y),
  }));

  if (
    normalized.some(
      (corner) =>
        !Number.isFinite(corner.x) ||
        !Number.isFinite(corner.y) ||
        corner.x < 0 ||
        corner.y < 0 ||
        corner.x > originalWidth ||
        corner.y > originalHeight
    )
  ) {
    return undefined;
  }

  const areaRatio = polygonArea(normalized) / Math.max(1, originalWidth * originalHeight);
  if (areaRatio < 0.1 || areaRatio > 0.98) {
    return undefined;
  }

  return normalized;
}

function expandCornersFromCentroid(
  corners: DocumentImagePoint[],
  width: number,
  height: number,
  ratio: number
): DocumentImagePoint[] {
  const cx = corners.reduce((sum, point) => sum + point.x, 0) / corners.length;
  const cy = corners.reduce((sum, point) => sum + point.y, 0) / corners.length;
  return corners.map((point) => ({
    x: Math.max(0, Math.min(width, cx + (point.x - cx) * (1 + ratio))),
    y: Math.max(0, Math.min(height, cy + (point.y - cy) * (1 + ratio))),
  }));
}

function angularSkewFromCorners(corners: DocumentImagePoint[]): number {
  const bySumAsc = [...corners].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = bySumAsc[0]!;
  const br = bySumAsc[3]!;
  const rem = [bySumAsc[1]!, bySumAsc[2]!];
  const tr = rem.reduce((a, b) => (a.x - a.y > b.x - b.y ? a : b));
  const bl = rem.find((point) => point !== tr)!;
  const width = Math.hypot(tr.x - tl.x, tr.y - tl.y) || 1;
  const height = Math.hypot(bl.x - tl.x, bl.y - tl.y) || 1;
  return (
    Math.abs(tr.y - tl.y) / width +
    Math.abs(br.y - bl.y) / width +
    Math.abs(bl.x - tl.x) / height +
    Math.abs(br.x - tr.x) / height +
    Math.abs(tr.x - tl.x - (br.x - bl.x)) / width
  );
}

function shiftCornersBySideOffsets(
  corners: DocumentImagePoint[],
  originalWidth: number,
  originalHeight: number,
  offsets: { top: number; right: number; bottom: number; left: number }
): DocumentImagePoint[] {
  const [tl, tr, br, bl] = corners.map((corner) => ({ ...corner })) as [
    DocumentImagePoint,
    DocumentImagePoint,
    DocumentImagePoint,
    DocumentImagePoint,
  ];
  tl.y += offsets.top;
  tr.y += offsets.top;
  bl.y += offsets.bottom;
  br.y += offsets.bottom;
  tl.x += offsets.left;
  bl.x += offsets.left;
  tr.x += offsets.right;
  br.x += offsets.right;

  return [tl, tr, br, bl].map((corner) => ({
    x: Math.max(0, Math.min(originalWidth, corner.x)),
    y: Math.max(0, Math.min(originalHeight, corner.y)),
  }));
}

function scoreNativeAutoCornersCandidate(
  corners: DocumentImagePoint[],
  originalWidth: number,
  originalHeight: number,
  processingMode: DocumentProcessingMode,
  edgeCoverage = 0
): number {
  const areaRatio = polygonArea(corners) / Math.max(1, originalWidth * originalHeight);
  const skew = angularSkewFromCorners(corners);
  const targetArea = processingMode === 'map_document' ? 0.69 : 0.58;
  const targetSkew = processingMode === 'map_document' ? 0.2 : 0.14;
  const borderTouches = corners.reduce((sum, corner) => {
    const nearBorder =
      corner.x < 8 || corner.y < 8 || corner.x > originalWidth - 8 || corner.y > originalHeight - 8;
    return sum + (nearBorder ? 1 : 0);
  }, 0);

  return (
    Math.min(areaRatio, targetArea) * 2.2 -
    Math.abs(areaRatio - targetArea) * 1.7 -
    Math.abs(skew - targetSkew) * 1.8 -
    Math.max(0, skew - 0.32) * 2.4 -
    borderTouches * 0.12 +
    edgeCoverage * 0.05
  );
}

async function selectBestNativeAutoCorners(
  imageBuffer: Buffer,
  baseCorners: DocumentImagePoint[],
  originalWidth: number,
  originalHeight: number,
  processingMode: DocumentProcessingMode
): Promise<DocumentImagePoint[]> {
  const baseAreaRatio = polygonArea(baseCorners) / Math.max(1, originalWidth * originalHeight);
  const isLargeFormatDocument =
    processingMode === 'map_document' || processingMode === 'color_document';
  const rawCandidates: DocumentImagePoint[][] = [baseCorners];

  if (isLargeFormatDocument && baseAreaRatio < 0.7) {
    for (const ratio of [0.04, 0.08, 0.1]) {
      rawCandidates.push(
        expandCornersFromCentroid(baseCorners, originalWidth, originalHeight, ratio)
      );
    }
  }

  if (processingMode === 'map_document' && baseAreaRatio < 0.66) {
    const topOffsets = [0, -originalHeight * 0.15];
    const leftOffsets = [0, -originalWidth * 0.155];
    const rightOffsets = [0, -originalWidth * 0.09];
    const bottomOffsets = [0, -originalHeight * 0.025];
    for (const top of topOffsets) {
      for (const left of leftOffsets) {
        for (const right of rightOffsets) {
          for (const bottom of bottomOffsets) {
            if (top === 0 && left === 0 && right === 0 && bottom === 0) continue;
            rawCandidates.push(
              shiftCornersBySideOffsets(baseCorners, originalWidth, originalHeight, {
                top,
                right,
                bottom,
                left,
              })
            );
          }
        }
      }
    }
  }

  const uniqueCandidates = rawCandidates.filter((candidate, index, all) => {
    const key = JSON.stringify(
      candidate.map((point) => [Math.round(point.x), Math.round(point.y)])
    );
    return (
      index ===
      all.findIndex((other) => {
        const otherKey = JSON.stringify(
          other.map((point) => [Math.round(point.x), Math.round(point.y)])
        );
        return otherKey === key;
      })
    );
  });

  const shortlisted = uniqueCandidates
    .map((candidate) => ({
      candidate,
      score: scoreNativeAutoCornersCandidate(
        candidate,
        originalWidth,
        originalHeight,
        processingMode
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, processingMode === 'map_document' ? 4 : 3);

  let bestCorners = baseCorners;
  let bestScore = scoreNativeAutoCornersCandidate(
    baseCorners,
    originalWidth,
    originalHeight,
    processingMode
  );

  for (const entry of shortlisted) {
    const refined = await refineDocumentCorners(imageBuffer, entry.candidate).catch(() => null);
    const candidate = refined?.corners ?? entry.candidate;
    const score = scoreNativeAutoCornersCandidate(
      candidate,
      originalWidth,
      originalHeight,
      processingMode,
      refined?.edgeCoverage ?? 0
    );
    if (score > bestScore) {
      bestCorners = candidate;
      bestScore = score;
    }
  }

  return bestCorners;
}

type ImageEnhancementMode = 'standard' | 'conservative';

async function finalizeOutput(
  buffer: Buffer,
  format: 'jpeg' | 'png' | 'webp',
  quality: number,
  preserveColors: boolean,
  processingMode: DocumentProcessingMode,
  enhancementMode: ImageEnhancementMode = 'standard'
): Promise<{ buffer: Buffer; width: number; height: number; mimeType: string }> {
  const image = sharp(buffer, { failOn: 'none' });
  const inputMetadata = await image.metadata();
  const width = inputMetadata.width ?? 0;
  const height = inputMetadata.height ?? 0;
  const inputFormat =
    inputMetadata.format === 'png' ? 'png' : inputMetadata.format === 'webp' ? 'webp' : 'jpeg';

  if (
    enhancementMode === 'conservative' &&
    width <= MAX_OUTPUT_DIMENSION &&
    height <= MAX_OUTPUT_DIMENSION &&
    format === inputFormat &&
    preserveColors
  ) {
    return {
      buffer,
      width,
      height,
      mimeType: mimeTypeFromFormat(format),
    };
  }

  let pipeline = image.rotate().resize({
    width: MAX_OUTPUT_DIMENSION,
    height: MAX_OUTPUT_DIMENSION,
    fit: 'inside',
    withoutEnlargement: true,
  });

  if (preserveColors) {
    pipeline = pipeline.toColourspace('srgb');
  }

  if (enhancementMode === 'conservative') {
    // Preserve the frontend-corrected image as faithfully as possible,
    // without introducing additional saturation, gamma or sharpening artifacts.
  } else if (processingMode === 'map_document' || processingMode === 'color_document') {
    pipeline = pipeline
      .gamma(1.02)
      .modulate({ brightness: 1.003, saturation: 1.004 })
      .sharpen({ sigma: 0.35, m1: 0.05, m2: 0.25 });
  } else {
    pipeline = pipeline
      .gamma(1.04)
      .modulate({ brightness: 1.01, saturation: 1 })
      .sharpen({ sigma: 0.5, m1: 0.08, m2: 0.4 });
  }

  if (format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 4, adaptiveFiltering: true });
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ quality, effort: 4 });
  } else {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  }

  const outputBuffer = await pipeline.toBuffer();
  const metadata = await sharp(outputBuffer).metadata();
  return {
    buffer: outputBuffer,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    mimeType: mimeTypeFromFormat(format),
  };
}

async function createThumbnail(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer, { failOn: 'none' })
    .resize({
      width: MAX_THUMB_DIMENSION,
      height: MAX_THUMB_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}

async function processWithSharpFallback(
  imageBuffer: Buffer,
  format: 'jpeg' | 'png' | 'webp',
  quality: number,
  processingMode: DocumentProcessingMode,
  warnings: string[]
): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
}> {
  let pipeline = sharp(imageBuffer, { failOn: 'none' }).rotate().resize({
    width: MAX_OUTPUT_DIMENSION,
    height: MAX_OUTPUT_DIMENSION,
    fit: 'inside',
    withoutEnlargement: true,
  });

  if (processingMode === 'map_document' || processingMode === 'color_document') {
    pipeline = pipeline.toColourspace('srgb').normalize();
  } else {
    pipeline = pipeline.normalize().gamma(1.03);
  }

  if (format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 4, adaptiveFiltering: true });
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ quality, effort: 4 });
  } else {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  }

  const outputBuffer = await pipeline.toBuffer();
  const metadata = await sharp(outputBuffer).metadata();
  warnings.push('Documento não corrigido com perspectiva completa; melhoria leve aplicada.');
  return {
    buffer: outputBuffer,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    mimeType: mimeTypeFromFormat(format),
  };
}

export async function processDocumentImage(
  input: ProcessDocumentImageInput
): Promise<ProcessDocumentImageResult> {
  const {
    imageBuffer,
    mimeType,
    manualCorners,
    detectedCorners,
    assistedImageBuffer,
    assistedMimeType,
    options,
  } = input;

  if (!isSupportedMimeType(mimeType)) {
    throw new Error('Tipo de imagem não suportado. Use JPEG, PNG ou WEBP.');
  }

  const preserveColors = options?.preserveColors ?? true;
  const analysis = await analyzeImageBuffer(imageBuffer);
  const processingMode = decideProcessingMode(options?.processingMode, analysis);
  const outputFormat = options?.outputFormat ?? 'jpeg';
  const quality = Math.min(100, Math.max(60, options?.quality ?? 92));

  const originalMetadata = await sharp(imageBuffer, { failOn: 'none' }).metadata();
  const originalWidth = originalMetadata.width ?? 0;
  const originalHeight = originalMetadata.height ?? 0;
  const normalizedManualCorners = sanitizeDocumentCorners(
    manualCorners,
    originalWidth,
    originalHeight
  );
  const normalizedDetectedCorners = sanitizeDocumentCorners(
    detectedCorners,
    originalWidth,
    originalHeight
  );
  const preferredCorners = normalizedManualCorners ?? normalizedDetectedCorners;
  const warnings: string[] = buildWarnings(
    analysis,
    normalizedManualCorners,
    normalizedDetectedCorners,
    assistedImageBuffer
  );
  const analysisMetadata = {
    paperLikeRatio: Number(analysis.paperLikeRatio.toFixed(3)),
    colorRatio: Number(analysis.colorRatio.toFixed(3)),
    edgeDensity: Number(analysis.edgeDensity.toFixed(3)),
    dynamicRange: Number(analysis.dynamicRange.toFixed(3)),
    fillFrameLikelihood: Number(analysis.fillFrameLikelihood.toFixed(3)),
  };

  const shouldUseAssistedImage =
    assistedImageBuffer && (normalizedManualCorners || normalizedDetectedCorners);

  if (shouldUseAssistedImage) {
    const finalized = await finalizeOutput(
      assistedImageBuffer,
      outputFormat,
      quality,
      preserveColors,
      processingMode,
      'conservative'
    );
    const thumbnailBuffer = await createThumbnail(finalized.buffer);
    return {
      success: true,
      processedBuffer: finalized.buffer,
      thumbnailBuffer,
      outputMimeType: finalized.mimeType,
      metadata: {
        engine: 'frontend-assisted',
        confidence: 0.95,
        fallback: true,
        width: finalized.width,
        height: finalized.height,
        originalWidth,
        originalHeight,
        documentClass: analysis.kind,
        decision: 'frontend_assisted',
        analysis: analysisMetadata,
        postprocess: {
          manualMode: 'faithful-document',
          cornersSource: normalizedManualCorners ? 'manual' : 'detected',
          manualCornersReceived: !!normalizedManualCorners,
          pythonUsed: false,
          manualFinalizeUsed: true,
          borderCleanup: false,
          isolateExterior: false,
          marginMode: 'clean-white',
          paperNormalization: false,
          shadowBalance: false,
          onlyWarpAndMargin: true,
          contentPreserved: true,
        },
        corners: normalizedManualCorners ?? normalizedDetectedCorners,
        warnings: [
          normalizedManualCorners
            ? 'Resultado manual do frontend utilizado como imagem final.'
            : 'Resultado detectado pelo frontend utilizado como imagem final.',
          ...warnings,
        ].filter(Boolean),
      },
    };
  }

  if (manualCorners?.length === 4 && !normalizedManualCorners) {
    warnings.push('Os cantos manuais recebidos não passaram na validação geométrica do backend.');
  }
  if (detectedCorners?.length === 4 && !normalizedDetectedCorners) {
    warnings.push(
      'Os cantos detectados recebidos não passaram na validação geométrica do backend.'
    );
  }

  if (preferredCorners) {
    if (isFaithfulScanMode()) {
      try {
        const faithful = await processFaithfulDocumentScan({
          imageBuffer,
          corners: preferredCorners,
          autoDetectCorners: false,
          documentRatio: 'A1_PORTRAIT',
        });
        return {
          success: true,
          processedBuffer: faithful.imageBuffer,
          thumbnailBuffer: faithful.thumbnailBuffer,
          outputMimeType: faithful.mimeType,
          metadata: {
            engine: 'faithful-scan',
            confidence: normalizedManualCorners ? 0.96 : 0.9,
            fallback: false,
            width: faithful.width,
            height: faithful.height,
            originalWidth,
            originalHeight,
            documentClass: analysis.kind,
            decision: normalizedManualCorners
              ? 'backend_manual_corners'
              : 'backend_detected_corners',
            analysis: analysisMetadata,
            postprocess: {
              manualMode: 'faithful-document',
              cornersSource: normalizedManualCorners ? 'manual' : 'detected',
              manualCornersReceived: !!normalizedManualCorners,
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
            faithfulScan: {
              processingMode: faithful.processingMode,
              usedGenerativeAI: faithful.usedGenerativeAI,
              perspectiveCorrected: faithful.perspectiveCorrected,
              contentPreservationMode: faithful.contentPreservationMode,
              documentRatio: faithful.documentRatio,
              alignmentApplied: faithful.alignmentApplied,
              alignmentAngleDeg: faithful.alignmentAngleDeg,
            },
            corners: faithful.cornersUsed,
            warnings: [
              normalizedManualCorners
                ? 'Scan fiel aplicado com cantos manuais (sem IA generativa).'
                : 'Scan fiel aplicado com cantos detectados (sem IA generativa).',
              ...warnings,
            ].filter(Boolean),
          },
        };
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? `Scan fiel indisponível com os cantos enviados: ${error.message}`
            : 'Scan fiel indisponível com os cantos enviados.'
        );
      }
    }

    const cornersInput: PythonProcessorCornersInput = {
      points: preferredCorners,
      source: normalizedManualCorners ? 'manual' : 'detected',
    };
    try {
      const pythonResult = await tryProcessDocumentImageWithPython(
        encodeDataUrl(imageBuffer, mimeType),
        cornersInput
      );
      if (pythonResult) {
        const processed = decodeImageDataUrl(pythonResult.processedBase64);
        const finalized = await finalizeOutput(
          processed.buffer,
          outputFormat,
          quality,
          preserveColors,
          processingMode
        );
        const thumbnailBuffer = await createThumbnail(finalized.buffer);
        return {
          success: true,
          processedBuffer: finalized.buffer,
          thumbnailBuffer,
          outputMimeType: finalized.mimeType,
          metadata: {
            engine: pythonResult.processador,
            confidence: pythonResult.confiancaDeteccao,
            fallback: pythonResult.fallbackUsado,
            width: finalized.width,
            height: finalized.height,
            originalWidth,
            originalHeight,
            documentClass: analysis.kind,
            decision: normalizedManualCorners
              ? 'backend_manual_corners'
              : 'backend_detected_corners',
            analysis: analysisMetadata,
            postprocess: pythonResult.postprocess,
            corners: preferredCorners,
            warnings: [
              normalizedManualCorners
                ? 'Warp final aplicado no backend a partir dos cantos manuais sobre a imagem original.'
                : 'Warp final aplicado no backend a partir dos cantos detectados sobre a imagem original.',
              ...(pythonResult.fallbackUsado
                ? ['Não foi possível aplicar os cantos com segurança. Fallback seguro aplicado.']
                : []),
              ...warnings,
            ].filter(Boolean),
          },
        };
      }
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Falha ao processar a imagem original com os cantos enviados: ${error.message}`
          : 'Falha ao processar a imagem original com os cantos enviados.'
      );
    }
  }

  try {
    const nativeDetection = await detectDocumentQuad(imageBuffer);
    if (nativeDetection?.corners?.length === 4) {
      const autoDetectedCorners = await selectBestNativeAutoCorners(
        imageBuffer,
        nativeDetection.corners,
        originalWidth,
        originalHeight,
        processingMode
      );
      if (isFaithfulScanMode()) {
        const faithful = await processFaithfulDocumentScan({
          imageBuffer,
          corners: autoDetectedCorners,
          autoDetectCorners: false,
          documentRatio: 'A1_PORTRAIT',
          marginRatio: 0,
          enhanceText: false,
          reduceShadows: false,
          sharpen: false,
          enableFineAlignment: false,
          enableMeshDewarp: processingMode === 'map_document',
        });
        return {
          success: true,
          processedBuffer: faithful.imageBuffer,
          thumbnailBuffer: faithful.thumbnailBuffer,
          outputMimeType: faithful.mimeType,
          metadata: {
            engine: 'faithful-scan',
            confidence: 0.88,
            fallback: false,
            width: faithful.width,
            height: faithful.height,
            originalWidth,
            originalHeight,
            documentClass: analysis.kind,
            decision: 'backend_detected_corners',
            analysis: analysisMetadata,
            postprocess: {
              manualMode: 'faithful-document',
              cornersSource: 'native-detect',
              manualCornersReceived: false,
              pythonUsed: false,
              manualFinalizeUsed: false,
              borderCleanup: false,
              isolateExterior: false,
              marginMode: 'none',
              paperNormalization: false,
              shadowBalance: false,
              onlyWarpAndMargin: true,
              contentPreserved: true,
            },
            faithfulScan: {
              processingMode: faithful.processingMode,
              usedGenerativeAI: faithful.usedGenerativeAI,
              perspectiveCorrected: faithful.perspectiveCorrected,
              contentPreservationMode: faithful.contentPreservationMode,
              documentRatio: faithful.documentRatio,
              alignmentApplied: faithful.alignmentApplied,
              alignmentAngleDeg: faithful.alignmentAngleDeg,
            },
            corners: faithful.cornersUsed,
            warnings: [
              'Detecção nativa local de bordas aplicada antes do fallback do backend.',
              ...warnings,
            ].filter(Boolean),
          },
        };
      }

      const cornersInput: PythonProcessorCornersInput = {
        points: autoDetectedCorners,
        source: 'detected',
      };
      const pythonResult = await tryProcessDocumentImageWithPython(
        encodeDataUrl(imageBuffer, mimeType),
        cornersInput
      );
      if (pythonResult) {
        const processed = decodeImageDataUrl(pythonResult.processedBase64);
        const finalized = await finalizeOutput(
          processed.buffer,
          outputFormat,
          quality,
          preserveColors,
          processingMode
        );
        const thumbnailBuffer = await createThumbnail(finalized.buffer);
        return {
          success: true,
          processedBuffer: finalized.buffer,
          thumbnailBuffer,
          outputMimeType: finalized.mimeType,
          metadata: {
            engine: pythonResult.processador,
            confidence: Math.max(0.82, pythonResult.confiancaDeteccao),
            fallback: pythonResult.fallbackUsado,
            width: finalized.width,
            height: finalized.height,
            originalWidth,
            originalHeight,
            documentClass: analysis.kind,
            decision: pythonResult.fallbackUsado ? 'safe_fallback' : 'backend_detected_corners',
            analysis: analysisMetadata,
            postprocess: pythonResult.postprocess,
            corners: autoDetectedCorners,
            warnings: [
              'Detecção nativa local de bordas aplicada antes do fallback do backend.',
              ...(pythonResult.fallbackUsado
                ? [
                    'Não foi possível aplicar os cantos detectados com segurança. Fallback seguro aplicado.',
                  ]
                : []),
              ...warnings,
            ].filter(Boolean),
          },
        };
      }
    }
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Detecção nativa local indisponível: ${error.message}`
        : 'Detecção nativa local indisponível.'
    );
  }

  try {
    const pythonResult = await tryProcessDocumentImageWithPython(
      encodeDataUrl(imageBuffer, mimeType)
    );
    if (pythonResult) {
      const processed = decodeImageDataUrl(pythonResult.processedBase64);
      const finalized = await finalizeOutput(
        processed.buffer,
        outputFormat,
        quality,
        preserveColors,
        processingMode
      );
      const thumbnailBuffer = await createThumbnail(finalized.buffer);
      return {
        success: true,
        processedBuffer: finalized.buffer,
        thumbnailBuffer,
        outputMimeType: finalized.mimeType,
        metadata: {
          engine: pythonResult.processador,
          confidence: pythonResult.confiancaDeteccao,
          fallback: pythonResult.fallbackUsado,
          width: finalized.width,
          height: finalized.height,
          originalWidth,
          originalHeight,
          documentClass: analysis.kind,
          decision: pythonResult.fallbackUsado ? 'safe_fallback' : 'python_detected',
          analysis: analysisMetadata,
          postprocess: pythonResult.postprocess,
          corners: preferredCorners,
          warnings: [
            ...(pythonResult.fallbackUsado
              ? ['Não foi possível detectar a folha com segurança. Fallback seguro aplicado.']
              : []),
            ...warnings,
          ].filter(Boolean),
        },
      };
    }
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Processador Python indisponivel: ${error.message}`
        : 'Processador Python indisponivel.'
    );
  }

  if (assistedImageBuffer) {
    const assistedMime =
      assistedMimeType && isSupportedMimeType(assistedMimeType)
        ? assistedMimeType
        : mimeTypeFromFormat(outputFormat);
    const finalized = await finalizeOutput(
      assistedImageBuffer,
      outputFormat,
      quality,
      preserveColors,
      processingMode,
      'conservative'
    );
    const thumbnailBuffer = await createThumbnail(finalized.buffer);
    return {
      success: true,
      processedBuffer: finalized.buffer,
      thumbnailBuffer,
      outputMimeType: finalized.mimeType,
      metadata: {
        engine: 'frontend-assisted',
        confidence: preferredCorners ? 0.75 : 0.65,
        fallback: true,
        width: finalized.width,
        height: finalized.height,
        originalWidth,
        originalHeight,
        documentClass: analysis.kind,
        decision: 'safe_fallback',
        analysis: analysisMetadata,
        corners: preferredCorners,
        warnings: [
          'Imagem corrigida no frontend usada apenas como fallback, porque o backend não conseguiu gerar o warp final oficial a partir da original.',
          ...(assistedMime !== finalized.mimeType
            ? ['A imagem assistida foi reencodada no backend para armazenamento final.']
            : []),
          ...warnings,
        ].filter(Boolean),
      },
    };
  }

  const fallback = await processWithSharpFallback(
    imageBuffer,
    outputFormat,
    quality,
    processingMode,
    warnings
  );
  const thumbnailBuffer = await createThumbnail(fallback.buffer);
  return {
    success: true,
    processedBuffer: fallback.buffer,
    thumbnailBuffer,
    outputMimeType: fallback.mimeType,
    metadata: {
      engine: 'sharp-fallback',
      confidence: 0,
      fallback: true,
      width: fallback.width,
      height: fallback.height,
      originalWidth,
      originalHeight,
      documentClass: analysis.kind,
      decision:
        analysis.kind === 'low_confidence_capture' ? 'manual_review_recommended' : 'safe_fallback',
      analysis: analysisMetadata,
      corners: preferredCorners,
      warnings,
    },
  };
}

export function buildGeneratedFilename(baseName: string, mimeType: string): string {
  const ext = extensionFromMimeType(mimeType);
  return `${baseName}.${ext}`;
}
