export interface CapturaMapaOpenAIMetadata {
  called?: boolean;
  attempted?: boolean;
  success?: boolean;
  cacheHit?: boolean;
  error?: string;
  timeout?: boolean;
  skippedReason?: 'disabled' | 'missing_api_key' | 'auto_crop_disabled';
  usedGuidedLocalEnhancement?: boolean;
  analysis?: {
    quality?: string;
    recommendedAction?: string;
    notes?: string;
    problems?: string[];
    corners?: unknown;
  };
  problems?: string[];
}

export interface CapturaMapaAIWarpMetadata {
  attempted?: boolean;
  method?: string;
  success?: boolean;
  timeout?: boolean;
  durationMs?: number;
  pythonStartupMs?: number;
  cv2ImportMs?: number;
  warpMs?: number;
  outputMs?: number;
  inputWidth?: number;
  inputHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
  error?: string;
}

export interface CapturaMapaAICornersMetadata {
  applied?: boolean;
  detected?: boolean;
  valid?: boolean;
  appliedToWarp?: boolean;
  warpSuccess?: boolean;
  warpError?: string;
  warpTimeout?: boolean;
  confidence?: number;
  rejectionReason?: string;
  geometryValid?: boolean;
}

export interface CapturaMapaProcessingDecisionMetadata {
  status?: 'ready' | 'retake' | 'original' | 'failed';
  reason?: string;
  confidence?: number;
  userActionRequired?: 'approve' | 'retake' | 'none';
  manualAdjustmentRecommended?: boolean;
  manualAdjustmentIsPrimary?: false;
  userMessage?: string;
}

export interface CapturaMapaProcessamentoMetadata {
  decision?:
    | 'frontend_assisted'
    | 'python_detected'
    | 'backend_manual_corners'
    | 'backend_detected_corners'
    | 'safe_fallback'
    | 'manual_review_recommended';
  documentClass?: 'map_document' | 'color_document' | 'text_document' | 'low_confidence_capture';
  openai?: CapturaMapaOpenAIMetadata;
  aiCorners?: CapturaMapaAICornersMetadata;
  aiWarp?: CapturaMapaAIWarpMetadata;
  processing?: {
    origin?: string;
    engine?: string;
    failureStage?: string;
    manualReviewRecommended?: boolean;
    localTimeout?: boolean;
    localFailed?: boolean;
  };
  processingTiming?: {
    aiWarpMs?: number;
    pythonStartupMs?: number;
    cv2ImportMs?: number;
    warpStageMs?: number;
    outputMs?: number;
  };
  processingDecision?: CapturaMapaProcessingDecisionMetadata;
  warnings?: string[];
}

export interface CapturaMapaProcessamentoInfo {
  status?: string | null;
  engine?: string | null;
  fallback?: boolean;
  metadata?: CapturaMapaProcessamentoMetadata | null;
}

export type ProductionItemStatus =
  | 'processando'
  | 'pronta'
  | 'refazer'
  | 'aprovada'
  | 'erro'
  | 'aguardando'
  | 'corrigindo';

export interface CapturaMapaIaItemState {
  status: string;
  confidence: 'high' | 'low' | 'none';
  processingStartedAt?: number;
  preferirOriginal?: boolean;
  result: {
    processamento: CapturaMapaProcessamentoInfo;
  } | null;
}

export const PRODUCTION_RETAKE_MESSAGE =
  'Não conseguimos corrigir esta foto com segurança. Tire novamente em local mais iluminado e enquadre o mapa inteiro.';

const RETAKE_REASON_MESSAGES: Record<string, string> = {
  ai_disabled: 'IA não foi acionada. Verifique configuração.',
  ai_missing_key: 'IA não foi acionada. Verifique configuração.',
  ai_no_corners: 'IA não detectou as bordas com segurança.',
  ai_invalid_corners: 'IA não detectou as bordas com segurança.',
  ai_low_confidence: 'IA não detectou as bordas com segurança.',
  ai_geometry_rejected:
    'IA não detectou a folha inteira com segurança. Enquadre toda a folha branca.',
  local_timeout: PRODUCTION_RETAKE_MESSAGE,
  local_failed: 'Resultado local falhou.',
  sharp_fallback_zero_confidence: 'Não conseguimos corrigir esta foto.',
  ai_no_valid_corners_and_local_failed: 'IA não detectou as bordas e o processamento local falhou.',
  ai_warp_timeout:
    'Não conseguimos corrigir esta foto automaticamente. Tire novamente enquadrando a folha inteira.',
  ai_warp_failed:
    'Não conseguimos corrigir esta foto automaticamente. Tire novamente enquadrando a folha inteira.',
};

export function resolveRetakeUserMessage(
  reason: string | undefined,
  processamento?: CapturaMapaProcessamentoInfo | null
): string {
  const decisionMessage = processamento?.metadata?.processingDecision?.userMessage;
  if (decisionMessage) {
    return decisionMessage;
  }
  if (reason && RETAKE_REASON_MESSAGES[reason]) {
    return RETAKE_REASON_MESSAGES[reason];
  }
  return PRODUCTION_RETAKE_MESSAGE;
}

export function getProcessingDebugHint(
  processamento: CapturaMapaProcessamentoInfo | null | undefined
): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }

  const openai = processamento?.metadata?.openai;
  const aiCorners = processamento?.metadata?.aiCorners;
  const aiWarp = processamento?.metadata?.aiWarp;
  const timing = processamento?.metadata?.processingTiming;
  const decision = processamento?.metadata?.processingDecision;
  const parts: string[] = [];

  if (openai?.called || openai?.attempted) {
    parts.push(`IA chamada: sim (${openai.success ? 'ok' : 'falhou'})`);
  } else if (openai?.skippedReason) {
    parts.push(`IA chamada: não (${openai.skippedReason})`);
  } else {
    parts.push('IA chamada: não');
  }

  const bordersDetected =
    aiCorners?.detected ||
    aiCorners?.valid ||
    aiCorners?.geometryValid ||
    Boolean(openai?.analysis?.corners);
  parts.push(`Bordas detectadas: ${bordersDetected ? 'sim' : 'não'}`);

  if (aiCorners?.warpSuccess) {
    parts.push('Correção por IA: aplicada');
  } else if (aiCorners?.appliedToWarp) {
    parts.push(`Correção por IA: falhou${aiCorners.warpTimeout ? ' (timeout)' : ''}`);
  } else if (aiCorners?.rejectionReason) {
    parts.push(`Bordas IA: rejeitadas (${aiCorners.rejectionReason})`);
  } else if (bordersDetected) {
    parts.push('Correção por IA: não tentada');
  } else {
    parts.push('Bordas IA: ausentes');
  }

  if (decision?.reason) {
    parts.push(`Motivo: ${decision.reason}`);
  }
  if (aiWarp?.method) {
    parts.push(`Método warp: ${aiWarp.method}`);
  }
  if (aiWarp?.durationMs !== undefined) {
    parts.push(`Tempo warp: ${aiWarp.durationMs}ms`);
  } else if (timing?.aiWarpMs !== undefined) {
    parts.push(`Tempo warp: ${timing.aiWarpMs}ms`);
  }
  if (aiWarp?.pythonStartupMs !== undefined || timing?.pythonStartupMs !== undefined) {
    parts.push(`Python startup: ${aiWarp?.pythonStartupMs ?? timing?.pythonStartupMs}ms`);
  }
  if (aiWarp?.cv2ImportMs !== undefined || timing?.cv2ImportMs !== undefined) {
    parts.push(`cv2 import: ${aiWarp?.cv2ImportMs ?? timing?.cv2ImportMs}ms`);
  }
  if (processamento?.metadata?.processing?.failureStage) {
    parts.push(`Estágio: ${processamento.metadata.processing.failureStage}`);
  }
  if (processamento?.metadata?.processing?.engine || processamento?.engine) {
    parts.push(`Engine: ${processamento.metadata?.processing?.engine ?? processamento.engine}`);
  }

  return parts.join(' · ');
}

export const PROCESSING_SLOW_MS = 8_000;
export const PROCESSING_VERY_SLOW_MS = 10_000;

const ROTATING_PROCESSING_LABELS = [
  'Processando automaticamente...',
  'Detectando bordas...',
  'Corrigindo perspectiva...',
  'Aplicando melhoria local...',
] as const;

const ROTATING_LABEL_INTERVAL_MS = 2_500;

function processingElapsedMs(item: { processingStartedAt?: number }): number {
  if (!item.processingStartedAt) return 0;
  return Math.max(0, Date.now() - item.processingStartedAt);
}

export function getRotatingProcessingLabel(elapsedMs: number): string {
  const index = Math.min(
    ROTATING_PROCESSING_LABELS.length - 1,
    Math.floor(elapsedMs / ROTATING_LABEL_INTERVAL_MS)
  );
  return ROTATING_PROCESSING_LABELS[index] ?? ROTATING_PROCESSING_LABELS[0];
}

export function getProcessingDelayWarning(elapsedMs: number): string | null {
  if (elapsedMs >= PROCESSING_VERY_SLOW_MS) {
    return 'Se demorar, refaça a foto em melhor iluminação.';
  }
  if (elapsedMs >= PROCESSING_SLOW_MS) {
    return 'Processamento demorando mais que o normal.';
  }
  return null;
}

export function resolveProductionItemStatus(
  processamento: CapturaMapaProcessamentoInfo | null | undefined
): Exclude<ProductionItemStatus, 'processando' | 'aguardando' | 'corrigindo' | 'aprovada'> {
  const decision = processamento?.metadata?.processingDecision;
  if (
    decision?.status === 'retake' ||
    decision?.status === 'failed' ||
    decision?.reason === 'local_timeout' ||
    decision?.reason === 'ai_warp_timeout' ||
    decision?.reason === 'ai_warp_failed' ||
    processamento?.metadata?.processing?.localTimeout ||
    processamento?.metadata?.processing?.failureStage === 'ai_warp'
  ) {
    return 'refazer';
  }
  if (processamento?.status === 'falhou_processamento') {
    return 'refazer';
  }
  return 'pronta';
}

export function getProductionStatusLabel(item: CapturaMapaIaItemState): string {
  if (item.status === 'processando' || item.status === 'corrigindo') {
    return 'Processando automaticamente';
  }
  if (item.status === 'aguardando') {
    return item.preferirOriginal ? 'Aguardando bordas' : 'Marcar bordas';
  }
  if (item.status === 'aprovada') {
    return item.preferirOriginal ? 'Original selecionado' : 'Aprovado';
  }
  if (item.status === 'refazer') {
    return 'Foto precisa ser refeita';
  }
  if (item.status === 'pronta') {
    return item.preferirOriginal ? 'Usar original' : 'Pronto para revisar';
  }
  if (item.status === 'erro') {
    return 'Falhou';
  }
  return 'Aguardando';
}

export function getCaptureFlowStatusLabel(item: {
  status: string;
  processingStartedAt?: number;
  preferirOriginal?: boolean;
  result: { processamento: CapturaMapaProcessamentoInfo } | null;
}): string | null {
  if (item.status === 'processando' || item.status === 'corrigindo') {
    const elapsedMs = processingElapsedMs(item);
    if (elapsedMs >= PROCESSING_VERY_SLOW_MS) {
      return 'Ainda processando. Se demorar, refaça a foto.';
    }
    return getRotatingProcessingLabel(elapsedMs);
  }

  if (item.status === 'refazer') {
    return resolveRetakeUserMessage(
      item.result?.processamento.metadata?.processingDecision?.reason,
      item.result?.processamento
    );
  }

  if (item.status === 'pronta') {
    const reason = item.result?.processamento.metadata?.processingDecision?.reason;
    return reason ?? 'Pronto para revisar.';
  }

  if (item.status === 'aprovada') {
    return item.preferirOriginal ? 'Original selecionado para envio.' : 'Captura aprovada.';
  }

  if (item.status === 'aguardando') {
    return 'Marque as quatro bordas da folha antes de processar.';
  }

  return null;
}

export function getProductionStatusBadge(
  processamento: CapturaMapaProcessamentoInfo | null | undefined,
  itemStatus?: string
): string | null {
  if (itemStatus === 'refazer') {
    return 'Foto precisa ser refeita';
  }
  if (
    processamento?.engine === 'sharp-fallback' &&
    (processamento.metadata?.processingDecision?.status === 'retake' ||
      processamento.metadata?.processing?.localFailed)
  ) {
    return 'Foto precisa ser refeita';
  }
  if (itemStatus === 'aprovada') {
    return 'Aprovado';
  }

  const decision = processamento?.metadata?.processingDecision;
  if (decision?.status === 'retake' || decision?.status === 'failed') {
    return 'Foto precisa ser refeita';
  }

  const aiCorners = processamento?.metadata?.aiCorners;
  if (aiCorners?.warpSuccess || aiCorners?.applied) {
    return 'Bordas detectadas automaticamente';
  }

  if (processamento?.metadata?.openai?.timeout || processamento?.metadata?.openai?.error) {
    return 'Resultado local';
  }

  if (processamento?.fallback) {
    return 'Resultado local';
  }

  if (decision?.status === 'ready' || decision?.status === 'original') {
    return 'Pronto para revisar';
  }

  return getOpenAIStatusBadge(processamento);
}

export function getOpenAIStatusBadge(
  processamento: CapturaMapaProcessamentoInfo | null | undefined
): string | null {
  const aiCorners = processamento?.metadata?.aiCorners;
  if (aiCorners?.warpSuccess || aiCorners?.applied) {
    return 'Bordas detectadas automaticamente';
  }

  const openai = processamento?.metadata?.openai;
  if (openai?.skippedReason) {
    if (openai.skippedReason === 'auto_crop_disabled') {
      return 'Resultado local';
    }
    return 'Resultado local';
  }
  if (!openai?.called && !openai?.attempted) {
    return null;
  }
  if (openai.timeout || openai.error) {
    return 'Resultado local';
  }
  if (
    openai.success &&
    (processamento?.engine === 'openai' ||
      processamento?.engine === 'openai-guided' ||
      processamento?.engine === 'openai-corners')
  ) {
    return openai.cacheHit ? 'IA aplicada (cache)' : 'Bordas detectadas automaticamente';
  }
  if (openai.success) {
    return openai.cacheHit ? 'IA analisou (cache)' : 'IA analisou a imagem';
  }
  return 'Resultado local';
}

export function getOpenAIHint(
  processamento: CapturaMapaProcessamentoInfo | null | undefined
): string | null {
  const decision = processamento?.metadata?.processingDecision;
  const aiCorners = processamento?.metadata?.aiCorners;
  if (
    decision?.status === 'retake' ||
    decision?.status === 'failed' ||
    processamento?.metadata?.processing?.localFailed ||
    processamento?.metadata?.processing?.failureStage === 'ai_warp' ||
    (aiCorners?.appliedToWarp && !aiCorners?.warpSuccess)
  ) {
    return resolveRetakeUserMessage(decision?.reason, processamento);
  }

  if (decision?.reason === 'local_timeout' || processamento?.metadata?.processing?.localTimeout) {
    return resolveRetakeUserMessage('local_timeout', processamento);
  }

  if (aiCorners?.warpSuccess || aiCorners?.applied) {
    return 'Perspectiva corrigida automaticamente.';
  }

  const openai = processamento?.metadata?.openai;
  if (openai?.skippedReason === 'disabled' || openai?.skippedReason === 'missing_api_key') {
    return 'IA não foi acionada. Verifique configuração.';
  }
  if (openai?.skippedReason === 'auto_crop_disabled') {
    return 'Detecção automática por IA desabilitada.';
  }
  if (openai?.timeout) {
    return 'IA demorou; resultado local mantido.';
  }
  if (openai?.error) {
    return 'Processamento local aplicado.';
  }
  if (
    processamento?.engine === 'sharp-fallback' &&
    processamento?.metadata?.processing?.localFailed
  ) {
    return resolveRetakeUserMessage('sharp_fallback_zero_confidence', processamento);
  }
  if (decision?.reason && decision.status === 'ready') {
    return decision.reason;
  }
  return null;
}

export function shouldShowPrimaryApprove(item: CapturaMapaIaItemState): boolean {
  return item.status === 'pronta' && Boolean(item.result);
}

export function shouldShowPrimaryRetake(item: CapturaMapaIaItemState): boolean {
  return item.status === 'refazer';
}

export function shouldShowMelhorarComIa(
  item: CapturaMapaIaItemState,
  options: { showAdvanced?: boolean } = {}
): boolean {
  if (!options.showAdvanced) return false;
  const openai = item.result?.processamento.metadata?.openai;
  if (openai?.called || openai?.attempted) {
    return false;
  }
  if (openai?.skippedReason === 'disabled' || openai?.skippedReason === 'missing_api_key') {
    return false;
  }
  return item.status === 'pronta' || item.status === 'refazer';
}

export function shouldShowReprocessarComIa(
  item: CapturaMapaIaItemState,
  options: { showAdvanced?: boolean } = {}
): boolean {
  if (!options.showAdvanced) return false;
  if (item.status !== 'pronta' && item.status !== 'refazer') {
    return false;
  }
  const openai = item.result?.processamento.metadata?.openai;
  return Boolean(openai?.called || openai?.attempted);
}

export function shouldShowManualBorderAdjust(
  item: CapturaMapaIaItemState,
  options: { showAdvanced?: boolean; isAdmin?: boolean } = {}
): boolean {
  if (options.isAdmin) return true;
  return Boolean(options.showAdvanced && (item.status === 'pronta' || item.status === 'refazer'));
}

export function getBatchProductionSummary(items: CapturaMapaIaItemState[]): string | null {
  const prontas = items.filter(
    (item) => item.status === 'pronta' || item.status === 'aprovada'
  ).length;
  const refazer = items.filter((item) => item.status === 'refazer').length;
  const aguardando = items.filter((item) => item.status === 'aguardando').length;
  const processando = items.filter(
    (item) => item.status === 'processando' || item.status === 'corrigindo'
  ).length;

  if (prontas === 0 && refazer === 0 && processando === 0 && aguardando === 0) {
    return null;
  }

  const parts: string[] = [];
  if (aguardando > 0) parts.push(`${aguardando} aguardando bordas`);
  if (prontas > 0) parts.push(`${prontas} pronta${prontas === 1 ? '' : 's'}`);
  if (refazer > 0) parts.push(`${refazer} precisa${refazer === 1 ? '' : 'm'} refazer`);
  if (processando > 0) parts.push(`${processando} processando`);
  return parts.join(', ');
}

export function getPreferredDownloadSrc(
  originalSrc: string,
  processedSrc: string,
  preferirOriginal: boolean
): string {
  return preferirOriginal ? originalSrc : processedSrc;
}
