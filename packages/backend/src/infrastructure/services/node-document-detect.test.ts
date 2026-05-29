import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { detectDocumentQuad } from './node-document-detect.js';

/** Folha branca com miolo colorido, rotacionada sobre uma mesa cinza. */
async function makeTiltedSheet(angleDeg: number): Promise<Buffer> {
  const sheetW = 520;
  const sheetH = 680;
  const sheet = await sharp({
    create: { width: sheetW, height: sheetH, channels: 3, background: { r: 247, g: 247, b: 244 } },
  })
    .composite([
      {
        input: {
          create: {
            width: 300,
            height: 300,
            channels: 3,
            background: { r: 210, g: 40, b: 40 },
          },
        },
        left: 110,
        top: 150,
      },
    ])
    .png()
    .toBuffer();

  return sharp(sheet)
    .rotate(angleDeg, { background: { r: 128, g: 128, b: 126 } })
    .extend({ top: 60, bottom: 60, left: 60, right: 60, background: { r: 128, g: 128, b: 126 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe('detectDocumentQuad (detecção nativa do contorno da folha)', () => {
  it('detecta o quadrilátero da folha inclinada sobre a mesa', async () => {
    const input = await makeTiltedSheet(7);
    const detection = await detectDocumentQuad(input);

    expect(detection).not.toBeNull();
    expect(detection!.corners).toHaveLength(4);
    expect(detection!.areaRatio).toBeGreaterThan(0.25);
    expect(detection!.areaRatio).toBeLessThan(0.92);
    expect(detection!.rectangularity).toBeGreaterThan(0.7);
  });

  it('captura a inclinação real (cantos não formam retângulo perfeitamente alinhado)', async () => {
    const input = await makeTiltedSheet(9);
    const detection = await detectDocumentQuad(input);
    expect(detection).not.toBeNull();

    const ys = detection!.corners.map((c) => c.y);
    const xs = detection!.corners.map((c) => c.x);
    const spreadY = Math.max(...ys) - Math.min(...ys);
    const spreadX = Math.max(...xs) - Math.min(...xs);
    // Uma folha inclinada produz dispersão de y entre os cantos do topo
    // (não seria zero como num retângulo perfeitamente alinhado aos eixos).
    expect(spreadY).toBeGreaterThan(20);
    expect(spreadX).toBeGreaterThan(20);
  });

  it('retorna null quando não há folha (fundo uniforme) → fallback para cantos da IA', async () => {
    const flat = await sharp({
      create: { width: 600, height: 800, channels: 3, background: { r: 128, g: 128, b: 126 } },
    })
      .jpeg()
      .toBuffer();

    const detection = await detectDocumentQuad(flat);
    expect(detection).toBeNull();
  });
});
