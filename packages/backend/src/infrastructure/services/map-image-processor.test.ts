import sharp from 'sharp';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { processMapImage } from './map-image-processor.js';
import { decodeImageDataUrl } from './document-image-processor.js';
import * as documentProcessor from './document-image-processor.js';
import * as faithfulDocumentScan from './faithful-document-scan.js';

function buildDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

describe('map-image-processor', () => {
  beforeEach(async () => {
    process.env.OPENAI_IMAGE_ENABLED = 'false';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'false';
    process.env.MAP_IMAGE_FAITHFUL_SCAN_ENABLED = 'false';

    const assistedImageBuffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 120, g: 160, b: 210 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    vi.spyOn(documentProcessor, 'processDocumentImage').mockResolvedValue({
      success: true,
      processedBuffer: assistedImageBuffer,
      thumbnailBuffer: assistedImageBuffer,
      outputMimeType: 'image/jpeg',
      metadata: {
        engine: 'frontend-assisted',
        confidence: 0.95,
        fallback: false,
        width: 640,
        height: 480,
        originalWidth: 640,
        originalHeight: 480,
        documentClass: 'map_document',
        decision: 'frontend_assisted',
        analysis: {
          paperLikeRatio: 0.5,
          colorRatio: 0.2,
          edgeDensity: 0.3,
          dynamicRange: 0.4,
          fillFrameLikelihood: 0.5,
        },
        postprocess: {
          manualMode: null,
          cornersSource: 'manual',
          manualCornersReceived: true,
          pythonUsed: false,
          manualFinalizeUsed: true,
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
    vi.restoreAllMocks();
  });

  it('should process frontend-assisted map capture and preserve assisted JPEG bytes when possible', async () => {
    const originalImageBuffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 192, g: 192, b: 192 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    const assistedImageBuffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 120, g: 160, b: 210 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    const result = await processMapImage({
      imagemBase64: buildDataUrl(originalImageBuffer, 'image/jpeg'),
      imagemCorrigidaBase64: buildDataUrl(assistedImageBuffer, 'image/jpeg'),
      manualCorners: [
        { x: 8, y: 8 },
        { x: 632, y: 8 },
        { x: 632, y: 472 },
        { x: 8, y: 472 },
      ],
    });

    expect(result.processador).toBe('frontend-assisted');
    expect(result.processedBase64).toMatch(/^data:image\/jpeg;base64,/);
    const processed = decodeImageDataUrl(result.processedBase64);
    expect(processed.buffer).toEqual(assistedImageBuffer);
    expect(result.thumbnailBase64).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.processador).toBe('frontend-assisted');
    expect(result.metadata?.decision).toBe('frontend_assisted');
    expect(result.tamanhoBytes).toBeGreaterThan(0);
  });

  it('encaminha edge midpoints manuais para o faithful scan e preserva metadata de dewarp', async () => {
    process.env.MAP_IMAGE_FAITHFUL_SCAN_ENABLED = 'true';

    const originalImageBuffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 192, g: 192, b: 192 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    const faithfulBuffer = await sharp({
      create: {
        width: 500,
        height: 700,
        channels: 3,
        background: { r: 245, g: 245, b: 245 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    const faithfulSpy = vi
      .spyOn(faithfulDocumentScan, 'processFaithfulDocumentScan')
      .mockResolvedValue({
        imageBuffer: faithfulBuffer,
        thumbnailBuffer: faithfulBuffer,
        mimeType: 'image/jpeg',
        width: 500,
        height: 700,
        cornersUsed: [
          { x: 40, y: 50 },
          { x: 600, y: 60 },
          { x: 590, y: 430 },
          { x: 30, y: 420 },
        ],
        processingMode: 'faithful-scan',
        usedGenerativeAI: false,
        perspectiveCorrected: true,
        contentPreservationMode: true,
        cornerSource: 'manual',
        documentRatio: 'A1_PORTRAIT',
        meshDewarpApplied: true,
        meshDewarpBow: 18.4,
        timingMs: {
          warpMs: 10,
          alignmentMs: 2,
          illuminationMs: 4,
          enhanceMs: 3,
          totalMs: 19,
        },
      });

    const result = await processMapImage({
      imagemBase64: buildDataUrl(originalImageBuffer, 'image/jpeg'),
      manualCorners: [
        { x: 40, y: 50 },
        { x: 600, y: 60 },
        { x: 590, y: 430 },
        { x: 30, y: 420 },
      ],
      manualEdgeMidpoints: [
        { x: 320, y: 72 },
        { x: 580, y: 240 },
        { x: 310, y: 405 },
        { x: 52, y: 235 },
      ],
    });

    expect(faithfulSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        edgeMidpoints: [
          { x: 320, y: 72 },
          { x: 580, y: 240 },
          { x: 310, y: 405 },
          { x: 52, y: 235 },
        ],
        enableMeshDewarp: true,
      })
    );
    expect(result.processador).toBe('faithful-scan');
    expect(result.metadata?.faithfulScan?.meshDewarpApplied).toBe(true);
    expect(result.metadata?.faithfulScan?.meshDewarpBow).toBe(18.4);
  });
});
