import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { applyPerspectiveFromCornersFast, FastWarpFailedError } from './ai-corners-fast-warp.js';
import { warpPerspectiveNative } from './node-perspective-warp.js';

async function makeImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 222, g: 222, b: 218 } },
  })
    .jpeg()
    .toBuffer();
}

describe('warp nativo (node-perspective-warp)', () => {
  it('aplica warp por 4 cantos sem depender de Python/OpenCV', async () => {
    const input = await makeImage(800, 1100);
    const result = await warpPerspectiveNative(input, [
      { x: 60, y: 80 },
      { x: 740, y: 70 },
      { x: 760, y: 1030 },
      { x: 40, y: 1010 },
    ]);

    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.inputWidth).toBe(800);
    expect(result.inputHeight).toBe(1100);
    expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('jpeg');
  });

  it('é rápido para imagem comum (orçamento de warp)', async () => {
    const input = await makeImage(1200, 1600);
    const startedAt = Date.now();
    const result = await warpPerspectiveNative(input, [
      { x: 100, y: 120 },
      { x: 1100, y: 110 },
      { x: 1120, y: 1500 },
      { x: 80, y: 1480 },
    ]);
    const elapsed = Date.now() - startedAt;
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('applyPerspectiveFromCornersFast (warp nativo)', () => {
  it('retorna aiWarp com method node-native-warp e sucesso', async () => {
    const input = await makeImage(400, 600);
    const result = await applyPerspectiveFromCornersFast(input, 'image/jpeg', [
      { x: 40, y: 40 },
      { x: 360, y: 45 },
      { x: 350, y: 555 },
      { x: 35, y: 550 },
    ]);

    expect(result.aiWarp.method).toBe('node-native-warp');
    expect(result.aiWarp.success).toBe(true);
    expect(result.aiWarp.timeout).toBe(false);
    expect(result.processedBuffer.length).toBeGreaterThan(0);
    expect(result.thumbnailBuffer.length).toBeGreaterThan(0);
  });

  it('falha com cantos degenerados → FastWarpFailedError com aiWarp', async () => {
    const input = await makeImage(400, 600);
    await expect(
      applyPerspectiveFromCornersFast(input, 'image/jpeg', [
        { x: 10, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 10 },
      ])
    ).rejects.toBeInstanceOf(FastWarpFailedError);
  });
});

export function buildMockFastWarpResult(processedBuffer: Buffer) {
  return {
    processedBuffer,
    thumbnailBuffer: processedBuffer,
    mimeType: 'image/jpeg' as const,
    width: 320,
    height: 480,
    confidence: 0.9,
    warpMs: 120,
    aiWarp: {
      attempted: true,
      method: 'node-native-warp' as const,
      success: true,
      timeout: false,
      durationMs: 120,
      warpMs: 90,
      outputMs: 30,
      inputWidth: 400,
      inputHeight: 600,
      outputWidth: 320,
      outputHeight: 480,
    },
  };
}
