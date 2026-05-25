import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processDocumentImage } from './document-image-processor.js';

describe('document-image-processor', () => {
  it('should preserve frontend-assisted image when manual corners are provided', async () => {
    const originalImageBuffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 220, g: 220, b: 220 },
      },
    })
      .png()
      .toBuffer();

    const assistedImageBuffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 100, g: 140, b: 200 },
      },
    })
      .png()
      .toBuffer();

    const result = await processDocumentImage({
      imageBuffer: originalImageBuffer,
      mimeType: 'image/png',
      manualCorners: [
        { x: 10, y: 10 },
        { x: 630, y: 10 },
        { x: 630, y: 470 },
        { x: 10, y: 470 },
      ],
      assistedImageBuffer,
      assistedMimeType: 'image/png',
      options: {
        outputFormat: 'png',
        quality: 80,
        preserveColors: true,
        processingMode: 'map_document',
      },
    });

    expect(result.success).toBe(true);
    expect(result.outputMimeType).toBe('image/png');
    expect(result.metadata.engine).toBe('frontend-assisted');
    expect(result.metadata.decision).toBe('frontend_assisted');
    expect(result.metadata.corners).toEqual([
      { x: 10, y: 10 },
      { x: 630, y: 10 },
      { x: 630, y: 470 },
      { x: 10, y: 470 },
    ]);
    expect(result.metadata.warnings).toContain(
      'Resultado manual do frontend utilizado como imagem final.'
    );
    expect(result.processedBuffer.length).toBeGreaterThan(0);
    expect(result.processedBuffer).not.toEqual(originalImageBuffer);
  });
});
