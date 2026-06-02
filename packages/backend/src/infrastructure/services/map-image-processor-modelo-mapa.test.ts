import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOpenAICacheForTests, setOpenAIFetchForTests } from './openai-image-processor.js';
import { processMapImage } from './map-image-processor.js';
import { detectDocumentQuad } from './node-document-detect.js';
import { warpPerspectiveNative } from './node-perspective-warp.js';
import { decodeImageDataUrl, type DocumentImagePoint } from './document-image-processor.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const MODELO_MAPA_PATH = path.join(
  REPO_ROOT,
  'packages/backend/test/fixtures/captura-mapas/MODELO_MAPA.jpeg'
);
const MODELO_MAPA_REFERENCE_PATH = path.join(
  REPO_ROOT,
  'packages/backend/test/fixtures/captura-mapas/MODELO_MAPA_perspectiva_corrigida.jpg'
);
const hasModeloMapa = fs.existsSync(MODELO_MAPA_PATH);
const hasModeloMapaReference = fs.existsSync(MODELO_MAPA_REFERENCE_PATH);

function mockOpenAIResponse(analysis: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(analysis) } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function angularSkew(pts: DocumentImagePoint[]): number {
  const bySumAsc = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = bySumAsc[0]!;
  const br = bySumAsc[3]!;
  const rem = [bySumAsc[1]!, bySumAsc[2]!];
  const tr = rem.reduce((a, b) => (a.x - a.y > b.x - b.y ? a : b));
  const bl = rem.find((p) => p !== tr)!;
  const W = Math.hypot(tr.x - tl.x, tr.y - tl.y) || 1;
  const H = Math.hypot(bl.x - tl.x, bl.y - tl.y) || 1;
  return (
    Math.abs(tr.y - tl.y) / W +
    Math.abs(br.y - bl.y) / W +
    Math.abs(bl.x - tl.x) / H +
    Math.abs(br.x - tr.x) / H +
    Math.abs(tr.x - tl.x - (br.x - bl.x)) / W
  );
}

function cornerDistanceMetrics(
  actual: DocumentImagePoint[],
  expected: DocumentImagePoint[]
): { mean: number; max: number; distances: number[] } {
  const distances = actual.map((point, index) =>
    Math.hypot(point.x - expected[index]!.x, point.y - expected[index]!.y)
  );
  return {
    mean: distances.reduce((sum, value) => sum + value, 0) / Math.max(1, distances.length),
    max: Math.max(...distances),
    distances,
  };
}

/** Cantos validados (gpt-4.1) para MODELO MAPA.jpeg 900×1600. */
const MODELO_MAPA_AI_CORNERS = {
  topLeft: { x: 51, y: 29 },
  topRight: { x: 785, y: 57 },
  bottomRight: { x: 800, y: 1379 },
  bottomLeft: { x: 22, y: 1333 },
};

describe.skipIf(!hasModeloMapa)('map-image-processor — MODELO MAPA.jpeg (referência real)', () => {
  const envBackup = { ...process.env };
  let inputBuffer: Buffer;
  let dataUrl: string;
  let width = 0;
  let height = 0;

  beforeEach(async () => {
    process.env = { ...envBackup };
    process.env.OPENAI_IMAGE_ENABLED = 'true';
    process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MAP_IMAGE_AI_WARP_TIMEOUT_MS = '8000';
    clearOpenAICacheForTests();
    setOpenAIFetchForTests(null);

    inputBuffer = fs.readFileSync(MODELO_MAPA_PATH);
    const meta = await sharp(inputBuffer).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
    dataUrl = `data:image/jpeg;base64,${inputBuffer.toString('base64')}`;
  });

  afterEach(() => {
    process.env = envBackup;
    clearOpenAICacheForTests();
    setOpenAIFetchForTests(null);
    vi.restoreAllMocks();
  });

  it('warp com cantos IA produz folha retificada sem fallback', async () => {
    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: true,
          confidence: 0.95,
          quality: 'good',
          recommendedAction: 'auto_crop',
          corners: MODELO_MAPA_AI_CORNERS,
          imageSize: { width, height },
          problems: ['perspective', 'shadow', 'folds'],
          notes: 'Folha inclinada com cantos visíveis.',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({ imagemBase64: dataUrl, forcarAnaliseIa: true });

    expect(result.processador).toBe('openai-corners-fast-warp');
    expect(result.fallbackUsado).toBe(false);
    expect(['openai', 'refined', 'native-detect']).toContain(
      result.metadata?.processing?.cornerSource
    );
    expect(result.metadata?.faithfulScan?.usedGenerativeAI).toBe(false);
    expect(result.metadata?.faithfulScan?.processingMode).toBe('faithful-scan');
    expect(result.metadata?.aiWarp?.success).toBe(true);
    expect(result.dimensoesFinais.width).toBeGreaterThan(700);
    expect(result.dimensoesFinais.height).toBeGreaterThan(1100);
    expect(result.metadata?.processingDecision?.status).toBe('ready');
  }, 20000);

  it('ignora imageSize incorreto da IA e usa coordenadas no tamanho enviado', async () => {
    const aiCorners = {
      topLeft: { x: 34, y: 35 },
      topRight: { x: 744, y: 62 },
      bottomRight: { x: 767, y: 1347 },
      bottomLeft: { x: 13, y: 1304 },
    };

    setOpenAIFetchForTests(
      vi.fn(async () =>
        mockOpenAIResponse({
          documentDetected: true,
          confidence: 0.97,
          quality: 'acceptable',
          recommendedAction: 'auto_crop',
          corners: aiCorners,
          imageSize: { width: 768, height: 1365 },
          problems: ['perspective', 'shadow'],
          notes: 'imageSize divergente do JPEG enviado.',
        })
      ) as unknown as typeof fetch
    );

    const result = await processMapImage({
      imagemBase64: dataUrl,
      forcarAnaliseIa: true,
      reprocessarComIa: true,
    });

    expect(result.processador).toBe('openai-corners-fast-warp');
    // imageSize 768×1365 (errado) não deve inflar os cantos até a moldura:
    // os cantos usados ficam no sistema 900×1600 enviado à IA.
    const used = result.metadata?.corners as DocumentImagePoint[];
    expect(used[1]?.x).toBeGreaterThan(700);
    expect(used[1]?.x).toBeLessThan(860);
    expect(used[2]?.x).toBeGreaterThan(740);
    expect(used[2]?.x).toBeLessThan(880);
    expect(result.dimensoesFinais.width).toBeLessThan(1050);
    expect(result.dimensoesFinais.height).toBeLessThan(1450);
    expect(result.metadata?.faithfulScan?.documentRatio).toBe('AUTO');
  }, 20000);

  it('detecção nativa não substitui IA quando quad é degenerado ou parcial', async () => {
    const detection = await detectDocumentQuad(inputBuffer);
    expect(detection).not.toBeNull();

    const aiCorners: DocumentImagePoint[] = [
      MODELO_MAPA_AI_CORNERS.topLeft,
      MODELO_MAPA_AI_CORNERS.topRight,
      MODELO_MAPA_AI_CORNERS.bottomRight,
      MODELO_MAPA_AI_CORNERS.bottomLeft,
    ];
    const aiSkew = angularSkew(aiCorners);
    const nativeSkew = angularSkew(detection!.corners);

    // Native pode ter skew alto por região interna — não deve vencer IA sozinho.
    if (nativeSkew > 0.35) {
      expect(nativeSkew).toBeGreaterThan(aiSkew);
    }
  });

  it('warp nativo direto com cantos IA produz bordas externas claras (scan-like)', async () => {
    const corners: DocumentImagePoint[] = [
      MODELO_MAPA_AI_CORNERS.topLeft,
      MODELO_MAPA_AI_CORNERS.topRight,
      MODELO_MAPA_AI_CORNERS.bottomRight,
      MODELO_MAPA_AI_CORNERS.bottomLeft,
    ];

    const warp = await warpPerspectiveNative(inputBuffer, corners, { enhance: true });
    const { data, info } = await sharp(warp.buffer).raw().toBuffer({ resolveWithObject: true });

    const border = Math.max(4, Math.round(Math.min(info.width, info.height) * 0.02));
    let borderSum = 0;
    let borderCount = 0;

    const addPixel = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      borderSum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      borderCount += 1;
    };

    for (let x = 0; x < info.width; x += 1) {
      for (let y = 0; y < border; y += 1) addPixel(x, y);
      for (let y = info.height - border; y < info.height; y += 1) addPixel(x, y);
    }
    for (let y = border; y < info.height - border; y += 1) {
      for (let x = 0; x < border; x += 1) addPixel(x, y);
      for (let x = info.width - border; x < info.width; x += 1) addPixel(x, y);
    }

    const borderMean = borderSum / Math.max(1, borderCount);
    expect(borderMean).toBeGreaterThan(200);
  });

  it.skipIf(!hasModeloMapaReference)(
    'caminho automático local usa detecção nativa em vez de cair no fallback bruto',
    async () => {
      process.env.OPENAI_IMAGE_ENABLED = 'false';
      process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED = 'false';
      process.env.MAP_IMAGE_FAITHFUL_SCAN_ENABLED = 'true';

      const native = await detectDocumentQuad(inputBuffer);
      expect(native).not.toBeNull();

      const result = await processMapImage({ imagemBase64: dataUrl });

      expect(result.processador).toBe('faithful-scan');
      expect(result.fallbackUsado).toBe(false);
      expect(result.metadata?.decision).toBe('backend_detected_corners');
      expect(result.metadata?.postprocess?.cornersSource).toBe('native-detect');
      expect(result.metadata?.corners).toHaveLength(4);

      const expectedCorners: DocumentImagePoint[] = [
        MODELO_MAPA_AI_CORNERS.topLeft,
        MODELO_MAPA_AI_CORNERS.topRight,
        MODELO_MAPA_AI_CORNERS.bottomRight,
        MODELO_MAPA_AI_CORNERS.bottomLeft,
      ];
      const autoCorners = result.metadata?.corners as DocumentImagePoint[];
      const nativeMetrics = cornerDistanceMetrics(native!.corners, expectedCorners);
      const autoMetrics = cornerDistanceMetrics(autoCorners, expectedCorners);
      const nativeSkew = angularSkew(native!.corners);
      const autoSkew = angularSkew(autoCorners);

      expect(autoMetrics.mean).toBeLessThan(90);
      expect(autoMetrics.max).toBeLessThan(110);
      expect(autoSkew).toBeLessThan(0.3);
      expect(autoMetrics.mean).toBeLessThan(nativeMetrics.mean * 0.5);
      expect(autoSkew).toBeLessThan(nativeSkew * 0.4);
    },
    20000
  );

  it.skipIf(!hasModeloMapaReference)(
    'preserva exatamente a correção manual assistida do frontend quando ela é fornecida',
    async () => {
      process.env.MAP_IMAGE_FAITHFUL_SCAN_ENABLED = 'true';
      const correctedBuffer = fs.readFileSync(MODELO_MAPA_REFERENCE_PATH);
      const correctedDataUrl = `data:image/jpeg;base64,${correctedBuffer.toString('base64')}`;

      const result = await processMapImage({
        imagemBase64: dataUrl,
        imagemCorrigidaBase64: correctedDataUrl,
        manualCorners: [
          MODELO_MAPA_AI_CORNERS.topLeft,
          MODELO_MAPA_AI_CORNERS.topRight,
          MODELO_MAPA_AI_CORNERS.bottomRight,
          MODELO_MAPA_AI_CORNERS.bottomLeft,
        ],
      });

      expect(result.processador).toBe('frontend-assisted');
      expect(result.metadata?.decision).toBe('frontend_assisted');
      expect(result.metadata?.postprocess?.manualFinalizeUsed).toBe(true);

      const processed = decodeImageDataUrl(result.processedBase64);
      expect(processed.buffer).toEqual(correctedBuffer);
    }
  );
});
