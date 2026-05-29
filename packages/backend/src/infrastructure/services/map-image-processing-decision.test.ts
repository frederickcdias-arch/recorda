import { describe, expect, it } from 'vitest';
import {
  attachProcessingDecision,
  PRODUCTION_RETAKE_MESSAGE,
  resolveProcessingDecision,
} from './map-image-processing-decision.js';
import type { ProcessMapImageResult } from './map-image-processor.js';

function baseResult(overrides: Partial<ProcessMapImageResult> = {}): ProcessMapImageResult {
  return {
    processedBase64: 'data:image/jpeg;base64,abc',
    tamanhoBytes: 100,
    confiancaDeteccao: 0.9,
    fallbackUsado: false,
    dimensoesFinais: { width: 800, height: 600 },
    processador: 'openai-corners',
    metadata: {},
    ...overrides,
  };
}

describe('map-image-processing-decision', () => {
  it('corners válidos → status ready / approve', () => {
    const decision = resolveProcessingDecision(
      baseResult({
        metadata: {
          aiCorners: {
            source: 'openai',
            applied: true,
            warpSuccess: true,
            confidence: 0.91,
            geometryValid: true,
          },
        },
      })
    );

    expect(decision.status).toBe('ready');
    expect(decision.userActionRequired).toBe('approve');
    expect(decision.manualAdjustmentIsPrimary).toBe(false);
  });

  it('warp IA com sucesso → status ready', () => {
    const decision = resolveProcessingDecision(
      baseResult({
        processador: 'openai-corners-fast-warp',
        metadata: {
          aiCorners: {
            source: 'openai',
            applied: true,
            warpSuccess: true,
            confidence: 0.91,
            geometryValid: true,
          },
          processing: { origin: 'openai-corners-fast-warp' },
        },
      })
    );

    expect(decision.status).toBe('ready');
  });

  it('ai_warp_timeout → retake', () => {
    const decision = resolveProcessingDecision(
      baseResult({
        confiancaDeteccao: 0,
        processador: 'openai-corners-warp-failed',
        metadata: {
          aiCorners: {
            source: 'openai',
            applied: false,
            detected: true,
            valid: true,
            appliedToWarp: true,
            warpSuccess: false,
            warpTimeout: true,
          },
          processing: { origin: 'openai-corners-warp-failed', failureStage: 'ai_warp' },
        },
      })
    );

    expect(decision.status).toBe('retake');
    expect(decision.reason).toBe('ai_warp_timeout');
  });

  it('confidence baixa → status retake', () => {
    const decision = resolveProcessingDecision(
      baseResult({
        confiancaDeteccao: 0.35,
        metadata: {
          aiCorners: {
            source: 'openai',
            applied: false,
            confidence: 0.35,
            rejectionReason: 'low_confidence',
          },
        },
      })
    );

    expect(decision.status).toBe('retake');
    expect(decision.reason).toBe('ai_low_confidence');
    expect(decision.userActionRequired).toBe('retake');
    expect(decision.manualAdjustmentRecommended).toBe(true);
  });

  it('partial_document/cropped → status retake', () => {
    const decision = resolveProcessingDecision(
      baseResult({
        confiancaDeteccao: 0.5,
        metadata: {
          openai: {
            called: true,
            attempted: true,
            success: false,
            analysis: {
              documentDetected: true,
              quality: 'poor',
              recommendedAction: 'retake',
              problems: ['partial_document', 'cropped'],
              confidence: 0.5,
              notes: 'Documento cortado.',
            },
          },
        },
      })
    );

    expect(decision.status).toBe('retake');
    expect(decision.reason).toBe(PRODUCTION_RETAKE_MESSAGE);
  });

  it('IA timeout + local OK → ready com origin local', () => {
    const decision = resolveProcessingDecision(
      baseResult({
        confiancaDeteccao: 0.62,
        fallbackUsado: true,
        processador: 'python-opencv',
        metadata: {
          openai: {
            called: true,
            attempted: true,
            success: false,
            timeout: true,
          },
        },
      })
    );

    expect(decision.status).toBe('ready');
    expect(decision.userActionRequired).toBe('approve');
  });

  it('sharp-fallback zero confidence → retake com reason específico', () => {
    const decision = resolveProcessingDecision(
      baseResult({
        confiancaDeteccao: 0,
        fallbackUsado: true,
        processador: 'sharp-fallback',
        metadata: {
          openai: { called: true, attempted: true, success: true },
          aiCorners: {
            source: 'openai',
            applied: false,
            rejectionReason: 'missing_corners',
          },
        },
      })
    );

    expect(decision.status).toBe('retake');
    expect(decision.reason).toBe('ai_no_valid_corners_and_local_failed');
    expect(decision.userMessage).toContain('IA não detectou');
  });

  it('IA timeout + local ruim → retake', () => {
    const decision = resolveProcessingDecision(
      baseResult({
        confiancaDeteccao: 0.2,
        fallbackUsado: true,
        processador: 'sharp-fallback',
        metadata: {
          decision: 'manual_review_recommended',
          openai: {
            called: true,
            attempted: true,
            success: false,
            timeout: true,
          },
        },
      })
    );

    expect(decision.status).toBe('retake');
  });

  it('manualAdjustmentIsPrimary sempre false', () => {
    const decision = resolveProcessingDecision(
      baseResult({
        confiancaDeteccao: 0.1,
        metadata: { decision: 'manual_review_recommended' },
      })
    );

    expect(decision.manualAdjustmentIsPrimary).toBe(false);
  });

  it('attachProcessingDecision registra metadata e warning de refoto', () => {
    const result = attachProcessingDecision(
      baseResult({
        confiancaDeteccao: 0.2,
        metadata: {
          documentClass: 'low_confidence_capture',
        },
      })
    );

    expect(result.metadata?.processingDecision?.status).toBe('retake');
    expect(result.metadata?.processingDecision?.reason).toBe('local_failed');
    expect(result.metadata?.warnings?.[0]).toContain('Resultado local falhou');
    expect(result.processedBase64).toContain('data:image/');
  });

  it('local timeout → status retake com reason local_timeout', () => {
    const decision = resolveProcessingDecision(
      baseResult({
        confiancaDeteccao: 0,
        metadata: {
          processing: { origin: 'local', localTimeout: true },
        },
      })
    );

    expect(decision.status).toBe('retake');
    expect(decision.reason).toBe('local_timeout');
    expect(decision.manualAdjustmentIsPrimary).toBe(false);
  });

  it('registra totalMs via pipeline quando processingTiming presente', () => {
    const result = attachProcessingDecision(
      baseResult({
        metadata: {
          processingTiming: { totalMs: 1200 },
          aiCorners: { source: 'openai', applied: true, confidence: 0.9 },
        },
      })
    );

    expect(result.metadata?.processingTiming?.totalMs).toBe(1200);
    expect(result.metadata?.processingDecision?.confidence).toBeGreaterThan(0);
  });
});
