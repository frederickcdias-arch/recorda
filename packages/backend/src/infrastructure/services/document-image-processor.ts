import sharp from 'sharp';
import {
  tryProcessDocumentImageWithPython,
  type PythonProcessorCornersInput,
} from './document-image-python-processor.js';

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
    throw new Error('Imagem invalida. Envie JPEG, PNG ou WEBP em data URI base64.');
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
      'Captura com baixa confianca geometrica; revisar enquadramento ou ajustar bordas.'
    );
  }
  if (
    analysis.fillFrameLikelihood > 0.78 &&
    !assistedImageBuffer &&
    !manualCorners?.length &&
    !detectedCorners?.length
  ) {
    warnings.push(
      'A folha ocupa quase todo o quadro; a deteccao automatica pode confundir papel e fundo.'
    );
  }
  if (analysis.paperLikeRatio < 0.18 && !assistedImageBuffer && !detectedCorners?.length) {
    warnings.push(
      'Pouca area de papel isolada na imagem original; o sistema deve preferir revisao manual.'
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

function sanitizeCorners(
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

type ImageEnhancementMode = 'standard' | 'conservative';

async function finalizeOutput(
  buffer: Buffer,
  format: 'jpeg' | 'png' | 'webp',
  quality: number,
  preserveColors: boolean,
  processingMode: DocumentProcessingMode,
  enhancementMode: ImageEnhancementMode = 'standard'
): Promise<{ buffer: Buffer; width: number; height: number; mimeType: string }> {
  let pipeline = sharp(buffer, { failOn: 'none' }).rotate().resize({
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
      .gamma(1.025)
      .modulate({ brightness: 1.006, saturation: 1.012 })
      .sharpen({ sigma: 0.6, m1: 0.1, m2: 0.58 });
  } else {
    pipeline = pipeline
      .gamma(1.06)
      .modulate({ brightness: 1.012, saturation: 1 })
      .sharpen({ sigma: 0.85, m1: 0.18, m2: 0.95 });
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
    pipeline = pipeline
      .toColourspace('srgb')
      .gamma(1.018)
      .modulate({ brightness: 1.006, saturation: 1.015 })
      .linear(1.02, -1)
      .sharpen({ sigma: 0.58, m1: 0.08, m2: 0.55 });
  } else {
    pipeline = pipeline
      .normalize()
      .gamma(1.04)
      .modulate({ brightness: 1.01, saturation: 1 })
      .sharpen({ sigma: 0.85, m1: 0.18, m2: 0.95 });
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
  warnings.push('Documento nao corrigido com perspectiva completa; aplicada melhoria leve.');
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
    throw new Error('Tipo de imagem nao suportado. Use JPEG, PNG ou WEBP.');
  }

  const preserveColors = options?.preserveColors ?? true;
  const analysis = await analyzeImageBuffer(imageBuffer);
  const processingMode = decideProcessingMode(options?.processingMode, analysis);
  const outputFormat = options?.outputFormat ?? 'jpeg';
  const quality = Math.min(100, Math.max(60, options?.quality ?? 92));

  const originalMetadata = await sharp(imageBuffer, { failOn: 'none' }).metadata();
  const originalWidth = originalMetadata.width ?? 0;
  const originalHeight = originalMetadata.height ?? 0;
  const normalizedManualCorners = sanitizeCorners(manualCorners, originalWidth, originalHeight);
  const normalizedDetectedCorners = sanitizeCorners(detectedCorners, originalWidth, originalHeight);
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
    warnings.push('Os cantos manuais recebidos nao passaram na validacao geometrica do backend.');
  }
  if (detectedCorners?.length === 4 && !normalizedDetectedCorners) {
    warnings.push(
      'Os cantos detectados recebidos nao passaram na validacao geometrica do backend.'
    );
  }

  if (preferredCorners) {
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
                ? ['Nao foi possivel aplicar os cantos com seguranca. Aplicado fallback seguro.']
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
              ? ['Nao foi possivel detectar a folha com seguranca. Aplicado fallback seguro.']
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
          'Imagem corrigida no frontend usada apenas como fallback, porque o backend nao conseguiu gerar o warp final oficial a partir da original.',
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
