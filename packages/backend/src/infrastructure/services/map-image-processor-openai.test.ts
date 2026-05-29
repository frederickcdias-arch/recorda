import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sharp from 'sharp';
import {
  clearOpenAICacheForTests,
  computeOpenAIImageHash,
  prepareImageForOpenAI,
  processOpenAIImageEnhancement,
  setOpenAIFetchForTests,
  shouldInvokeOpenAI,
  type LocalMapProcessingSnapshot,
  type OpenAIImageMetadata,
} from './openai-image-processor.js';
import { getOpenAIConfigFingerprint, getOpenAIImageConfig } from '../config/openai-image-config.js';
import { processMapImage } from './map-image-processor.js';
import * as documentProcessor from './document-image-processor.js';
import * as fastWarp from './ai-corners-fast-warp.js';

const TINY_JPEG_BUFFER = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64'
);

const TINY_JPEG_DATA_URL = `data:image/jpeg;base64,${TINY_JPEG_BUFFER.toString('base64')}`;

const OTHER_JPEG_BUFFER = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAACAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmY/9k=',
  'base64'
);

function localSnapshot(
  overrides: Partial<LocalMapProcessingSnapshot> = {}
): LocalMapProcessingSnapshot {
  return {
    confiancaDeteccao: 0.9,
    fallbackUsado: false,
    processador: 'python-opencv',
    metadata: { decision: 'python_detected', documentClass: 'map_document' },
    ...overrides,
  };
}

function mockOpenAIResponse(
  analysis: Record<string, unknown>,
  status = 200,
  usage?: Record<string, number>
): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(analysis) } }],
      usage,
    }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

function successfulAnalysisMetadata(imageHash: string): OpenAIImageMetadata {
  const config = getOpenAIImageConfig();
  return {
    called: true,
    attempted: true,
    success: true,
    model: config.model,
    imageHash,
    configFingerprint: getOpenAIConfigFingerprint(config),
    analysis: {
      documentDetected: true,
      quality: 'acceptable',
      recommendedAction: 'use',
      problems: ['shadow'],
      confidence: 0.72,
      notes: 'Documento legível.',
    },
  };
}

describe('OpenAI image processor — Captura de Mapas POC', () => {
  const envBackup = { ...process.env };

  beforeEach(async () => {
    process.env = { ...envBackup };
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'false';
    clearOpenAICacheForTests();
    setOpenAIFetchForTests(null);

    const processedBuffer = await sharp({
      create: { width: 120, height: 120, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .jpeg()
      .toBuffer();

    vi.spyOn(documentProcessor, 'processDocumentImage').mockResolvedValue({
      success: true,
      processedBuffer,
      thumbnailBuffer: processedBuffer,
      outputMimeType: 'image/jpeg',
      metadata: {
        engine: 'python-opencv',
        confidence: 0.9,
        fallback: false,
        width: 120,
        height: 120,
        originalWidth: 120,
        originalHeight: 120,
        documentClass: 'map_document',
        decision: 'python_detected',
        analysis: {
          paperLikeRatio: 0.5,
          colorRatio: 0.2,
          edgeDensity: 0.3,
          dynamicRange: 0.4,
          fillFrameLikelihood: 0.5,
        },
        postprocess: {
          manualMode: null,
          cornersSource: 'detected',
          manualCornersReceived: false,
          pythonUsed: true,
          manualFinalizeUsed: false,
          borderCleanup: true,
          isolateExterior: true,
          marginMode: 'clean-white',
          paperNormalization: true,
          shadowBalance: true,
          contentPreserved: true,
        },
        warnings: [],
      },
    });
  });

  afterEach(() => {
    process.env = envBackup;
    clearOpenAICacheForTests();
    setOpenAIFetchForTests(null);
    vi.restoreAllMocks();
  });

  it('feature flag OFF não invoca OpenAI', () => {
    process.env.OPENAI_IMAGE_ENABLED = 'false';
    process.env.OPENAI_API_KEY = 'test-key';

    expect(
      shouldInvokeOpenAI(localSnapshot({ confiancaDeteccao: 0, processador: 'sharp-fallback' }), {
        melhorarComIa: false,
      })
    ).toBe(false);
  });

  it('sem API key não invoca OpenAI', () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    delete process.env.OPENAI_API_KEY;

    expect(
      shouldInvokeOpenAI(localSnapshot({ metadata: { decision: 'manual_review_recommended' } }), {})
    ).toBe(false);
  });

  it('pipeline local OK não invoca OpenAI automaticamente', () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    expect(shouldInvokeOpenAI(localSnapshot(), {})).toBe(false);
  });

  it('manual_review_recommended invoca OpenAI quando habilitado', () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    expect(
      shouldInvokeOpenAI(
        localSnapshot({
          metadata: { decision: 'manual_review_recommended' },
        }),
        {}
      )
    ).toBe(true);
  });

  it('melhorarComIa força invocação', () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    expect(shouldInvokeOpenAI(localSnapshot(), { melhorarComIa: true })).toBe(true);
  });

  it('reprocessarComIa força invocação', () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    expect(shouldInvokeOpenAI(localSnapshot(), { reprocessarComIa: true })).toBe(true);
  });

  it('OpenAI falha/timeout mantém fallback local no pipeline', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    setOpenAIFetchForTests(
      vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch
    );

    const result = await processMapImage({
      imagemBase64: TINY_JPEG_DATA_URL,
      forcarAnaliseIa: true,
    });

    expect(result.metadata?.openai?.called).toBe(true);
    expect(result.metadata?.openai?.success).toBe(false);
    expect(result.processedBase64).toContain('data:image/');
    expect(result.metadata?.warnings?.some((w) => w.includes('IA indisponível'))).toBe(true);
  });

  it('OpenAI retorna análise estruturada nos metadados', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: true,
          quality: 'acceptable',
          recommendedAction: 'use',
          problems: ['shadow'],
          confidence: 0.72,
          notes: 'Documento legível.',
        })
      ) as unknown as typeof fetch
    );

    const result = await processOpenAIImageEnhancement(
      TINY_JPEG_BUFFER,
      { forcarAnaliseIa: true },
      undefined,
      'forcar_analise_ia'
    );

    expect(result.success).toBe(true);
    expect(result.analysis).toMatchObject({
      documentDetected: true,
      quality: 'acceptable',
      recommendedAction: 'use',
      confidence: 0.72,
    });
    expect(result.metadata?.called).toBe(true);
    expect(result.metadata?.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata?.compressedBytes).toBeGreaterThan(0);
    expect(result.metadata?.reason).toBe('forcar_analise_ia');
  });

  it('OpenAI com local_correct gera corrigida guiada e preserva fluxo', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: true,
          quality: 'poor',
          recommendedAction: 'local_correct',
          problems: ['shadow', 'low_contrast'],
          confidence: 0.4,
          notes: 'Melhoria local recomendada.',
        })
      ) as unknown as typeof fetch
    );

    const pipelineResult = await processMapImage({
      imagemBase64: TINY_JPEG_DATA_URL,
      forcarAnaliseIa: true,
    });

    expect(pipelineResult.metadata?.openai?.success).toBe(true);
    expect(pipelineResult.metadata?.openai?.usedGuidedLocalEnhancement).toBe(true);
    expect(['openai', 'openai-guided']).toContain(pipelineResult.processador);
    expect(pipelineResult.processedBase64).toContain('data:image/jpeg;base64,');
  });

  it('processMapImage com flag OFF registra skippedReason disabled e processingDecision', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'false';

    const result = await processMapImage({
      imagemBase64: TINY_JPEG_DATA_URL,
      forcarAnaliseIa: true,
    });

    expect(result.metadata?.openai?.skippedReason).toBe('disabled');
    expect(result.metadata?.openai?.called).toBe(false);
    expect(result.metadata?.processingTiming?.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata?.processingDecision?.manualAdjustmentIsPrimary).toBe(false);
  });

  it('sem API key registra skippedReason missing_api_key imediatamente', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';

    const fetchMock = vi.fn(async () =>
      mockOpenAIResponse({
        documentDetected: true,
        quality: 'acceptable',
        recommendedAction: 'use',
        problems: [],
        confidence: 0.8,
        notes: 'OK',
      })
    );
    setOpenAIFetchForTests(fetchMock as unknown as typeof fetch);

    const startedAt = Date.now();
    const result = await processMapImage({ imagemBase64: TINY_JPEG_DATA_URL });
    const elapsed = Date.now() - startedAt;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.metadata?.openai?.skippedReason).toBe('missing_api_key');
    expect(elapsed).toBeLessThan(500);
  });

  it('metadata registra timeout quando OpenAI excede limite', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_IMAGE_TIMEOUT_MS = '30';

    setOpenAIFetchForTests(
      vi.fn(
        async (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({
      imagemBase64: TINY_JPEG_DATA_URL,
      melhorarComIa: true,
    });

    expect(result.metadata?.openai?.timeout).toBe(true);
    expect(result.metadata?.openai?.success).toBe(false);
    expect(result.processedBase64).toContain('data:image/');
    expect(result.metadata?.processingTiming?.openaiMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata?.processingTiming?.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('cache hit evita nova chamada OpenAI', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    const fetchMock = vi.fn(async () =>
      mockOpenAIResponse({
        documentDetected: true,
        quality: 'acceptable',
        recommendedAction: 'use',
        problems: [],
        confidence: 0.8,
        notes: 'OK',
      })
    );
    setOpenAIFetchForTests(fetchMock as unknown as typeof fetch);

    await processMapImage({
      imagemBase64: TINY_JPEG_DATA_URL,
      melhorarComIa: true,
    });

    const second = await processMapImage({
      imagemBase64: TINY_JPEG_DATA_URL,
      melhorarComIa: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.metadata?.openai?.cacheHit).toBe(true);
    expect(second.metadata?.openai?.success).toBe(true);
  });

  it('hash diferente permite nova chamada', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    const fetchMock = vi.fn(async () =>
      mockOpenAIResponse({
        documentDetected: true,
        quality: 'acceptable',
        recommendedAction: 'use',
        problems: [],
        confidence: 0.8,
        notes: 'OK',
      })
    );
    setOpenAIFetchForTests(fetchMock as unknown as typeof fetch);

    await processOpenAIImageEnhancement(TINY_JPEG_BUFFER, { melhorarComIa: true });
    await processOpenAIImageEnhancement(OTHER_JPEG_BUFFER, { melhorarComIa: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('modelo diferente permite nova chamada', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_IMAGE_MODEL = 'gpt-4.1-mini';

    const fetchMock = vi.fn(async () =>
      mockOpenAIResponse({
        documentDetected: true,
        quality: 'acceptable',
        recommendedAction: 'use',
        problems: [],
        confidence: 0.8,
        notes: 'OK',
      })
    );
    setOpenAIFetchForTests(fetchMock as unknown as typeof fetch);

    const first = await processOpenAIImageEnhancement(TINY_JPEG_BUFFER, { melhorarComIa: true });
    expect(first.metadata?.cacheHit).toBe(false);

    process.env.OPENAI_IMAGE_MODEL = 'gpt-4.1';
    clearOpenAICacheForTests();

    const prior = first.metadata;
    const second = await processOpenAIImageEnhancement(TINY_JPEG_BUFFER, {
      melhorarComIa: true,
      priorOpenAIMetadata: prior,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second.metadata?.cacheHit).toBe(false);
    expect(second.metadata?.model).toBe('gpt-4.1');
  });

  it('reprocessamento explícito força nova chamada', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    const fetchMock = vi.fn(async () =>
      mockOpenAIResponse({
        documentDetected: true,
        quality: 'acceptable',
        recommendedAction: 'use',
        problems: [],
        confidence: 0.8,
        notes: 'OK',
      })
    );
    setOpenAIFetchForTests(fetchMock as unknown as typeof fetch);

    const first = await processMapImage({
      imagemBase64: TINY_JPEG_DATA_URL,
      melhorarComIa: true,
    });

    await processMapImage({
      imagemBase64: TINY_JPEG_DATA_URL,
      reprocessarComIa: true,
      priorOpenAIMetadata: first.metadata?.openai,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('metadata registra usage quando API retorna tokens', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse(
          {
            documentDetected: true,
            quality: 'good',
            recommendedAction: 'use',
            problems: [],
            confidence: 0.95,
            notes: 'Perfeito',
          },
          200,
          { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
        )
      ) as unknown as typeof fetch
    );

    const result = await processOpenAIImageEnhancement(TINY_JPEG_BUFFER, { melhorarComIa: true });

    expect(result.metadata?.usage).toEqual({
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
    });
  });

  it('cache via priorOpenAIMetadata reutiliza análise', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    const prepared = await prepareImageForOpenAI(TINY_JPEG_BUFFER);
    const imageHash = computeOpenAIImageHash(prepared.buffer);
    const fetchMock = vi.fn(async () =>
      mockOpenAIResponse({
        documentDetected: true,
        quality: 'acceptable',
        recommendedAction: 'use',
        problems: [],
        confidence: 0.8,
        notes: 'OK',
      })
    );
    setOpenAIFetchForTests(fetchMock as unknown as typeof fetch);

    const result = await processMapImage({
      imagemBase64: TINY_JPEG_DATA_URL,
      melhorarComIa: true,
      priorOpenAIMetadata: successfulAnalysisMetadata(imageHash),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.metadata?.openai?.cacheHit).toBe(true);
  });

  it('original nunca é sobrescrito no pipeline local', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: true,
          quality: 'poor',
          recommendedAction: 'local_correct',
          problems: ['shadow'],
          confidence: 0.4,
          notes: 'Melhoria',
        })
      ) as unknown as typeof fetch
    );

    const originalPayload = TINY_JPEG_DATA_URL.split(',')[1];
    const result = await processMapImage({
      imagemBase64: TINY_JPEG_DATA_URL,
      forcarAnaliseIa: true,
    });

    expect(result.processedBase64).not.toBe(TINY_JPEG_DATA_URL);
    expect(TINY_JPEG_DATA_URL).toContain(originalPayload ?? '');
  });
});

describe('OpenAI auto crop — Captura de Mapas Lote 11', () => {
  const envBackup = { ...process.env };

  beforeEach(async () => {
    process.env = { ...envBackup };
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    clearOpenAICacheForTests();
    setOpenAIFetchForTests(null);

    const processedBuffer = await sharp({
      create: { width: 320, height: 480, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .jpeg()
      .toBuffer();

    const thumbnailBuffer = await sharp(processedBuffer).resize(160).jpeg().toBuffer();

    vi.spyOn(fastWarp, 'applyPerspectiveFromCornersFast').mockResolvedValue({
      processedBuffer,
      thumbnailBuffer,
      mimeType: 'image/jpeg',
      width: 320,
      height: 480,
      confidence: 0.92,
      warpMs: 150,
      aiWarp: {
        attempted: true,
        method: 'faithful-scan',
        success: true,
        durationMs: 150,
      },
      faithfulScan: {
        processingMode: 'faithful-scan',
        usedGenerativeAI: false,
        perspectiveCorrected: true,
        contentPreservationMode: true,
        cornerSource: 'provided',
        documentRatio: 'A1_PORTRAIT',
      },
    });

    vi.spyOn(documentProcessor, 'processDocumentImage').mockResolvedValue({
      success: true,
      processedBuffer,
      thumbnailBuffer: processedBuffer,
      outputMimeType: 'image/jpeg',
      metadata: {
        engine: 'python-opencv',
        confidence: 0.9,
        fallback: false,
        width: 320,
        height: 480,
        originalWidth: 400,
        originalHeight: 600,
        documentClass: 'map_document',
        decision: 'python_detected',
        postprocess: {
          manualMode: null,
          cornersSource: 'detected',
          manualCornersReceived: false,
          pythonUsed: true,
          manualFinalizeUsed: false,
          borderCleanup: true,
          isolateExterior: true,
          marginMode: 'clean-white',
          paperNormalization: true,
          shadowBalance: true,
          contentPreserved: true,
        },
        warnings: [],
      },
    });
  });

  afterEach(() => {
    process.env = envBackup;
    clearOpenAICacheForTests();
    setOpenAIFetchForTests(null);
    vi.restoreAllMocks();
  });

  async function createTestCapture(width = 400, height = 600) {
    const buffer = await sharp({
      create: { width, height, channels: 3, background: { r: 230, g: 230, b: 230 } },
    })
      .jpeg()
      .toBuffer();
    return {
      buffer,
      dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
      corners: {
        topLeft: { x: width * 0.1, y: height * 0.1 },
        topRight: { x: width * 0.9, y: height * 0.12 },
        bottomRight: { x: width * 0.88, y: height * 0.9 },
        bottomLeft: { x: width * 0.08, y: height * 0.88 },
      },
    };
  }

  it('feature flag OFF mantém fluxo local e registra skippedReason', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'false';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    const capture = await createTestCapture();
    const result = await processMapImage({ imagemBase64: capture.dataUrl });
    expect(result.metadata?.aiCorners).toBeUndefined();
    expect(result.metadata?.openai?.skippedReason).toBe('disabled');
  });

  it('IA retorna corners válidos e aplica openai-corners', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    const capture = await createTestCapture();

    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: true,
          confidence: 0.91,
          quality: 'good',
          recommendedAction: 'auto_crop',
          corners: capture.corners,
          imageSize: { width: 400, height: 600 },
          problems: [],
          notes: 'Documento detectado.',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: capture.dataUrl });
    expect(result.processador).toBe('openai-corners-fast-warp');
    expect(result.metadata?.aiCorners?.warpSuccess).toBe(true);
    expect(result.metadata?.processing?.origin).toBe('openai-corners-fast-warp');
  });

  it('confidence baixa não aplica crop automático', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    const capture = await createTestCapture();

    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: true,
          confidence: 0.4,
          quality: 'poor',
          recommendedAction: 'manual_adjust',
          corners: capture.corners,
          imageSize: { width: 400, height: 600 },
          problems: [],
          notes: 'Baixa confiança.',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: capture.dataUrl });
    expect(result.metadata?.aiCorners?.applied).toBe(false);
    expect(result.metadata?.aiCorners?.detected).toBe(false);
    expect(result.metadata?.aiCorners?.warpSuccess).toBeFalsy();
    expect(result.metadata?.processing?.manualReviewRecommended).toBe(true);
    expect(result.metadata?.processingDecision?.status).toBe('retake');
    expect(result.metadata?.processingDecision?.manualAdjustmentIsPrimary).toBe(false);
  });

  it('cache hit reutiliza corners sem nova chamada', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    const capture = await createTestCapture();
    const fetchMock = vi.fn(async () =>
      mockOpenAIResponse({
        documentDetected: true,
        confidence: 0.91,
        quality: 'good',
        recommendedAction: 'auto_crop',
        corners: capture.corners,
        imageSize: { width: 400, height: 600 },
        problems: [],
        notes: 'OK',
      })
    );
    setOpenAIFetchForTests(fetchMock as unknown as typeof fetch);

    await processMapImage({ imagemBase64: capture.dataUrl });
    const second = await processMapImage({ imagemBase64: capture.dataUrl });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.metadata?.openai?.cacheHit).toBe(true);
  });

  it('reprocessar ignora cache e chama API novamente', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    const capture = await createTestCapture();
    const fetchMock = vi.fn(async () =>
      mockOpenAIResponse({
        documentDetected: true,
        confidence: 0.91,
        quality: 'good',
        recommendedAction: 'auto_crop',
        corners: capture.corners,
        imageSize: { width: 400, height: 600 },
        problems: [],
        notes: 'OK',
      })
    );
    setOpenAIFetchForTests(fetchMock as unknown as typeof fetch);

    const first = await processMapImage({ imagemBase64: capture.dataUrl });
    await processMapImage({
      imagemBase64: capture.dataUrl,
      reprocessarComIa: true,
      priorOpenAIMetadata: first.metadata?.openai,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('timeout OpenAI cai para fallback local com metadata', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_IMAGE_TIMEOUT_MS = '30';
    const capture = await createTestCapture();

    setOpenAIFetchForTests(
      vi.fn(
        async (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: capture.dataUrl });
    expect(result.metadata?.openai?.timeout).toBe(true);
    expect(result.metadata?.openai?.success).toBeFalsy();
    expect(result.processador).not.toBe('openai-corners');
    expect(result.metadata?.warnings?.some((w) => w.includes('IA demorou'))).toBe(true);
    expect(result.metadata?.processingTiming?.totalMs).toBeGreaterThanOrEqual(0);
  });
});
