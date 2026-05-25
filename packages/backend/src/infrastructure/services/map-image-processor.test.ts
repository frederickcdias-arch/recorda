import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processMapImage } from './map-image-processor.js';
import { decodeImageDataUrl } from './document-image-processor.js';

function buildDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

describe('map-image-processor', () => {
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
});
