import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  getBatchProductionSummary,
  getCaptureFlowStatusLabel,
  getOpenAIHint,
  getProcessingDebugHint,
  getProcessingDelayWarning,
  getProductionStatusBadge,
  getRotatingProcessingLabel,
  PROCESSING_SLOW_MS,
  PROCESSING_VERY_SLOW_MS,
  resolveProductionItemStatus,
  resolveRetakeUserMessage,
  shouldShowManualBorderAdjust,
  shouldShowPrimaryApprove,
  shouldShowPrimaryRetake,
  type CapturaMapaIaItemState,
} from './capturaMapaIaUi';

function item(overrides: Partial<CapturaMapaIaItemState> = {}): CapturaMapaIaItemState {
  return {
    status: 'pronta',
    confidence: 'high',
    result: {
      processamento: {
        engine: 'openai-corners',
        fallback: false,
        metadata: {
          processingDecision: {
            status: 'ready',
            userActionRequired: 'approve',
            manualAdjustmentIsPrimary: false,
          },
        },
      },
    },
    ...overrides,
  };
}

describe('capturaMapaIaUi — fluxo de produção', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('imagem ready mostra Aprovar como ação principal', () => {
    expect(shouldShowPrimaryApprove(item({ status: 'pronta' }))).toBe(true);
    expect(shouldShowPrimaryRetake(item({ status: 'pronta' }))).toBe(false);
  });

  it('imagem retake mostra Tirar nova foto como ação principal', () => {
    expect(shouldShowPrimaryRetake(item({ status: 'refazer' }))).toBe(true);
    expect(shouldShowPrimaryApprove(item({ status: 'refazer' }))).toBe(false);
  });

  it('ajuste manual não aparece como ação principal para colaborador', () => {
    expect(shouldShowManualBorderAdjust(item({ status: 'refazer' }))).toBe(false);
    expect(shouldShowManualBorderAdjust(item({ status: 'pronta' }), { showAdvanced: false })).toBe(
      false
    );
  });

  it('ajuste manual disponível em opções avançadas ou admin', () => {
    expect(shouldShowManualBorderAdjust(item({ status: 'pronta' }), { showAdvanced: true })).toBe(
      true
    );
    expect(shouldShowManualBorderAdjust(item({ status: 'pronta' }), { isAdmin: true })).toBe(true);
  });

  it('batch mostra contagem de prontas/refazer', () => {
    expect(
      getBatchProductionSummary([
        item({ status: 'pronta' }),
        item({ status: 'pronta' }),
        item({ status: 'pronta' }),
        item({ status: 'refazer' }),
      ])
    ).toBe('3 prontas, 1 precisa refazer');
  });

  it('aviso de demora não recomenda ajuste manual', () => {
    expect(getProcessingDelayWarning(PROCESSING_SLOW_MS)).toBe(
      'Processamento demorando mais que o normal.'
    );
    expect(getProcessingDelayWarning(PROCESSING_VERY_SLOW_MS)).toBe(
      'Se demorar, refaça a foto em melhor iluminação.'
    );
  });

  it('processamento automático rotaciona mensagens', () => {
    expect(getRotatingProcessingLabel(0)).toBe('Processando automaticamente...');
    expect(getRotatingProcessingLabel(2600)).toBe('Detectando bordas...');
  });

  it('status retake usa mensagem de refoto', () => {
    expect(
      getCaptureFlowStatusLabel({
        status: 'refazer',
        result: {
          processamento: {
            metadata: {
              processingDecision: {
                status: 'retake',
                reason: 'ai_no_corners',
                userMessage: resolveRetakeUserMessage('ai_no_corners'),
              },
            },
          },
        },
      })
    ).toBe('IA não detectou as bordas com segurança.');
  });

  it('refoto por sharp-fallback zero não parece sucesso local', () => {
    expect(
      getProductionStatusBadge({
        engine: 'sharp-fallback',
        fallback: true,
        metadata: {
          processingDecision: { status: 'retake', reason: 'sharp_fallback_zero_confidence' },
          processing: { localFailed: true },
        },
      })
    ).toBe('Foto precisa ser refeita');

    expect(
      getOpenAIHint({
        engine: 'sharp-fallback',
        fallback: true,
        metadata: {
          processingDecision: {
            status: 'retake',
            reason: 'sharp_fallback_zero_confidence',
            userMessage: resolveRetakeUserMessage('sharp_fallback_zero_confidence'),
          },
          processing: { localFailed: true },
        },
      })
    ).toContain('Não conseguimos corrigir');
  });

  it('refoto por IA sem corners mostra mensagem correta', () => {
    expect(resolveRetakeUserMessage('ai_no_corners')).toBe(
      'IA não detectou as bordas com segurança.'
    );
    expect(resolveRetakeUserMessage('ai_missing_key')).toBe(
      'IA não foi acionada. Verifique configuração.'
    );
  });

  it('debug hint mostra se IA foi chamada em dev', () => {
    expect(
      getProcessingDebugHint({
        engine: 'sharp-fallback',
        metadata: {
          openai: { called: true, attempted: true, success: false },
          aiCorners: { applied: false, rejectionReason: 'missing_corners' },
          processingDecision: { reason: 'ai_no_valid_corners_and_local_failed' },
        },
      })
    ).toContain('IA chamada: sim');
  });

  it('badge de produção para resultado local', () => {
    expect(
      getProductionStatusBadge({
        engine: 'python-opencv',
        fallback: true,
        metadata: {
          processingDecision: { status: 'ready' },
          openai: { called: true, attempted: true, timeout: true, success: false },
        },
      })
    ).toBe('Resultado local');
  });

  it('local timeout mapeia para refazer foto', () => {
    expect(
      resolveProductionItemStatus({
        metadata: {
          processingDecision: { status: 'retake', reason: 'local_timeout' },
          processing: { localTimeout: true },
        },
      })
    ).toBe('refazer');
  });

  it('debug hint separa bordas detectadas de correção aplicada', () => {
    expect(
      getProcessingDebugHint({
        engine: 'openai-corners-fast-warp',
        metadata: {
          openai: { called: true, attempted: true, success: true },
          aiCorners: {
            detected: true,
            valid: true,
            warpSuccess: true,
            applied: true,
          },
          processingDecision: { status: 'ready' },
        },
      })
    ).toContain('Bordas detectadas: sim');
    expect(
      getProcessingDebugHint({
        engine: 'openai-corners-warp-failed',
        metadata: {
          openai: { called: true, attempted: true, success: true },
          aiCorners: {
            detected: true,
            valid: true,
            appliedToWarp: true,
            warpSuccess: false,
            warpTimeout: true,
          },
          processing: { failureStage: 'ai_warp' },
          processingDecision: { reason: 'ai_warp_timeout' },
        },
      })
    ).toContain('Correção por IA: falhou');
  });

  it('ai_warp_timeout mostra mensagem de refoto adequada', () => {
    expect(resolveRetakeUserMessage('ai_warp_timeout')).toContain(
      'Não conseguimos corrigir esta foto automaticamente'
    );
  });

  it('badge retake quando foto precisa ser refeita', () => {
    expect(getProductionStatusBadge(null, 'refazer')).toBe('Foto precisa ser refeita');
  });
});
