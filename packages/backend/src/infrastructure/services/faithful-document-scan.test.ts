import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { processFaithfulDocumentScan, orderDocumentCorners } from './faithful-document-scan.js';
import { A1_HEIGHT_MM, A1_WIDTH_MM } from './node-perspective-warp.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const MODELO_MAPA_PATH = path.join(REPO_ROOT, 'MODELO MAPA.jpeg');
const hasModeloMapa = fs.existsSync(MODELO_MAPA_PATH);

/** Cantos validados manualmente para MODELO MAPA.jpeg (900×1600). */
const MODELO_MAPA_CORNERS = {
  topLeft: { x: 51, y: 29 },
  topRight: { x: 785, y: 57 },
  bottomRight: { x: 800, y: 1379 },
  bottomLeft: { x: 22, y: 1333 },
};

describe('processFaithfulDocumentScan', () => {
  it('ordena cantos em TL, TR, BR, BL', () => {
    const ordered = orderDocumentCorners([
      { x: 800, y: 1379 },
      { x: 51, y: 29 },
      { x: 22, y: 1333 },
      { x: 785, y: 57 },
    ]);
    expect(ordered[0]).toEqual({ x: 51, y: 29 });
    expect(ordered[1]).toEqual({ x: 785, y: 57 });
    expect(ordered[2]).toEqual({ x: 800, y: 1379 });
    expect(ordered[3]).toEqual({ x: 22, y: 1333 });
  });

  it('nunca marca usedGenerativeAI como true', async () => {
    const buf = await sharp({
      create: { width: 600, height: 900, channels: 3, background: { r: 240, g: 240, b: 238 } },
    })
      .composite([
        {
          input: {
            create: {
              width: 500,
              height: 700,
              channels: 3,
              background: { r: 255, g: 255, b: 255 },
            },
          },
          left: 50,
          top: 100,
        },
      ])
      .jpeg()
      .toBuffer();

    const result = await processFaithfulDocumentScan({
      imageBuffer: buf,
      corners: {
        topLeft: { x: 50, y: 100 },
        topRight: { x: 550, y: 110 },
        bottomRight: { x: 545, y: 800 },
        bottomLeft: { x: 45, y: 790 },
      },
      autoDetectCorners: false,
      documentRatio: 'A1_PORTRAIT',
      maxDimension: 900,
    });

    expect(result.processingMode).toBe('faithful-scan');
    expect(result.usedGenerativeAI).toBe(false);
    expect(result.perspectiveCorrected).toBe(true);
    expect(result.contentPreservationMode).toBe(true);
  });

  it('A1_PORTRAIT mantém proporção 594:841 na saída (sem margem)', async () => {
    const buf = await sharp({
      create: { width: 400, height: 700, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .jpeg()
      .toBuffer();

    const result = await processFaithfulDocumentScan({
      imageBuffer: buf,
      corners: {
        topLeft: { x: 30, y: 40 },
        topRight: { x: 370, y: 50 },
        bottomRight: { x: 365, y: 660 },
        bottomLeft: { x: 25, y: 650 },
      },
      autoDetectCorners: false,
      documentRatio: 'A1_PORTRAIT',
      maxDimension: 1200,
      marginRatio: 0,
    });

    const meta = await sharp(result.imageBuffer).metadata();
    const contentW = (meta.width ?? 0) - 0;
    const contentH = (meta.height ?? 0) - 0;
    const ratio = contentW / Math.max(1, contentH);
    const expected = A1_HEIGHT_MM / A1_WIDTH_MM;
    expect(Math.abs(ratio - expected)).toBeLessThan(0.02);
  });
});

describe.skipIf(!hasModeloMapa)('processFaithfulDocumentScan — MODELO MAPA.jpeg', () => {
  it('produz scan fiel com cantos manuais e bordas claras', async () => {
    const inputBuffer = fs.readFileSync(MODELO_MAPA_PATH);
    const result = await processFaithfulDocumentScan({
      imageBuffer: inputBuffer,
      corners: MODELO_MAPA_CORNERS,
      autoDetectCorners: false,
      documentRatio: 'A1_PORTRAIT',
      maxDimension: 1600,
    });

    expect(result.usedGenerativeAI).toBe(false);
    expect(result.width).toBeGreaterThan(900);
    expect(result.height).toBeGreaterThan(1300);

    const { data, info } = await sharp(result.imageBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const border = Math.max(4, Math.round(Math.min(info.width, info.height) * 0.02));
    let borderSum = 0;
    let borderCount = 0;
    const add = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      borderSum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      borderCount += 1;
    };
    for (let x = 0; x < info.width; x += 1) {
      for (let y = 0; y < border; y += 1) add(x, y);
    }
    expect(borderSum / borderCount).toBeGreaterThan(200);
  });
});
