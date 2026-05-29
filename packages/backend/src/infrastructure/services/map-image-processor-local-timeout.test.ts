import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sharp from 'sharp';
import { processMapImage } from './map-image-processor.js';
import * as documentProcessor from './document-image-processor.js';
import * as fastWarp from './ai-corners-fast-warp.js';
import * as openaiProcessor from './openai-image-processor.js';

const TINY_JPEG_BUFFER = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64'
);

const TINY_JPEG_DATA_URL = `data:image/jpeg;base64,${TINY_JPEG_BUFFER.toString('base64')}`;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('map-image-processor local timeout — Lote 11.3', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    process.env.OPENAI_IMAGE_ENABLED = 'false';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'false';
    process.env.MAP_IMAGE_LOCAL_PROCESSOR_TIMEOUT_MS = '50';
    process.env.MAP_IMAGE_TOTAL_PROCESSING_TIMEOUT_MS = '500';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = envBackup;
    vi.restoreAllMocks();
  });

  it('pipeline local demora demais → status retake com local_timeout', async () => {
    vi.spyOn(documentProcessor, 'processDocumentImage').mockImplementation(async () => {
      await delay(200);
      const processedBuffer = await sharp({
        create: { width: 120, height: 120, channels: 3, background: { r: 255, g: 255, b: 255 } },
      })
        .jpeg()
        .toBuffer();
      return {
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
      };
    });

    const startedAt = Date.now();
    const result = await processMapImage({ imagemBase64: TINY_JPEG_DATA_URL });
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(500);
    expect(result.metadata?.processing?.localTimeout).toBe(true);
    expect(result.metadata?.processingDecision?.status).toBe('retake');
    expect(result.metadata?.processingDecision?.reason).toBe('local_timeout');
    expect(result.metadata?.processingTiming?.localTimeoutMs).toBe(50);
    expect(result.processedBase64).toBe(TINY_JPEG_DATA_URL);
  });

  it('timeout local não quebra request e preserva original', async () => {
    vi.spyOn(documentProcessor, 'processDocumentImage').mockImplementation(async () => {
      await delay(300);
      throw new Error('should not complete');
    });

    const result = await processMapImage({ imagemBase64: TINY_JPEG_DATA_URL });

    expect(result.processedBase64).toBe(TINY_JPEG_DATA_URL);
    expect(result.fallbackUsado).toBe(true);
    expect(result.metadata?.processingDecision?.userActionRequired).toBe('retake');
  });

  it('IA aplicada com sucesso não executa pipeline local lento', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MAP_IMAGE_LOCAL_PROCESSOR_TIMEOUT_MS = '50';

    const openaiSpy = vi.spyOn(openaiProcessor, 'processOpenAIImageEnhancement').mockResolvedValue({
      success: true,
      processingOrigin: 'openai',
      analysis: {
        documentDetected: true,
        confidence: 0.92,
        quality: 'good',
        recommendedAction: 'auto_crop',
        problems: [],
        notes: 'OK',
        corners: {
          topLeft: { x: 10, y: 10 },
          topRight: { x: 110, y: 12 },
          bottomRight: { x: 108, y: 108 },
          bottomLeft: { x: 8, y: 106 },
        },
        imageSize: { width: 120, height: 120 },
      },
      metadata: {
        called: true,
        attempted: true,
        success: true,
        durationMs: 120,
        model: 'gpt-4.1-mini',
      },
    });

    const processedBuffer = await sharp({
      create: { width: 320, height: 480, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .jpeg()
      .toBuffer();

    const thumbnailBuffer = await sharp(processedBuffer).resize(80).jpeg().toBuffer();
    vi.spyOn(fastWarp, 'applyPerspectiveFromCornersFast').mockResolvedValue({
      processedBuffer,
      thumbnailBuffer,
      mimeType: 'image/jpeg',
      width: 320,
      height: 480,
      confidence: 0.92,
      warpMs: 80,
      aiWarp: {
        attempted: true,
        method: 'faithful-scan',
        success: true,
        durationMs: 80,
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

    const result = await processMapImage({ imagemBase64: TINY_JPEG_DATA_URL });

    expect(result.processador).toBe('openai-corners-fast-warp');
    expect(result.metadata?.aiCorners?.warpSuccess).toBe(true);
    expect(openaiSpy).toHaveBeenCalled();
    expect(result.metadata?.processing?.localTimeout).toBeFalsy();
  });

  it('IA falha + local rápido OK → ready', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MAP_IMAGE_LOCAL_PROCESSOR_TIMEOUT_MS = '5000';

    vi.spyOn(openaiProcessor, 'processOpenAIImageEnhancement').mockResolvedValue({
      success: false,
      processingOrigin: 'openai',
      error: 'network down',
      metadata: {
        called: true,
        attempted: true,
        success: false,
        durationMs: 80,
      },
    });

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
        confidence: 0.82,
        fallback: false,
        width: 120,
        height: 120,
        originalWidth: 120,
        originalHeight: 120,
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

    const result = await processMapImage({ imagemBase64: TINY_JPEG_DATA_URL });

    expect(result.metadata?.processing?.localTimeout).toBeFalsy();
    expect(result.metadata?.processingDecision?.status).toBe('ready');
  });

  it('IA falha + local timeout → retake', async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MAP_IMAGE_LOCAL_PROCESSOR_TIMEOUT_MS = '50';

    vi.spyOn(openaiProcessor, 'processOpenAIImageEnhancement').mockResolvedValue({
      success: false,
      processingOrigin: 'openai',
      error: 'network down',
      metadata: {
        called: true,
        attempted: true,
        success: false,
        durationMs: 80,
      },
    });

    vi.spyOn(documentProcessor, 'processDocumentImage').mockImplementation(async () => {
      await delay(200);
      throw new Error('too slow');
    });

    const result = await processMapImage({ imagemBase64: TINY_JPEG_DATA_URL });

    expect(result.metadata?.processing?.localTimeout).toBe(true);
    expect(result.metadata?.processingDecision?.status).toBe('retake');
    expect(result.metadata?.processingDecision?.reason).toBe('local_timeout');
  });
});
