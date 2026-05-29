import type { OpenAICornersPayload } from './openai-image-processor.js';
import type { DocumentImagePoint } from './document-image-processor.js';

export function cornersPayloadToPoints(corners: OpenAICornersPayload): DocumentImagePoint[] {
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
}

export function pointsToCornersPayload(points: DocumentImagePoint[]): OpenAICornersPayload {
  const [topLeft, topRight, bottomRight, bottomLeft] = points;
  return {
    topLeft: topLeft ?? { x: 0, y: 0 },
    topRight: topRight ?? { x: 0, y: 0 },
    bottomRight: bottomRight ?? { x: 0, y: 0 },
    bottomLeft: bottomLeft ?? { x: 0, y: 0 },
  };
}

export function parseCornersPayload(raw: unknown): OpenAICornersPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const corners = raw as Record<string, unknown>;
  const topLeft = parseCornerPoint(corners.topLeft);
  const topRight = parseCornerPoint(corners.topRight);
  const bottomRight = parseCornerPoint(corners.bottomRight);
  const bottomLeft = parseCornerPoint(corners.bottomLeft);
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
    return undefined;
  }
  return { topLeft, topRight, bottomRight, bottomLeft };
}

function parseCornerPoint(value: unknown): DocumentImagePoint | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as { x?: unknown; y?: unknown };
  if (typeof point.x !== 'number' || typeof point.y !== 'number') return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: point.x, y: point.y };
}
