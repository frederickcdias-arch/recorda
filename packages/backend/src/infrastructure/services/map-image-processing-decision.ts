import type { ProcessMapImageResult } from './map-image-processor.js';
import {
  isMapProcessingFailureReason,
  mapAICornersRejectionToFailureReason,
  mapOpenAISkipReasonToFailureReason,
  MAP_PROCESSING_FAILURE_REASONS,
  resolveRetakeUserMessage,
  resolveSharpFallbackFailureReason,
  type MapProcessingFailureReason,
} from './map-image-processing-reasons.js';
import { resolveAICornersFailureReason } from './openai-corners-processor.js';

export type ProcessingDecisionStatus = 'ready' | 'retake' | 'original' | 'failed';
export type ProcessingUserActionRequired = 'approve' | 'retake' | 'none';

export interface ProcessingDecisionMetadata {
  status: ProcessingDecisionStatus;
  reason: string;
  confidence: number;
  userActionRequired: ProcessingUserActionRequired;
  manualAdjustmentRecommended: boolean;
  manualAdjustmentIsPrimary: false;
  userMessage?: string;
}

export const PRODUCTION_RETAKE_MESSAGE =
  'Não conseguimos corrigir esta foto com segurança. Tire novamente em local mais iluminado e enquadre o mapa inteiro.';

const RETAKE_PROBLEMS = new Set([
  'partial_document',
  'cropped',
  'blur',
  'severe_blur',
  'out_of_frame',
  'motion_blur',
]);

const RETAKE_REJECTIONS = new Set([
  'low_confidence',
  'document_not_detected',
  'missing_corners',
  'invalid_geometry',
  'corners_out_of_bounds',
  'auto_crop_not_recommended',
  'inner_content_detected',
  ...MAP_PROCESSING_FAILURE_REASONS,
]);

function buildDecision(
  status: ProcessingDecisionStatus,
  reason: string,
  confidence: number,
  userActionRequired: ProcessingUserActionRequired,
  manualAdjustmentRecommended: boolean
): ProcessingDecisionMetadata {
  const userMessage =
    status === 'retake' || status === 'failed' ? resolveRetakeUserMessage(reason) : undefined;

  return {
    status,
    reason,
    confidence,
    userActionRequired,
    manualAdjustmentRecommended,
    manualAdjustmentIsPrimary: false,
    userMessage,
  };
}

function collectProblems(result: ProcessMapImageResult): string[] {
  const metadata = result.metadata;
  const openaiProblems = metadata?.openai?.analysis?.problems ?? [];
  const analysisProblems = metadata?.openai?.problems ?? [];
  return [...openaiProblems, ...analysisProblems];
}

function hasRetakeProblem(result: ProcessMapImageResult): boolean {
  return collectProblems(result).some((problem) => RETAKE_PROBLEMS.has(problem));
}

function isSharpFallbackZeroConfidence(result: ProcessMapImageResult): boolean {
  return result.processador === 'sharp-fallback' && Number(result.confiancaDeteccao ?? 0) <= 0;
}

function resolveAiFailureReason(
  result: ProcessMapImageResult
): MapProcessingFailureReason | undefined {
  const aiCorners = result.metadata?.aiCorners;
  const mappedRejection =
    resolveAICornersFailureReason(aiCorners?.rejectionReason) ??
    mapAICornersRejectionToFailureReason(aiCorners?.rejectionReason);

  if (mappedRejection) {
    return mappedRejection;
  }

  const openai = result.metadata?.openai;
  if (openai?.skippedReason) {
    return mapOpenAISkipReasonToFailureReason(openai.skippedReason);
  }

  if (openai?.attempted && !openai.success && !openai.analysis) {
    return 'ai_no_corners';
  }

  return undefined;
}

export function resolveProcessingDecision(
  result: ProcessMapImageResult
): ProcessingDecisionMetadata {
  const metadata = result.metadata ?? {};
  const confidence = Number(result.confiancaDeteccao ?? metadata.openai?.confidence ?? 0);
  const aiCorners = metadata.aiCorners;
  const openai = metadata.openai;
  const analysis = openai?.analysis;
  const rejectionReason = aiCorners?.rejectionReason;

  if (metadata.processing?.localTimeout) {
    return buildDecision('retake', 'local_timeout', confidence, 'retake', false);
  }

  if (
    metadata.processing?.failureStage === 'ai_warp' ||
    aiCorners?.warpTimeout ||
    (aiCorners?.appliedToWarp && aiCorners?.warpSuccess === false)
  ) {
    const reason = aiCorners?.warpTimeout ? 'ai_warp_timeout' : 'ai_warp_failed';
    return buildDecision('retake', reason, confidence, 'retake', false);
  }

  if (isSharpFallbackZeroConfidence(result)) {
    const aiFailureReason = resolveAiFailureReason(result);
    const reason = aiFailureReason
      ? openai?.attempted
        ? 'ai_no_valid_corners_and_local_failed'
        : aiFailureReason
      : resolveSharpFallbackFailureReason({
          openaiAttempted: openai?.attempted,
          aiRejectionReason: rejectionReason,
        });
    return buildDecision('retake', reason, confidence, 'retake', false);
  }

  if (
    openai?.skippedReason &&
    !openai.attempted &&
    isMapProcessingFailureReason(mapOpenAISkipReasonToFailureReason(openai.skippedReason))
  ) {
    const reason = mapOpenAISkipReasonToFailureReason(openai.skippedReason)!;
    if (confidence <= 0 && result.fallbackUsado) {
      return buildDecision('retake', reason, confidence, 'retake', false);
    }
  }

  if (metadata.decision === 'safe_fallback' && confidence < 0.25) {
    return buildDecision('failed', 'sharp_fallback_zero_confidence', confidence, 'retake', true);
  }

  if (analysis?.recommendedAction === 'retake' || hasRetakeProblem(result)) {
    return buildDecision('retake', PRODUCTION_RETAKE_MESSAGE, confidence, 'retake', true);
  }

  if (
    analysis?.recommendedAction === 'manual_adjust' &&
    aiCorners?.applied === false &&
    (aiCorners?.confidence ?? analysis.confidence ?? confidence) < 0.55
  ) {
    const reason =
      resolveAICornersFailureReason(rejectionReason) ??
      mapAICornersRejectionToFailureReason(rejectionReason) ??
      'ai_low_confidence';
    return buildDecision('retake', reason, confidence, 'retake', true);
  }

  if (metadata.documentClass === 'low_confidence_capture') {
    return buildDecision('retake', 'local_failed', confidence, 'retake', true);
  }

  if (
    rejectionReason &&
    RETAKE_REJECTIONS.has(rejectionReason) &&
    confidence < 0.55 &&
    !aiCorners?.applied
  ) {
    const reason =
      resolveAICornersFailureReason(rejectionReason) ??
      mapAICornersRejectionToFailureReason(rejectionReason) ??
      'ai_low_confidence';
    return buildDecision('retake', reason, confidence, 'retake', true);
  }

  if (openai?.attempted && aiCorners?.applied === false && confidence < 0.55) {
    const reason =
      resolveAICornersFailureReason(rejectionReason) ??
      mapAICornersRejectionToFailureReason(rejectionReason) ??
      'ai_no_corners';
    return buildDecision('retake', reason, confidence, 'retake', false);
  }

  if (
    (aiCorners?.warpSuccess || aiCorners?.applied) &&
    (aiCorners.confidence ?? confidence) >= 0.65
  ) {
    return buildDecision(
      'ready',
      'Bordas detectadas e corrigidas automaticamente.',
      aiCorners.confidence ?? confidence,
      'approve',
      false
    );
  }

  if (!result.fallbackUsado && confidence >= 0.6) {
    return buildDecision(
      'ready',
      'Documento corrigido automaticamente.',
      confidence,
      'approve',
      false
    );
  }

  if ((openai?.timeout || openai?.error) && confidence >= 0.5 && !result.fallbackUsado) {
    return buildDecision(
      'ready',
      'Resultado local mantido após indisponibilidade da IA.',
      confidence,
      'approve',
      false
    );
  }

  if (result.fallbackUsado && confidence >= 0.45 && !isSharpFallbackZeroConfidence(result)) {
    return buildDecision(
      'ready',
      'Correção automática parcial; revise antes de aprovar.',
      confidence,
      'approve',
      false
    );
  }

  if (analysis?.recommendedAction === 'use_original') {
    return buildDecision(
      'original',
      'Original pode ser suficiente; revise ou refaça a foto se necessário.',
      confidence,
      'approve',
      false
    );
  }

  if (confidence < 0.4 || (metadata.decision === 'manual_review_recommended' && confidence < 0.5)) {
    const reason =
      openai?.attempted && aiCorners?.applied === false
        ? (resolveAICornersFailureReason(rejectionReason) ??
          mapAICornersRejectionToFailureReason(rejectionReason) ??
          'ai_no_valid_corners_and_local_failed')
        : PRODUCTION_RETAKE_MESSAGE;
    return buildDecision('retake', reason, confidence, 'retake', true);
  }

  return buildDecision('ready', 'Pronto para revisar.', confidence, 'approve', false);
}

export function attachProcessingDecision(result: ProcessMapImageResult): ProcessMapImageResult {
  const processingDecision = resolveProcessingDecision(result);
  const warnings = [...(result.metadata?.warnings ?? [])];
  const userMessage = processingDecision.userMessage ?? PRODUCTION_RETAKE_MESSAGE;

  if (
    (processingDecision.status === 'retake' || processingDecision.status === 'failed') &&
    !warnings.includes(userMessage)
  ) {
    warnings.unshift(userMessage);
  }

  return {
    ...result,
    metadata: {
      ...result.metadata,
      processingDecision,
      warnings,
      processing: {
        ...result.metadata?.processing,
        origin: result.metadata?.processing?.origin ?? 'local',
        manualReviewRecommended:
          processingDecision.status === 'retake' || processingDecision.manualAdjustmentRecommended,
      },
    },
  };
}

export { resolveRetakeUserMessage } from './map-image-processing-reasons.js';
