import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { dewarpDocument } from './document-dewarp.js';

/** Gera um documento sintético claro sobre fundo escuro, com cantos definidos. */
async function syntheticDoc(width: number, height: number): Promise<Buffer> {
  const channels = 3;
  const data = Buffer.alloc(width * height * channels, 70); // fundo escuro (mesa)
  const m = Math.round(Math.min(width, height) * 0.12);
  for (let y = m; y < height - m; y += 1) {
    for (let x = m; x < width - m; x += 1) {
      const i = (y * width + x) * channels;
      data[i] = 235;
      data[i + 1] = 235;
      data[i + 2] = 235;
    }
  }
  return sharp(data, { raw: { width, height, channels } }).jpeg({ quality: 95 }).toBuffer();
}

describe('dewarpDocument', () => {
  it('retorna null quando a curvatura é insignificante e minBowRatio é exigido', async () => {
    const buf = await syntheticDoc(600, 800);
    const corners = [
      { x: 72, y: 96 },
      { x: 528, y: 96 },
      { x: 528, y: 704 },
      { x: 72, y: 704 },
    ];
    const result = await dewarpDocument(buf, corners, { minBowRatio: 0.015 });
    expect(result).toBeNull();
  });

  it('produz saída retificada com bordas retas (folha plana)', async () => {
    const buf = await syntheticDoc(600, 800);
    const corners = [
      { x: 72, y: 96 },
      { x: 528, y: 96 },
      { x: 528, y: 704 },
      { x: 72, y: 704 },
    ];
    const result = await dewarpDocument(buf, corners, { maxDimension: 800 });
    expect(result).not.toBeNull();
    expect(result!.width).toBeGreaterThan(300);
    expect(result!.height).toBeGreaterThan(400);
    expect(result!.edgeCoverage).toBeGreaterThanOrEqual(0.5);

    // O interior do recorte deve ser predominantemente claro (folha), não fundo.
    const { data, info } = await sharp(result!.buffer).raw().toBuffer({ resolveWithObject: true });
    const cx = Math.floor(info.width / 2);
    const cy = Math.floor(info.height / 2);
    const center = (cy * info.width + cx) * info.channels;
    expect(data[center]!).toBeGreaterThan(180);
  });

  it('returnRaw devolve buffer cru com tamanho width*height*3', async () => {
    const buf = await syntheticDoc(600, 800);
    const corners = [
      { x: 72, y: 96 },
      { x: 528, y: 96 },
      { x: 528, y: 704 },
      { x: 72, y: 704 },
    ];
    const result = await dewarpDocument(buf, corners, { maxDimension: 800, returnRaw: true });
    expect(result).not.toBeNull();
    expect(result!.isRaw).toBe(true);
    expect(result!.buffer.length).toBe(result!.width * result!.height * 3);
  });

  it('usa pontos médios manuais para forçar dewarp por malha mesmo sem detecção automática', async () => {
    const buf = await syntheticDoc(600, 800);
    const corners = [
      { x: 72, y: 96 },
      { x: 528, y: 96 },
      { x: 528, y: 704 },
      { x: 72, y: 704 },
    ];
    const result = await dewarpDocument(buf, corners, {
      maxDimension: 800,
      returnRaw: true,
      minBowRatio: 0.015,
      manualEdgeMidpoints: [
        { x: 300, y: 128 },
        { x: 500, y: 400 },
        { x: 300, y: 672 },
        { x: 100, y: 400 },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.edgeCoverage).toBe(1);
    expect(result!.maxEdgeBow).toBeGreaterThan(10);
    expect(result!.buffer.length).toBe(result!.width * result!.height * 3);
  });
});
