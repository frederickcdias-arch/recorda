import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sharp from 'sharp';
import { clearOpenAICacheForTests, setOpenAIFetchForTests } from './openai-image-processor.js';
import { processMapImage } from './map-image-processor.js';
import * as fastWarp from './ai-corners-fast-warp.js';
import * as documentProcessor from './document-image-processor.js';

function mockOpenAIResponse(analysis: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(analysis) } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

const MOCK_AI_WARP = {
  attempted: true,
  method: 'faithful-scan' as const,
  success: true,
  timeout: false,
  durationMs: 120,
  warpMs: 90,
  outputMs: 30,
  inputWidth: 400,
  inputHeight: 600,
  outputWidth: 320,
  outputHeight: 480,
};

const MOCK_FAITHFUL_SCAN = {
  processingMode: 'faithful-scan' as const,
  usedGenerativeAI: false as const,
  perspectiveCorrected: true as const,
  contentPreservationMode: true as const,
  cornerSource: 'provided' as const,
  documentRatio: 'A1_PORTRAIT',
};

describe('map-image-processor — fast warp Lote 11.5', () => {
  const envBackup = { ...process.env };

  beforeEach(async () => {
    process.env = { ...envBackup };
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MAP_IMAGE_AI_WARP_TIMEOUT_MS = '5000';
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
      corners: {
        topLeft: { x: width * 0.1, y: height * 0.1 },
        topRight: { x: width * 0.9, y: height * 0.12 },
        bottomRight: { x: width * 0.88, y: height * 0.9 },
        bottomLeft: { x: width * 0.08, y: height * 0.88 },
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
      confidence: 0.93,
      warpMs: 120,
      aiWarp: MOCK_AI_WARP,
      faithfulScan: MOCK_FAITHFUL_SCAN,
    });
  }

  it('IA corners válidos usa fast warp e não processDocumentImage', async () => {
    await mockFastWarpSuccess();
    const documentSpy = vi.spyOn(documentProcessor, 'processDocumentImage');
    const capture = await createCapture();
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
          notes: 'OK',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: capture.dataUrl });

    expect(fastWarp.applyPerspectiveFromCornersFast).toHaveBeenCalledTimes(1);
    expect(documentSpy).not.toHaveBeenCalled();
    expect(result.processador).toBe('openai-corners-fast-warp');
    expect(result.metadata?.aiWarp?.method).toBe('faithful-scan');
    expect(result.metadata?.processing?.engine).toBe('openai-corners-fast-warp');
    expect(result.metadata?.processingDecision?.status).toBe('ready');
  });

  it('fast warp sucesso → engine não é sharp-fallback', async () => {
    await mockFastWarpSuccess();
    const capture = await createCapture();
    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: true,
          confidence: 0.9,
          quality: 'good',
          recommendedAction: 'auto_crop',
          corners: capture.corners,
          imageSize: { width: 400, height: 600 },
          problems: [],
          notes: 'OK',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: capture.dataUrl });

    expect(result.processador).not.toBe('sharp-fallback');
    expect(result.confiancaDeteccao).toBeGreaterThan(0);
  });

  it('fast warp timeout → reason ai_warp_timeout sem pipeline local', async () => {
    vi.spyOn(fastWarp, 'applyPerspectiveFromCornersFast').mockRejectedValue(
      new fastWarp.FastWarpTimeoutError(5000, 5001, {
        attempted: true,
        method: 'node-native-warp',
        success: false,
        timeout: true,
        durationMs: 5001,
        error: 'ai_warp_timeout',
      })
    );
    const documentSpy = vi.spyOn(documentProcessor, 'processDocumentImage');
    const capture = await createCapture();
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
          notes: 'OK',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: capture.dataUrl });

    expect(result.metadata?.processingDecision?.reason).toBe('ai_warp_timeout');
    expect(result.metadata?.aiWarp?.timeout).toBe(true);
    expect(result.processador).toBe('openai-corners-warp-failed');
    expect(documentSpy).not.toHaveBeenCalled();
  });

  it('fast warp falha → reason ai_warp_failed e metadata aiWarp', async () => {
    vi.spyOn(fastWarp, 'applyPerspectiveFromCornersFast').mockRejectedValue(
      new fastWarp.FastWarpFailedError('Warp nativo falhou', undefined, {
        attempted: true,
        method: 'node-native-warp',
        success: false,
        error: 'Warp nativo falhou',
      })
    );
    const capture = await createCapture();
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
          notes: 'OK',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: capture.dataUrl });

    expect(result.metadata?.processingDecision?.reason).toBe('ai_warp_failed');
    expect(result.metadata?.aiWarp?.success).toBe(false);
  });
});
