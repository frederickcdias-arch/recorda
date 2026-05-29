import sharp from 'sharp';
import {
  getOpenAIImageConfig,
  resolveOpenAIAutoCropSkipReason,
  type OpenAISkipReason,
} from '../config/openai-image-config.js';
import {
  decodeImageDataUrl,
  processDocumentImage,
  type DocumentImagePoint,
} from './document-image-processor.js';
import {
  applyOpenAICornersFastWarp,
  buildAICornersMetadataBase,
  evaluateOpenAICorners,
  FastWarpFailedError,
  FastWarpTimeoutError,
  type AICornersMetadata,
  type AIWarpMetadata,
  type ProcessingFailureStage,
  type ProcessingOrigin,
} from './openai-corners-processor.js';
import { getMapImageAiWarpTimeoutConfig } from '../config/map-image-ai-warp-timeout-config.js';
import { cornersPayloadToPoints } from './openai-corners-utils.js';
import { getMapImageLocalTimeoutConfig } from '../config/map-image-local-timeout-config.js';
import {
  attachProcessingDecision,
  PRODUCTION_RETAKE_MESSAGE,
  resolveRetakeUserMessage,
  type ProcessingDecisionMetadata,
} from './map-image-processing-decision.js';
import {
  mapAICornersRejectionToFailureReason,
  resolveSharpFallbackFailureReason,
} from './map-image-processing-reasons.js';
import { ProcessingTimer, type ProcessingTimingMetadata } from './map-image-processing-timing.js';
import {
  createSkippedOpenAIMetadata,
  processOpenAIImageEnhancement,
  resolveOpenAIInvocationReason,
  shouldInvokeOpenAI,
  type OpenAIEnhancementOptions,
  type OpenAIImageMetadata,
} from './openai-image-processor.js';
import {
  getMapImageFaithfulScanConfig,
  isFaithfulScanMode,
} from '../config/map-image-faithful-scan-config.js';
import { processFaithfulDocumentScan } from './faithful-document-scan.js';

export interface ProcessMapImageResult {
  processedBase64: string;
  tamanhoBytes: number;
  confiancaDeteccao: number;
  fallbackUsado: boolean;
  dimensoesFinais: {
    width: number;
    height: number;
  };
  processador:
    | 'python-opencv'
    | 'opencv-manual-corners'
    | 'opencv-detected-corners'
    | 'sharp-fallback'
    | 'frontend-assisted'
    | 'openai'
    | 'openai-guided'
    | 'openai-corners'
    | 'openai-corners-fast-warp'
    | 'openai-corners-warp-failed'
    | 'faithful-scan';
  thumbnailBase64?: string;
  metadata?: {
    originalWidth?: number;
    originalHeight?: number;
    documentClass?: 'map_document' | 'color_document' | 'text_document' | 'low_confidence_capture';
    decision?:
      | 'frontend_assisted'
      | 'python_detected'
      | 'backend_manual_corners'
      | 'backend_detected_corners'
      | 'safe_fallback'
      | 'manual_review_recommended';
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
    openai?: OpenAIImageMetadata;
    aiCorners?: AICornersMetadata;
    aiWarp?: AIWarpMetadata;
    processing?: {
      origin: ProcessingOrigin;
      engine?: string;
      cornerSource?: 'native-detect' | 'openai' | 'manual';
      failureStage?: ProcessingFailureStage;
      manualReviewRecommended?: boolean;
      localTimeout?: boolean;
      localFailed?: boolean;
    };
    documentDetection?: {
      used: boolean;
      areaRatio?: number;
      rectangularity?: number;
      threshold?: number;
    };
    processingDecision?: ProcessingDecisionMetadata;
    processingTiming?: ProcessingTimingMetadata;
    faithfulScan?: {
      processingMode: 'faithful-scan';
      usedGenerativeAI: false;
      perspectiveCorrected: boolean;
      contentPreservationMode: boolean;
      documentRatio?: string;
      meshDewarpApplied?: boolean;
      meshDewarpBow?: number;
      alignmentApplied?: boolean;
      alignmentAngleDeg?: number;
    };
  };
}

export interface ProcessMapImageInput {
  imagemBase64: string;
  imagemCorrigidaBase64?: string;
  manualCorners?: DocumentImagePoint[];
  manualEdgeMidpoints?: DocumentImagePoint[];
  detectedCorners?: DocumentImagePoint[];
  melhorarComIa?: boolean;
  forcarAnaliseIa?: boolean;
  reprocessarComIa?: boolean;
  priorOpenAIMetadata?: OpenAIImageMetadata;
}

async function createThumbnailFromBuffer(buffer: Buffer): Promise<string> {
  const thumb = await sharp(buffer, { failOn: 'none' })
    .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${thumb.toString('base64')}`;
}

function localEngineTiming(
  processador: ProcessMapImageResult['processador'],
  localProcessorMs: number
): Pick<ProcessingTimingMetadata, 'pythonMs' | 'sharpMs'> {
  if (processador === 'sharp-fallback') {
    return { sharpMs: localProcessorMs };
  }
  if (
    processador === 'python-opencv' ||
    processador === 'opencv-detected-corners' ||
    processador === 'opencv-manual-corners' ||
    processador === 'openai-corners' ||
    processador === 'openai-corners-fast-warp'
  ) {
    return { pythonMs: localProcessorMs };
  }
  if (processador === 'openai-corners-warp-failed') {
    return { pythonMs: localProcessorMs };
  }
  return {};
}

function openaiTimingFields(
  openaiMetadata?: OpenAIImageMetadata
): Pick<ProcessingTimingMetadata, 'openaiMs' | 'resizeMs'> {
  return {
    openaiMs: openaiMetadata?.durationMs,
    resizeMs: openaiMetadata?.resizeMs,
  };
}

function withProcessingTiming(
  result: ProcessMapImageResult,
  timing: ProcessingTimingMetadata
): ProcessMapImageResult {
  return attachProcessingDecision({
    ...result,
    metadata: {
      ...result.metadata,
      processingTiming: timing,
    },
  });
}

function isLocalTimeoutResult(result: ProcessMapImageResult): boolean {
  return Boolean(result.metadata?.processing?.localTimeout);
}

class LocalPipelineTimeoutError extends Error {
  constructor(
    readonly timeoutMs: number,
    readonly elapsedMs: number
  ) {
    super('local_processor_timeout');
    this.name = 'LocalPipelineTimeoutError';
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => LocalPipelineTimeoutError
): Promise<T> {
  if (timeoutMs <= 0) {
    throw onTimeout();
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resolveLocalTimeoutMs(timer: ProcessingTimer): number {
  const config = getMapImageLocalTimeoutConfig();
  const remainingTotal = config.totalProcessingTimeoutMs - timer.totalMs();
  if (remainingTotal <= 0) {
    return 0;
  }
  return Math.min(config.localProcessorTimeoutMs, remainingTotal);
}

async function buildLocalTimeoutRetakeResult(
  payload: ProcessMapImageInput,
  timer: ProcessingTimer,
  options: {
    localTimeoutMs: number;
    localProcessorMs: number;
    openaiMetadata?: OpenAIImageMetadata;
    aiCorners?: AICornersMetadata;
    extraMetadata?: Partial<NonNullable<ProcessMapImageResult['metadata']>>;
  }
): Promise<ProcessMapImageResult> {
  const original = decodeImageDataUrl(payload.imagemBase64);
  const originalMeta = await sharp(original.buffer, { failOn: 'none' }).metadata();
  const thumbnailBase64 = await createThumbnailFromBuffer(original.buffer);

  return withProcessingTiming(
    {
      processedBase64: payload.imagemBase64,
      thumbnailBase64,
      tamanhoBytes: original.buffer.length,
      confiancaDeteccao: 0,
      fallbackUsado: true,
      dimensoesFinais: {
        width: originalMeta.width ?? 0,
        height: originalMeta.height ?? 0,
      },
      processador: 'sharp-fallback',
      metadata: {
        originalWidth: originalMeta.width,
        originalHeight: originalMeta.height,
        decision: 'manual_review_recommended',
        openai: options.openaiMetadata,
        aiCorners: options.aiCorners,
        warnings: [PRODUCTION_RETAKE_MESSAGE],
        processing: {
          origin: 'local',
          localTimeout: true,
          manualReviewRecommended: true,
        },
        ...options.extraMetadata,
      },
    },
    timer.snapshot({
      localProcessorMs: options.localProcessorMs,
      localTimeoutMs: options.localTimeoutMs,
      sharpMs: options.localProcessorMs,
    })
  );
}

async function runLocalPipelineWithTimeout(
  payload: ProcessMapImageInput,
  timer: ProcessingTimer,
  context?: {
    openaiMetadata?: OpenAIImageMetadata;
    aiCorners?: AICornersMetadata;
    extraMetadata?: Partial<NonNullable<ProcessMapImageResult['metadata']>>;
  }
): Promise<ProcessMapImageResult> {
  const timeoutMs = resolveLocalTimeoutMs(timer);
  if (timeoutMs <= 0) {
    return buildLocalTimeoutRetakeResult(payload, timer, {
      localTimeoutMs: getMapImageLocalTimeoutConfig().localProcessorTimeoutMs,
      localProcessorMs: 0,
      openaiMetadata: context?.openaiMetadata,
      aiCorners: context?.aiCorners,
      extraMetadata: context?.extraMetadata,
    });
  }

  timer.mark('local');
  const startedAt = Date.now();
  try {
    const result = await withTimeout(
      runLocalPipeline(payload),
      timeoutMs,
      () => new LocalPipelineTimeoutError(timeoutMs, Date.now() - startedAt)
    );
    timer.markEnd('local');
    return result;
  } catch (error) {
    timer.markEnd('local');
    if (error instanceof LocalPipelineTimeoutError) {
      return buildLocalTimeoutRetakeResult(payload, timer, {
        localTimeoutMs: error.timeoutMs,
        localProcessorMs: error.elapsedMs,
        openaiMetadata: context?.openaiMetadata,
        aiCorners: context?.aiCorners,
        extraMetadata: context?.extraMetadata,
      });
    }
    throw error;
  }
}

function finalizeLocalResult(
  result: ProcessMapImageResult,
  timer: ProcessingTimer,
  partialTiming: Partial<ProcessingTimingMetadata> = {}
): ProcessMapImageResult {
  const localProcessorMs = timer.elapsed('local') ?? partialTiming.localProcessorMs ?? 0;
  return withProcessingTiming(
    result,
    timer.snapshot({
      localProcessorMs,
      ...localEngineTiming(result.processador, localProcessorMs),
      ...partialTiming,
    })
  );
}

function isSharpFallbackZeroConfidence(result: ProcessMapImageResult): boolean {
  return result.processador === 'sharp-fallback' && Number(result.confiancaDeteccao ?? 0) <= 0;
}

function buildAiCornersMetadataFromFailure(
  openaiMetadata: OpenAIImageMetadata,
  rejectionReason?: AICornersMetadata['rejectionReason']
): AICornersMetadata {
  return {
    source: 'openai',
    applied: false,
    confidence: openaiMetadata.confidence ?? openaiMetadata.analysis?.confidence,
    rejectionReason: rejectionReason ?? 'missing_corners',
  };
}

function buildLocalFallbackWarnings(
  openaiMetadata: OpenAIImageMetadata,
  extraWarnings: string[],
  localResult: ProcessMapImageResult,
  aiCorners?: AICornersMetadata
): string[] {
  if (isSharpFallbackZeroConfidence(localResult)) {
    const failureReason = resolveSharpFallbackFailureReason({
      openaiAttempted: openaiMetadata.attempted,
      aiRejectionReason: aiCorners?.rejectionReason,
    });
    const aiReason = aiCorners?.rejectionReason
      ? mapAICornersRejectionToFailureReason(aiCorners.rejectionReason)
      : undefined;
    return [
      resolveRetakeUserMessage(aiReason ?? failureReason),
      ...(aiCorners?.rejectionReason
        ? [`Bordas IA não aplicadas (${aiCorners.rejectionReason}).`]
        : []),
      ...extraWarnings,
    ].filter(Boolean);
  }

  const warning =
    openaiMetadata.timeout || openaiMetadata.error?.includes('timeout')
      ? 'IA demorou; tentativa local concluída.'
      : openaiMetadata.skippedReason
        ? undefined
        : openaiMetadata.success
          ? 'IA não aplicou bordas; tentativa local concluída.'
          : 'IA indisponível; tentativa local concluída.';

  return [
    ...(localResult.metadata?.warnings ?? []),
    ...(warning ? [warning] : []),
    ...extraWarnings,
  ].filter(Boolean);
}

async function buildAiWarpFailureResult(
  payload: ProcessMapImageInput,
  timer: ProcessingTimer,
  options: {
    openaiMetadata: OpenAIImageMetadata;
    aiCorners: AICornersMetadata;
    reason: 'ai_warp_timeout' | 'ai_warp_failed';
    warpTimeout?: boolean;
    warpError?: string;
    aiWarpMs: number;
    aiWarp?: AIWarpMetadata;
  }
): Promise<ProcessMapImageResult> {
  const original = decodeImageDataUrl(payload.imagemBase64);
  const originalMeta = await sharp(original.buffer, { failOn: 'none' }).metadata();
  const thumbnailBase64 = await createThumbnailFromBuffer(original.buffer);
  const aiCorners: AICornersMetadata = {
    ...options.aiCorners,
    applied: false,
    detected: true,
    valid: options.aiCorners.valid ?? true,
    appliedToWarp: true,
    warpSuccess: false,
    warpTimeout: options.warpTimeout,
    warpError: options.warpError ?? options.reason,
  };
  const aiWarp: AIWarpMetadata = {
    attempted: true,
    method: 'python-fast-script',
    success: false,
    timeout: options.warpTimeout,
    durationMs: options.aiWarp?.durationMs ?? options.aiWarpMs,
    pythonStartupMs: options.aiWarp?.pythonStartupMs,
    cv2ImportMs: options.aiWarp?.cv2ImportMs,
    warpMs: options.aiWarp?.warpMs,
    outputMs: options.aiWarp?.outputMs,
    inputWidth: options.aiWarp?.inputWidth ?? originalMeta.width,
    inputHeight: options.aiWarp?.inputHeight ?? originalMeta.height,
    error: options.aiWarp?.error ?? options.warpError ?? options.reason,
  };

  return withProcessingTiming(
    {
      processedBase64: payload.imagemBase64,
      thumbnailBase64,
      tamanhoBytes: original.buffer.length,
      confiancaDeteccao: 0,
      fallbackUsado: true,
      dimensoesFinais: {
        width: originalMeta.width ?? 0,
        height: originalMeta.height ?? 0,
      },
      processador: 'openai-corners-warp-failed',
      metadata: {
        originalWidth: originalMeta.width,
        originalHeight: originalMeta.height,
        decision: 'manual_review_recommended',
        openai: options.openaiMetadata,
        aiCorners,
        aiWarp,
        corners: options.aiCorners.cornersOriginalImage,
        warnings: [resolveRetakeUserMessage(options.reason)],
        processing: {
          origin: 'openai-corners-warp-failed',
          engine: 'openai-corners-warp-failed',
          failureStage: 'ai_warp',
          manualReviewRecommended: true,
        },
      },
    },
    timer.snapshot({
      ...openaiTimingFields(options.openaiMetadata),
      aiWarpMs: aiWarp.durationMs ?? options.aiWarpMs,
      localProcessorMs: options.aiWarpMs,
      pythonStartupMs: aiWarp.pythonStartupMs,
      cv2ImportMs: aiWarp.cv2ImportMs,
      warpStageMs: aiWarp.warpMs,
      outputMs: aiWarp.outputMs,
      ...localEngineTiming('openai-corners-warp-failed', options.aiWarpMs),
    })
  );
}

function attachSkippedOpenAIMetadata(
  result: ProcessMapImageResult,
  skippedReason: OpenAISkipReason
): ProcessMapImageResult {
  if (result.metadata?.openai?.skippedReason || result.metadata?.openai?.called) {
    return result;
  }
  return {
    ...result,
    metadata: {
      ...result.metadata,
      openai: createSkippedOpenAIMetadata(skippedReason),
    },
  };
}

async function buildLocalFallbackAfterOpenAI(
  payload: ProcessMapImageInput,
  openaiMetadata: OpenAIImageMetadata,
  timer: ProcessingTimer,
  extraWarnings: string[] = [],
  aiCorners?: AICornersMetadata
): Promise<ProcessMapImageResult> {
  const openaiMs = openaiMetadata.durationMs;
  const localResult = await runLocalPipelineWithTimeout(payload, timer, {
    openaiMetadata,
    aiCorners,
  });

  if (isLocalTimeoutResult(localResult)) {
    return finalizeLocalResult(localResult, timer, {
      openaiMs,
      ...openaiTimingFields(openaiMetadata),
    });
  }

  const localProcessorMs = timer.elapsed('local') ?? 0;
  const sharpFallbackFailure = isSharpFallbackZeroConfidence(localResult);
  const warnings = buildLocalFallbackWarnings(
    openaiMetadata,
    extraWarnings,
    localResult,
    aiCorners
  );

  return withProcessingTiming(
    {
      ...localResult,
      metadata: {
        ...localResult.metadata,
        openai: openaiMetadata,
        aiCorners,
        decision: 'manual_review_recommended',
        processing: {
          origin: 'fallback',
          manualReviewRecommended: true,
          localFailed: sharpFallbackFailure,
        },
        warnings,
      },
    },
    timer.snapshot({
      openaiMs,
      localProcessorMs,
      ...openaiTimingFields(openaiMetadata),
      ...localEngineTiming(localResult.processador, localProcessorMs),
    })
  );
}

async function tryManualFaithfulScan(
  payload: ProcessMapImageInput,
  timer: ProcessingTimer
): Promise<ProcessMapImageResult | null> {
  // Quando o frontend já forneceu uma correção manual assistida, preservamos
  // essa saída exata em vez de recalcular no backend. Isso evita divergência
  // entre o preview ajustado pelo usuário e a imagem final salva.
  if (payload.imagemCorrigidaBase64) {
    return null;
  }

  if (!isFaithfulScanMode() || payload.manualCorners?.length !== 4) {
    return null;
  }

  const original = decodeImageDataUrl(payload.imagemBase64);
  const originalMeta = await sharp(original.buffer, { failOn: 'none' }).metadata();
  const faithfulConfig = getMapImageFaithfulScanConfig();

  timer.mark('local');
  try {
    const faithful = await processFaithfulDocumentScan({
      imageBuffer: original.buffer,
      corners: payload.manualCorners,
      edgeMidpoints: payload.manualEdgeMidpoints,
      autoDetectCorners: false,
      documentRatio: faithfulConfig.documentRatio,
      maxDimension: faithfulConfig.maxDimension,
      enableMeshDewarp: payload.manualEdgeMidpoints?.length === 4,
    });
    timer.markEnd('local');

    return attachProcessingDecision(
      withProcessingTiming(
        {
          processedBase64: `data:${faithful.mimeType};base64,${faithful.imageBuffer.toString('base64')}`,
          thumbnailBase64: `data:image/jpeg;base64,${faithful.thumbnailBuffer.toString('base64')}`,
          tamanhoBytes: faithful.imageBuffer.length,
          confiancaDeteccao: 0.96,
          fallbackUsado: false,
          dimensoesFinais: { width: faithful.width, height: faithful.height },
          processador: 'faithful-scan',
          metadata: {
            originalWidth: originalMeta.width,
            originalHeight: originalMeta.height,
            documentClass: 'map_document',
            decision: 'backend_manual_corners',
            postprocess: {
              manualMode: 'faithful-document',
              cornersSource: 'manual',
              manualCornersReceived: true,
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
            corners: faithful.cornersUsed,
            faithfulScan: {
              processingMode: 'faithful-scan',
              usedGenerativeAI: false,
              perspectiveCorrected: true,
              contentPreservationMode: true,
              documentRatio: faithful.documentRatio,
              meshDewarpApplied: faithful.meshDewarpApplied,
              meshDewarpBow: faithful.meshDewarpBow,
              alignmentApplied: faithful.alignmentApplied,
              alignmentAngleDeg: faithful.alignmentAngleDeg,
            },
            processing: {
              origin: 'manual',
              engine: 'faithful-scan',
              cornerSource: 'manual',
              manualReviewRecommended: false,
            },
            warnings: [],
          },
        },
        timer.snapshot({
          localProcessorMs: timer.elapsed('local') ?? 0,
          ...localEngineTiming('faithful-scan', timer.elapsed('local') ?? 0),
        })
      )
    );
  } catch {
    timer.markEnd('local');
    return null;
  }
}

async function runLocalPipeline(payload: ProcessMapImageInput): Promise<ProcessMapImageResult> {
  const original = decodeImageDataUrl(payload.imagemBase64);
  const assisted = payload.imagemCorrigidaBase64
    ? decodeImageDataUrl(payload.imagemCorrigidaBase64)
    : null;

  const result = await processDocumentImage({
    imageBuffer: original.buffer,
    mimeType: original.mimeType,
    manualCorners: payload.manualCorners,
    detectedCorners: payload.detectedCorners,
    assistedImageBuffer: assisted?.buffer,
    assistedMimeType: assisted?.mimeType,
    options: {
      processingMode: 'map_document',
      preserveColors: true,
      outputFormat: 'jpeg',
      quality: 92,
    },
  });

  return {
    processedBase64: `data:${result.outputMimeType};base64,${result.processedBuffer.toString('base64')}`,
    thumbnailBase64: result.thumbnailBuffer
      ? `data:image/jpeg;base64,${result.thumbnailBuffer.toString('base64')}`
      : undefined,
    tamanhoBytes: result.processedBuffer.length,
    confiancaDeteccao: result.metadata.confidence,
    fallbackUsado: result.metadata.fallback,
    dimensoesFinais: {
      width: result.metadata.width,
      height: result.metadata.height,
    },
    processador: result.metadata.engine as ProcessMapImageResult['processador'],
    metadata: {
      originalWidth: result.metadata.originalWidth,
      originalHeight: result.metadata.originalHeight,
      documentClass: result.metadata.documentClass,
      decision: result.metadata.decision,
      analysis: result.metadata.analysis,
      postprocess: result.metadata.postprocess,
      corners: result.metadata.corners,
      warnings: result.metadata.warnings,
      faithfulScan: result.metadata.faithfulScan,
      processing: {
        origin: payload.manualCorners?.length === 4 ? 'manual' : 'local',
        manualReviewRecommended: result.metadata.decision === 'manual_review_recommended',
      },
    },
  };
}

async function tryOpenAIAutoCrop(
  payload: ProcessMapImageInput,
  timer: ProcessingTimer
): Promise<ProcessMapImageResult | null> {
  const config = getOpenAIImageConfig();
  const hasManualCorners = payload.manualCorners?.length === 4;
  const skipReason = resolveOpenAIAutoCropSkipReason(config);
  if (hasManualCorners || skipReason) {
    return null;
  }

  const original = decodeImageDataUrl(payload.imagemBase64);
  const originalMeta = await sharp(original.buffer, { failOn: 'none' }).metadata();
  const originalWidth = originalMeta.width ?? 0;
  const originalHeight = originalMeta.height ?? 0;

  const openaiOptions: OpenAIEnhancementOptions = {
    melhorarComIa: payload.melhorarComIa,
    forcarAnaliseIa: payload.forcarAnaliseIa,
    reprocessarComIa: payload.reprocessarComIa,
    priorOpenAIMetadata: payload.priorOpenAIMetadata,
  };

  timer.mark('openai');
  const openaiResult = await processOpenAIImageEnhancement(
    original.buffer,
    openaiOptions,
    config,
    'auto_crop_detection'
  );
  timer.markEnd('openai');

  const openaiTimeout = openaiResult.metadata?.timeout;
  const openaiMetadata: OpenAIImageMetadata = openaiResult.metadata ?? {
    called: true,
    attempted: true,
    success: openaiResult.success,
    model: openaiResult.model,
    durationMs: openaiResult.durationMs ?? timer.elapsed('openai'),
    analysis: openaiResult.analysis,
    error: openaiResult.error,
    cacheHit: openaiResult.cacheHit,
    timeout: openaiTimeout,
    reason: 'auto_crop_detection',
  };

  if (!openaiResult.success || !openaiResult.analysis) {
    const rejectionReason = openaiMetadata.timeout
      ? 'missing_corners'
      : !openaiResult.analysis
        ? 'missing_corners'
        : 'low_confidence';
    return buildLocalFallbackAfterOpenAI(
      payload,
      openaiMetadata,
      timer,
      openaiMetadata.timeout
        ? ['IA demorou antes de retornar bordas.']
        : openaiMetadata.error
          ? [`Análise IA indisponível: ${openaiMetadata.error}`]
          : [],
      buildAiCornersMetadataFromFailure(openaiMetadata, rejectionReason)
    );
  }

  // Cantos vêm no sistema da imagem enviada à IA (prompt). O imageSize do JSON
  // da resposta costuma divergir do tamanho real — priorizar o tamanho REAL
  // enviado; imageSize fica só como fallback quando aquele não está disponível.
  const sentWidth =
    openaiMetadata.sentImageWidth ?? openaiResult.analysis.imageSize?.width ?? originalWidth;
  const sentHeight =
    openaiMetadata.sentImageHeight ?? openaiResult.analysis.imageSize?.height ?? originalHeight;

  const cornerPoints = openaiResult.analysis.corners
    ? cornersPayloadToPoints(openaiResult.analysis.corners)
    : [];

  const evaluation = evaluateOpenAICorners(
    openaiResult.analysis,
    config,
    sentWidth,
    sentHeight,
    originalWidth,
    originalHeight,
    cornerPoints
  );

  const aiCornersMetadata: AICornersMetadata = {
    ...buildAICornersMetadataBase(evaluation, openaiResult.analysis.confidence),
    originalImageSize: { width: originalWidth, height: originalHeight },
  };

  if (!evaluation.shouldApply || !evaluation.cornersOriginalImage) {
    const mappedReason = evaluation.rejectionReason
      ? mapAICornersRejectionToFailureReason(evaluation.rejectionReason)
      : undefined;
    return buildLocalFallbackAfterOpenAI(
      payload,
      openaiMetadata,
      timer,
      [
        evaluation.rejectionReason
          ? `Bordas IA não aplicadas (${evaluation.rejectionReason}).`
          : PRODUCTION_RETAKE_MESSAGE,
        mappedReason ? resolveRetakeUserMessage(mappedReason) : '',
        openaiResult.analysis.notes ? `IA: ${openaiResult.analysis.notes}` : '',
      ].filter(Boolean),
      aiCornersMetadata
    );
  }

  timer.mark('aiWarp');
  const warpStartedAt = Date.now();
  const warpTimeoutMs = getMapImageAiWarpTimeoutConfig().aiWarpTimeoutMs;
  try {
    const applied = await applyOpenAICornersFastWarp(
      original.buffer,
      original.mimeType,
      evaluation.cornersOriginalImage,
      openaiMetadata,
      aiCornersMetadata,
      { timeoutMs: warpTimeoutMs }
    );
    timer.markEnd('aiWarp');
    const aiWarpMs = timer.elapsed('aiWarp') ?? Date.now() - warpStartedAt;
    return withProcessingTiming(
      applied as ProcessMapImageResult,
      timer.snapshot({
        ...openaiTimingFields(openaiMetadata),
        aiWarpMs,
        localProcessorMs: aiWarpMs,
        ...localEngineTiming('openai-corners-fast-warp', aiWarpMs),
      })
    );
  } catch (error) {
    timer.markEnd('aiWarp');
    const aiWarpMs = timer.elapsed('aiWarp') ?? Date.now() - warpStartedAt;
    if (error instanceof FastWarpTimeoutError) {
      return buildAiWarpFailureResult(payload, timer, {
        openaiMetadata,
        aiCorners: aiCornersMetadata,
        reason: 'ai_warp_timeout',
        warpTimeout: true,
        warpError: 'ai_warp_timeout',
        aiWarpMs,
        aiWarp: error.aiWarp,
      });
    }
    return buildAiWarpFailureResult(payload, timer, {
      openaiMetadata,
      aiCorners: aiCornersMetadata,
      reason: 'ai_warp_failed',
      warpError: error instanceof FastWarpFailedError ? error.message : 'ai_warp_failed',
      aiWarpMs,
      aiWarp: error instanceof FastWarpFailedError ? error.aiWarp : undefined,
    });
  }
}

function mergeOpenAIEnhancement(
  localResult: ProcessMapImageResult,
  openaiResult: Awaited<ReturnType<typeof processOpenAIImageEnhancement>>,
  openaiMetadata: OpenAIImageMetadata,
  invocationReason?: string
): ProcessMapImageResult {
  const faithfulLocked =
    isFaithfulScanMode() &&
    getMapImageFaithfulScanConfig().blockGenerativeReplacement &&
    (localResult.metadata?.faithfulScan?.usedGenerativeAI === false ||
      localResult.processador === 'faithful-scan' ||
      localResult.processador === 'openai-corners-fast-warp' ||
      localResult.metadata?.postprocess?.paperNormalization === 'faithful-scan');

  if (faithfulLocked && openaiResult.correctedImageBuffer) {
    return {
      ...localResult,
      metadata: {
        ...localResult.metadata,
        warnings: [
          ...(localResult.metadata?.warnings ?? []),
          'Melhoria generativa/guided bloqueada: resultado fiel preservado (faithful-scan).',
          openaiResult.analysis?.notes ? `IA: ${openaiResult.analysis.notes}` : '',
        ].filter(Boolean),
        openai: { ...openaiMetadata, reason: invocationReason ?? openaiMetadata.reason },
      },
    };
  }

  if (!openaiResult.success) {
    return {
      ...localResult,
      metadata: {
        ...localResult.metadata,
        warnings: [
          ...(localResult.metadata?.warnings ?? []),
          openaiResult.error
            ? `Análise IA indisponível: ${openaiResult.error}. Resultado local mantido.`
            : 'Análise IA indisponível. Resultado local mantido.',
        ],
        openai: openaiMetadata,
        processing: {
          origin: 'fallback',
          manualReviewRecommended: true,
        },
      },
    };
  }

  if (!openaiResult.correctedImageBuffer) {
    const analysisNotes = openaiResult.analysis?.notes?.trim();
    return {
      ...localResult,
      metadata: {
        ...localResult.metadata,
        warnings: [
          ...(localResult.metadata?.warnings ?? []),
          analysisNotes
            ? `IA: ${analysisNotes}`
            : 'IA analisou a captura; resultado local mantido.',
        ],
        openai: openaiMetadata,
      },
    };
  }

  return {
    processedBase64: `data:image/jpeg;base64,${openaiResult.correctedImageBuffer.toString('base64')}`,
    thumbnailBase64: undefined,
    tamanhoBytes: openaiResult.correctedImageBuffer.length,
    confiancaDeteccao: Math.max(
      localResult.confiancaDeteccao,
      openaiResult.analysis?.confidence ?? localResult.confiancaDeteccao
    ),
    fallbackUsado: openaiResult.usedGuidedLocalEnhancement ? true : localResult.fallbackUsado,
    dimensoesFinais: localResult.dimensoesFinais,
    processador: openaiResult.usedGuidedLocalEnhancement ? 'openai-guided' : 'openai',
    metadata: {
      ...localResult.metadata,
      warnings: [
        ...(localResult.metadata?.warnings ?? []),
        openaiResult.analysis?.notes
          ? `IA: ${openaiResult.analysis.notes}`
          : 'Melhoria assistida por IA aplicada.',
      ],
      openai: { ...openaiMetadata, reason: invocationReason ?? openaiMetadata.reason },
    },
  };
}

/**
 * Processa uma imagem de mapa capturada pelo colaborador.
 * Fluxo principal: detecção automática de bordas por IA (quando habilitada).
 */
export async function processMapImage(
  input: string | ProcessMapImageInput
): Promise<ProcessMapImageResult> {
  const payload: ProcessMapImageInput = typeof input === 'string' ? { imagemBase64: input } : input;
  const timer = new ProcessingTimer();
  const config = getOpenAIImageConfig();

  if (payload.manualCorners?.length === 4) {
    const manualFaithful = await tryManualFaithfulScan(payload, timer);
    if (manualFaithful) {
      return manualFaithful;
    }
  }

  if (!payload.manualCorners?.length) {
    const autoCropResult = await tryOpenAIAutoCrop(payload, timer);
    if (autoCropResult) {
      return autoCropResult;
    }
  }

  let localResult = await runLocalPipelineWithTimeout(payload, timer);
  if (isLocalTimeoutResult(localResult)) {
    return localResult;
  }
  const localProcessorMs = timer.elapsed('local') ?? 0;

  const autoCropSkip = resolveOpenAIAutoCropSkipReason(config);
  if (autoCropSkip && !payload.manualCorners?.length) {
    localResult = attachSkippedOpenAIMetadata(localResult, autoCropSkip);
  }

  const openaiOptions: OpenAIEnhancementOptions = {
    melhorarComIa: payload.melhorarComIa,
    forcarAnaliseIa: payload.forcarAnaliseIa,
    reprocessarComIa: payload.reprocessarComIa,
    priorOpenAIMetadata: payload.priorOpenAIMetadata,
  };

  const skipEnhancement =
    config.autoCropEnabled &&
    !payload.melhorarComIa &&
    !payload.reprocessarComIa &&
    !payload.forcarAnaliseIa;

  if (skipEnhancement || !shouldInvokeOpenAI(localResult, openaiOptions)) {
    return withProcessingTiming(
      localResult,
      timer.snapshot({
        localProcessorMs,
        ...localEngineTiming(localResult.processador, localProcessorMs),
      })
    );
  }

  const remainingTotal = getMapImageLocalTimeoutConfig().totalProcessingTimeoutMs - timer.totalMs();
  if (remainingTotal <= 0) {
    return withProcessingTiming(
      localResult,
      timer.snapshot({
        localProcessorMs,
        ...localEngineTiming(localResult.processador, localProcessorMs),
      })
    );
  }

  const original = decodeImageDataUrl(payload.imagemBase64);
  const invocationReason = resolveOpenAIInvocationReason(localResult, openaiOptions);
  timer.mark('openai');
  const openaiResult = await processOpenAIImageEnhancement(
    original.buffer,
    openaiOptions,
    undefined,
    invocationReason
  );
  timer.markEnd('openai');

  const openaiTimeout = openaiResult.metadata?.timeout;
  const openaiMetadata: OpenAIImageMetadata = openaiResult.metadata ?? {
    called: true,
    attempted: true,
    success: openaiResult.success,
    model: openaiResult.model,
    durationMs: openaiResult.durationMs ?? timer.elapsed('openai'),
    analysis: openaiResult.analysis,
    error: openaiResult.error,
    usedGuidedLocalEnhancement: openaiResult.usedGuidedLocalEnhancement,
    cacheHit: openaiResult.cacheHit,
    timeout: openaiTimeout,
    reason: invocationReason,
  };

  let merged = mergeOpenAIEnhancement(localResult, openaiResult, openaiMetadata, invocationReason);

  if (openaiResult.correctedImageBuffer) {
    timer.mark('thumbnail');
    const correctedMeta = await sharp(openaiResult.correctedImageBuffer, {
      failOn: 'none',
    }).metadata();
    const thumbnailBase64 = await createThumbnailFromBuffer(openaiResult.correctedImageBuffer);
    timer.markEnd('thumbnail');
    merged = {
      ...merged,
      thumbnailBase64,
      dimensoesFinais: {
        width: correctedMeta.width ?? localResult.dimensoesFinais.width,
        height: correctedMeta.height ?? localResult.dimensoesFinais.height,
      },
    };
  }

  return withProcessingTiming(
    merged,
    timer.snapshot({
      ...openaiTimingFields(openaiMetadata),
      localProcessorMs,
      thumbnailMs: timer.elapsed('thumbnail'),
      ...localEngineTiming(localResult.processador, localProcessorMs),
    })
  );
}

export { shouldInvokeOpenAI, shouldInvokeOpenAIAutoCrop } from './openai-image-processor.js';
export type { ProcessingTimingMetadata } from './map-image-processing-timing.js';
export type { ProcessingDecisionMetadata } from './map-image-processing-decision.js';
