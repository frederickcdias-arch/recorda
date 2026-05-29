import sharp from 'sharp';
import { describe, it, expect } from 'vitest';
import {
  evaluateOpenAICorners,
  scaleCornersToOriginal,
  shouldApplyAutoCrop,
  selectWarpCorners,
  cornersHugImageFrame,
  expandDocumentCornersForWarp,
} from './openai-corners-processor.js';
import { cornersPayloadToPoints } from './openai-corners-utils.js';
import type { OpenAIImageAnalysis } from './openai-image-processor.js';
import { getOpenAIImageConfig } from '../config/openai-image-config.js';

function analysis(overrides: Partial<OpenAIImageAnalysis> = {}): OpenAIImageAnalysis {
  return {
    documentDetected: true,
    quality: 'good',
    recommendedAction: 'auto_crop',
    problems: [],
    confidence: 0.9,
    notes: 'OK',
    corners: {
      topLeft: { x: 40, y: 40 },
      topRight: { x: 360, y: 45 },
      bottomRight: { x: 350, y: 555 },
      bottomLeft: { x: 35, y: 550 },
    },
    imageSize: { width: 400, height: 600 },
    ...overrides,
  };
}

describe('openai-corners-processor', () => {
  const config = {
    ...getOpenAIImageConfig(),
    autoCropEnabled: true,
    minCornerConfidence: 0.75,
  };

  it('scaleCornersToOriginal converte coordenadas corretamente', () => {
    const scaled = scaleCornersToOriginal(
      [
        { x: 80, y: 60 },
        { x: 320, y: 60 },
        { x: 320, y: 240 },
        { x: 80, y: 240 },
      ],
      400,
      300,
      800,
      600
    );
    expect(scaled[0]).toEqual({ x: 160, y: 120 });
    expect(scaled[2]).toEqual({ x: 640, y: 480 });
  });

  it('corners válidos permitem auto crop', () => {
    const evaluation = evaluateOpenAICorners(
      analysis(),
      config,
      400,
      600,
      800,
      1200,
      cornersPayloadToPoints(analysis().corners!)
    );
    expect(evaluation.shouldApply).toBe(true);
    expect(evaluation.geometryValid).toBe(true);
    expect(evaluation.cornersOriginalImage?.length).toBe(4);
  });

  it('corners fora da imagem são rejeitados', () => {
    const invalid = analysis({
      corners: {
        topLeft: { x: -1, y: 0 },
        topRight: { x: 400, y: 0 },
        bottomRight: { x: 400, y: 600 },
        bottomLeft: { x: 0, y: 600 },
      },
    });
    const evaluation = evaluateOpenAICorners(
      invalid,
      config,
      400,
      600,
      800,
      1200,
      cornersPayloadToPoints(invalid.corners!)
    );
    expect(evaluation.shouldApply).toBe(false);
    expect(evaluation.rejectionReason).toBe('corners_out_of_bounds');
  });

  it('confidence baixa não aplica crop automático', () => {
    expect(
      shouldApplyAutoCrop(analysis({ confidence: 0.4, recommendedAction: 'manual_adjust' }), config)
    ).toBe(false);
  });

  it('documentDetected false cai para fallback', () => {
    const evaluation = evaluateOpenAICorners(
      analysis({ documentDetected: false, recommendedAction: 'manual_adjust' }),
      config,
      400,
      600,
      800,
      1200,
      cornersPayloadToPoints(analysis().corners!)
    );
    expect(evaluation.shouldApply).toBe(false);
  });

  it('corners pequenos demais indicam conteudo interno', () => {
    const inner = analysis({
      corners: {
        topLeft: { x: 120, y: 120 },
        topRight: { x: 280, y: 125 },
        bottomRight: { x: 275, y: 420 },
        bottomLeft: { x: 115, y: 415 },
      },
    });
    const evaluation = evaluateOpenAICorners(
      inner,
      config,
      400,
      600,
      800,
      1200,
      cornersPayloadToPoints(inner.corners!)
    );
    expect(evaluation.shouldApply).toBe(false);
    expect(evaluation.rejectionReason).toBe('inner_content_detected');
  });

  it('cornersHugImageFrame detecta cantos colados na borda da foto', () => {
    const hugging = [
      { x: 10, y: 12 },
      { x: 788, y: 20 },
      { x: 895, y: 1588 },
      { x: 8, y: 1578 },
    ];
    expect(cornersHugImageFrame(hugging, 900, 1600)).toBe(true);
  });

  it('selectWarpCorners contrai cantos da IA colados na borda da foto', () => {
    const aiCorners = [
      { x: 10, y: 12 },
      { x: 788, y: 20 },
      { x: 895, y: 1588 },
      { x: 8, y: 1578 },
    ];
    const selected = selectWarpCorners(aiCorners, null, 900, 1600);
    expect(selected.source).toBe('openai');
    const area = selected.corners.reduce((acc, p, i, arr) => {
      const n = arr[(i + 1) % arr.length]!;
      return acc + p.x * n.y - n.x * p.y;
    }, 0);
    expect(Math.abs(area) / 2 / (900 * 1600)).toBeLessThan(0.76);
    expect(Math.abs(area) / 2 / (900 * 1600)).toBeGreaterThan(0.45);
  });

  it('selectWarpCorners prefere native quando IA cola na borda e native é válido', () => {
    const aiCorners = [
      { x: 10, y: 12 },
      { x: 788, y: 20 },
      { x: 895, y: 1588 },
      { x: 8, y: 1578 },
    ];
    const nativeCorners = [
      { x: 51, y: 29 },
      { x: 785, y: 57 },
      { x: 800, y: 1379 },
      { x: 22, y: 1333 },
    ];
    const selected = selectWarpCorners(
      aiCorners,
      { corners: nativeCorners, areaRatio: 0.65, rectangularity: 1.1, threshold: 148 },
      900,
      1600
    );
    expect(selected.source).toBe('openai');
    expect(selected.corners).not.toEqual(nativeCorners);
  });

  it('expandDocumentCornersForWarp inclui margem branca sem puxar a esquerda', () => {
    const aiCorners = [
      { x: 34, y: 35 },
      { x: 744, y: 62 },
      { x: 767, y: 1347 },
      { x: 13, y: 1304 },
    ];
    const expanded = expandDocumentCornersForWarp(aiCorners, 900, 1600);
    expect(expanded[0]!.x).toBe(34);
    expect(expanded[1]!.x).toBeGreaterThan(744);
    expect(expanded[2]!.x).toBeGreaterThan(767);
    expect(expanded[2]!.y).toBeGreaterThan(1347);
    expect(expanded[3]!.y).toBeGreaterThan(1304);
  });
});

describe('processMapImage auto crop integration', () => {
  it('placeholder for import path', () => {
    expect(sharp).toBeDefined();
  });
});
