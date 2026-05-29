import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sharp from 'sharp';
import { clearOpenAICacheForTests, setOpenAIFetchForTests } from './openai-image-processor.js';
import { processMapImage } from './map-image-processor.js';
import * as documentProcessor from './document-image-processor.js';
import * as fastWarp from './ai-corners-fast-warp.js';

function mockOpenAIResponse(analysis: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(analysis) } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('map-image-processor — IA-first Lote 11.4', () => {
  const envBackup = { ...process.env };

  beforeEach(async () => {
    process.env = { ...envBackup };
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MAP_IMAGE_LOCAL_PROCESSOR_TIMEOUT_MS = '12000';
    process.env.MAP_IMAGE_TOTAL_PROCESSING_TIMEOUT_MS = '18000';
    clearOpenAICacheForTests();
    setOpenAIFetchForTests(null);
  });

  afterEach(() => {
    process.env = envBackup;
    clearOpenAICacheForTests();
    setOpenAIFetchForTests(null);
    vi.restoreAllMocks();
  });

  async function createCapture(width = 400, height = 600) {
    const buffer = await sharp({
      create: { width, height, channels: 3, background: { r: 230, g: 230, b: 230 } },
    })
      .jpeg()
      .toBuffer();
    return {
      dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
      wholeSheetCorners: {
        topLeft: { x: width * 0.1, y: height * 0.1 },
        topRight: { x: width * 0.9, y: height * 0.12 },
        bottomRight: { x: width * 0.88, y: height * 0.9 },
        bottomLeft: { x: width * 0.08, y: height * 0.88 },
      },
      innerCorners: {
        topLeft: { x: width * 0.3, y: height * 0.3 },
        topRight: { x: width * 0.7, y: height * 0.32 },
        bottomRight: { x: width * 0.68, y: height * 0.7 },
        bottomLeft: { x: width * 0.28, y: height * 0.68 },
      },
    };
  }

  async function mockFastWarpSuccess() {
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
      warpMs: 100,
      aiWarp: {
        attempted: true,
        method: 'faithful-scan',
        success: true,
        durationMs: 100,
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
  }

  async function mockSharpFallbackLocal() {
    const processedBuffer = await sharp({
      create: { width: 400, height: 600, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .jpeg()
      .toBuffer();

    vi.spyOn(documentProcessor, 'processDocumentImage').mockResolvedValue({
      success: true,
      processedBuffer,
      thumbnailBuffer: processedBuffer,
      outputMimeType: 'image/jpeg',
      metadata: {
        engine: 'sharp-fallback',
        confidence: 0,
        fallback: true,
        width: 400,
        height: 600,
        originalWidth: 400,
        originalHeight: 600,
        documentClass: 'low_confidence_capture',
        decision: 'manual_review_recommended',
        analysis: {
          paperLikeRatio: 0.1,
          colorRatio: 0.1,
          edgeDensity: 0.1,
          dynamicRange: 0.1,
          fillFrameLikelihood: 0.1,
        },
        postprocess: {
          manualMode: null,
          cornersSource: 'fallback',
          manualCornersReceived: false,
          pythonUsed: false,
          manualFinalizeUsed: false,
          borderCleanup: false,
          isolateExterior: false,
          marginMode: 'none',
          paperNormalization: false,
          shadowBalance: false,
          contentPreserved: true,
        },
        warnings: [],
      },
    });
  }

  it('com IA ON chama OpenAI antes do pipeline local', async () => {
    await mockFastWarpSuccess();
    const documentSpy = vi.spyOn(documentProcessor, 'processDocumentImage');
    const capture = await createCapture();
    const fetchMock = vi.fn(async () =>
      mockOpenAIResponse({
        documentDetected: true,
        confidence: 0.91,
        quality: 'good',
        recommendedAction: 'auto_crop',
        corners: capture.wholeSheetCorners,
        imageSize: { width: 400, height: 600 },
        problems: [],
        notes: 'Folha inteira detectada.',
      })
    );
    setOpenAIFetchForTests(fetchMock as unknown as typeof fetch);

    const result = await processMapImage({ imagemBase64: capture.dataUrl });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.metadata?.openai?.called).toBe(true);
    expect(result.metadata?.openai?.attempted).toBe(true);
    expect(fastWarp.applyPerspectiveFromCornersFast).toHaveBeenCalledTimes(1);
    expect(documentSpy).not.toHaveBeenCalled();
  });

  it('corners válidos da folha inteira → origin openai-corners-fast-warp', async () => {
    await mockFastWarpSuccess();
    const capture = await createCapture();
    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: true,
          confidence: 0.91,
          quality: 'good',
          recommendedAction: 'auto_crop',
          corners: capture.wholeSheetCorners,
          imageSize: { width: 400, height: 600 },
          problems: [],
          notes: 'OK',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: capture.dataUrl });

    expect(result.processador).toBe('openai-corners-fast-warp');
    expect(result.metadata?.aiCorners?.warpSuccess).toBe(true);
    expect(result.metadata?.processing?.origin).toBe('openai-corners-fast-warp');
    expect(result.metadata?.processingDecision?.status).toBe('ready');
  });

  it('corners da imagem interna pequena são rejeitados', async () => {
    await mockSharpFallbackLocal();
    const capture = await createCapture();
    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: true,
          confidence: 0.88,
          quality: 'good',
          recommendedAction: 'auto_crop',
          corners: capture.innerCorners,
          imageSize: { width: 400, height: 600 },
          problems: ['inner_content_only'],
          notes: 'Detectou foto interna.',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: capture.dataUrl });

    expect(result.metadata?.aiCorners?.applied).toBe(false);
    expect(result.metadata?.aiCorners?.rejectionReason).toBe('inner_content_detected');
    expect(result.metadata?.processingDecision?.reason).toBe(
      'ai_no_valid_corners_and_local_failed'
    );
    expect(result.metadata?.processingDecision?.status).toBe('retake');
  });

  it('OpenAI sem corners → reason ai_no_corners', async () => {
    await mockSharpFallbackLocal();
    const capture = await createCapture();
    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: false,
          confidence: 0.2,
          quality: 'poor',
          recommendedAction: 'manual_adjust',
          problems: [],
          notes: 'Sem documento.',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: capture.dataUrl });

    expect(result.metadata?.aiCorners?.rejectionReason).toBe('missing_corners');
    expect(result.metadata?.processingDecision?.reason).toBe(
      'ai_no_valid_corners_and_local_failed'
    );
  });

  it('corners rejeitados por geometria → ai_geometry_rejected', async () => {
    await mockSharpFallbackLocal();
    const capture = await createCapture();
    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: true,
          confidence: 0.91,
          quality: 'good',
          recommendedAction: 'auto_crop',
          corners: {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 5, y: 0 },
            bottomRight: { x: 5, y: 5 },
            bottomLeft: { x: 0, y: 5 },
          },
          imageSize: { width: 400, height: 600 },
          problems: [],
          notes: 'Area minima.',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: capture.dataUrl });

    expect(['invalid_geometry', 'inner_content_detected']).toContain(
      result.metadata?.aiCorners?.rejectionReason
    );
    expect(result.metadata?.processingDecision?.status).toBe('retake');
  });

  it('sharp-fallback confidence 0 → reason local_failed sem IA', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'false';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'false';
    await mockSharpFallbackLocal();
    const capture = await createCapture();

    const result = await processMapImage({ imagemBase64: capture.dataUrl });

    expect(result.processador).toBe('sharp-fallback');
    expect(result.metadata?.processingDecision?.reason).toBe('ai_disabled');
    expect(result.metadata?.processingDecision?.status).toBe('retake');
  });

  it('imagem simples mockada com corners válidos não termina sharp-fallback', async () => {
    await mockFastWarpSuccess();
    const capture = await createCapture();
    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: true,
          confidence: 0.93,
          quality: 'good',
          recommendedAction: 'auto_crop',
          corners: capture.wholeSheetCorners,
          imageSize: { width: 400, height: 600 },
          problems: [],
          notes: 'Documento simples.',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: capture.dataUrl });

    expect(result.processador).not.toBe('sharp-fallback');
    expect(result.metadata?.processingDecision?.status).not.toBe('retake');
  });

  it('env auto crop ON é respeitada em runtime', async () => {
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    await mockFastWarpSuccess();
    const capture = await createCapture();
    const fetchMock = vi.fn(async () =>
      mockOpenAIResponse({
        documentDetected: true,
        confidence: 0.91,
        quality: 'good',
        recommendedAction: 'auto_crop',
        corners: capture.wholeSheetCorners,
        imageSize: { width: 400, height: 600 },
        problems: [],
        notes: 'OK',
      })
    );
    setOpenAIFetchForTests(fetchMock as unknown as typeof fetch);

    await processMapImage({ imagemBase64: capture.dataUrl });

    expect(fetchMock).toHaveBeenCalled();
  });
});
