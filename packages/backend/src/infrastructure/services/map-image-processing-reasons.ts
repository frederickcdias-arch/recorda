export type MapProcessingFailureReason =
  | 'ai_disabled'
  | 'ai_missing_key'
  | 'ai_no_corners'
  | 'ai_invalid_corners'
  | 'ai_low_confidence'
  | 'ai_geometry_rejected'
  | 'local_timeout'
  | 'local_failed'
  | 'sharp_fallback_zero_confidence'
  | 'ai_no_valid_corners_and_local_failed'
  | 'ai_warp_timeout'
  | 'ai_warp_failed';

export const MAP_PROCESSING_FAILURE_REASONS = new Set<MapProcessingFailureReason>([
  'ai_disabled',
  'ai_missing_key',
  'ai_no_corners',
  'ai_invalid_corners',
  'ai_low_confidence',
  'ai_geometry_rejected',
  'local_timeout',
  'local_failed',
  'sharp_fallback_zero_confidence',
  'ai_no_valid_corners_and_local_failed',
  'ai_warp_timeout',
  'ai_warp_failed',
]);

export const MAP_PROCESSING_RETAKE_USER_MESSAGES: Record<MapProcessingFailureReason, string> = {
  ai_disabled:
    'Detecção automática por IA não está habilitada. Verifique a configuração ou tire novamente enquadrando a folha inteira.',
  ai_missing_key:
    'IA não foi acionada (configuração incompleta). Tire novamente enquadrando a folha inteira.',
  ai_no_corners:
    'IA não detectou as bordas com segurança. Tire novamente enquadrando a folha inteira.',
  ai_invalid_corners:
    'IA não detectou as bordas com segurança. Tire novamente enquadrando a folha inteira.',
  ai_low_confidence:
    'IA não detectou as bordas com segurança. Tire novamente enquadrando a folha inteira.',
  ai_geometry_rejected:
    'IA não detectou a folha inteira com segurança. Enquadre toda a folha branca, não só a imagem interna.',
  local_timeout:
    'Processamento demorou demais. Tire novamente em local mais iluminado e enquadre a folha inteira.',
  local_failed: 'Resultado local falhou. Tire novamente enquadrando a folha inteira.',
  sharp_fallback_zero_confidence:
    'Não conseguimos corrigir esta foto. Tire novamente enquadrando a folha inteira.',
  ai_no_valid_corners_and_local_failed:
    'IA não detectou as bordas e o processamento local falhou. Tire novamente enquadrando a folha inteira.',
  ai_warp_timeout:
    'Não conseguimos corrigir esta foto automaticamente. Tire novamente enquadrando a folha inteira.',
  ai_warp_failed:
    'Não conseguimos corrigir esta foto automaticamente. Tire novamente enquadrando a folha inteira.',
};

export function isMapProcessingFailureReason(
  reason: string | undefined
): reason is MapProcessingFailureReason {
  return Boolean(
    reason && MAP_PROCESSING_FAILURE_REASONS.has(reason as MapProcessingFailureReason)
  );
}

export function resolveRetakeUserMessage(reason: string | undefined): string {
  if (reason && isMapProcessingFailureReason(reason)) {
    return MAP_PROCESSING_RETAKE_USER_MESSAGES[reason];
  }
  return MAP_PROCESSING_RETAKE_USER_MESSAGES.sharp_fallback_zero_confidence;
}

export function mapOpenAISkipReasonToFailureReason(
  skippedReason: string | undefined
): MapProcessingFailureReason | undefined {
  if (skippedReason === 'disabled' || skippedReason === 'auto_crop_disabled') {
    return 'ai_disabled';
  }
  if (skippedReason === 'missing_api_key') {
    return 'ai_missing_key';
  }
  return undefined;
}

export function mapAICornersRejectionToFailureReason(
  rejectionReason: string | undefined
): MapProcessingFailureReason | undefined {
  switch (rejectionReason) {
    case 'missing_corners':
    case 'document_not_detected':
      return 'ai_no_corners';
    case 'corners_out_of_bounds':
      return 'ai_invalid_corners';
    case 'invalid_geometry':
    case 'inner_content_detected':
      return 'ai_geometry_rejected';
    case 'low_confidence':
    case 'auto_crop_not_recommended':
      return 'ai_low_confidence';
    default:
      return undefined;
  }
}

export function resolveSharpFallbackFailureReason(params: {
  openaiAttempted?: boolean;
  aiRejectionReason?: string;
}): MapProcessingFailureReason {
  if (params.openaiAttempted && params.aiRejectionReason) {
    return 'ai_no_valid_corners_and_local_failed';
  }
  if (params.openaiAttempted) {
    return 'sharp_fallback_zero_confidence';
  }
  return 'local_failed';
}
