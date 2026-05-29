import sharp from 'sharp';
import type { DocumentImagePoint } from './document-image-processor.js';

export interface DetectedDocumentQuad {
  corners: DocumentImagePoint[];
  areaRatio: number;
  rectangularity: number;
  threshold: number;
}

export interface DetectDocumentQuadOptions {
  /** Largura de trabalho para a detecção (downscale). */
  workWidth?: number;
  /** Limiar de saturação para considerar conteúdo colorido (mapa). */
  saturationThreshold?: number;
  /** Candidatos de limiar de luminância testados (claro → escuro). */
  luminanceThresholds?: number[];
  /** Área mínima/máxima do quad em relação à imagem. */
  minAreaRatio?: number;
  maxAreaRatio?: number;
  /** Quão "preenchido" o componente deve estar dentro do retângulo. */
  minRectangularity?: number;
  /**
   * Recorte interno aplicado aos cantos (fração da diagonal), puxando a borda
   * para dentro da folha. Remove a fina sobra de mesa / sombra de borda.
   */
  insetRatio?: number;
}

const DEFAULT_WORK_WIDTH = 700;
const DEFAULT_SAT = 45;
// Thresholds do mais alto (mais preciso, evita sombra da mesa) para o mais baixo.
const DEFAULT_LUM_THRESHOLDS = [195, 190, 200, 185, 205];
const DEFAULT_MIN_AREA = 0.12;
const DEFAULT_MAX_AREA = 0.94;
const DEFAULT_MIN_RECTANGULARITY = 0.6;
const DEFAULT_INSET_RATIO = 0.004;

type Pt = [number, number];

function convexHull(points: Pt[]): Pt[] {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Área de um polígono (shoelace). */
function polygonArea(poly: Pt[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) / 2;
}

/**
 * Extrai os 4 cantos do contorno usando quadrantes em torno do centroide.
 * Evita escolher pontos internos (dobras/sombras) quando o hull tem >4 vértices.
 */
function quadCornersFromHull(hull: Pt[]): Pt[] | null {
  if (hull.length < 4) return null;
  if (hull.length === 4) return hull;

  const cx = hull.reduce((sum, p) => sum + p[0], 0) / hull.length;
  const cy = hull.reduce((sum, p) => sum + p[1], 0) / hull.length;

  let tl: Pt | undefined;
  let tr: Pt | undefined;
  let br: Pt | undefined;
  let bl: Pt | undefined;
  let tlScore = Infinity;
  let trScore = -Infinity;
  let brScore = -Infinity;
  let blScore = Infinity;

  for (const p of hull) {
    const sum = p[0] + p[1];
    const diff = p[0] - p[1];
    const inTop = p[1] <= cy;
    const inBottom = p[1] >= cy;
    const inLeft = p[0] <= cx;
    const inRight = p[0] >= cx;

    if (inLeft && inTop && sum < tlScore) {
      tl = p;
      tlScore = sum;
    }
    if (inRight && inTop && diff > trScore) {
      tr = p;
      trScore = diff;
    }
    if (inRight && inBottom && sum > brScore) {
      br = p;
      brScore = sum;
    }
    if (inLeft && inBottom && diff < blScore) {
      bl = p;
      blScore = diff;
    }
  }

  // Fallback global quando algum quadrante fica vazio (hull muito assimétrico).
  for (const p of hull) {
    const sum = p[0] + p[1];
    const diff = p[0] - p[1];
    if (!tl || sum < tl[0] + tl[1]) tl = p;
    if (!br || sum > br[0] + br[1]) br = p;
    if (!tr || diff > tr[0] - tr[1]) tr = p;
    if (!bl || diff < bl[0] - bl[1]) bl = p;
  }

  if (!tl || !tr || !br || !bl) return null;
  return [tl, tr, br, bl];
}

function perpendicularDistance(point: Pt, lineStart: Pt, lineEnd: Pt): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return Math.hypot(point[0] - lineStart[0], point[1] - lineStart[1]);
  const t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lenSq;
  const projX = lineStart[0] + t * dx;
  const projY = lineStart[1] + t * dy;
  return Math.hypot(point[0] - projX, point[1] - projY);
}

function douglasPeuckerOpen(points: Pt[], epsilon: number): Pt[] {
  if (points.length <= 2) return points;
  const start = points[0]!;
  const end = points[points.length - 1]!;
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const dist = perpendicularDistance(points[i]!, start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  if (maxDist <= epsilon) return [start, end];
  const left = douglasPeuckerOpen(points.slice(0, maxIdx + 1), epsilon);
  const right = douglasPeuckerOpen(points.slice(maxIdx), epsilon);
  return left.slice(0, -1).concat(right);
}

function hullPerimeter(hull: Pt[]): number {
  let len = 0;
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

function orderHullClockwise(hull: Pt[]): Pt[] {
  const cx = hull.reduce((sum, p) => sum + p[0], 0) / hull.length;
  const cy = hull.reduce((sum, p) => sum + p[1], 0) / hull.length;
  return [...hull].sort(
    (a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx)
  );
}

/** Reduz o hull para 4 vértices (estilo approxPolyDP do OpenCV). */
function quadFromApproxPoly(hull: Pt[]): Pt[] | null {
  if (hull.length === 4) return hull;
  if (hull.length < 4) return null;
  const ordered = orderHullClockwise(hull);
  const peri = hullPerimeter(ordered);
  const open = [...ordered, ordered[0]!];
  for (const factor of [
    0.004, 0.006, 0.008, 0.01, 0.012, 0.015, 0.018, 0.022, 0.028, 0.035, 0.045, 0.055, 0.07, 0.09,
  ]) {
    const simplified = douglasPeuckerOpen(open, factor * peri);
    const quad = simplified.slice(0, -1);
    if (quad.length === 4) return quad;
  }
  return null;
}

function fitLineTls(points: Pt[]): { a: number; b: number; c: number } | null {
  if (points.length < 3) return null;
  let mx = 0;
  let my = 0;
  for (const [x, y] of points) {
    mx += x;
    my += y;
  }
  mx /= points.length;
  my /= points.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of points) {
    const dx = x - mx;
    const dy = y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const a = -Math.sin(theta);
  const b = Math.cos(theta);
  return { a, b, c: a * mx + b * my };
}

function intersectLines(
  l1: { a: number; b: number; c: number },
  l2: { a: number; b: number; c: number }
): Pt | null {
  const det = l1.a * l2.b - l2.a * l1.b;
  if (Math.abs(det) < 1e-8) return null;
  return [(l1.c * l2.b - l2.c * l1.b) / det, (l2.c * l1.a - l1.c * l2.a) / det];
}

/** Varredura de borda clara da folha contra fundo da mesa. */
function quadFromPaperEdgeScan(lum: Uint8Array, w: number, h: number): Pt[] | null {
  const thresholds = [188, 182, 194, 176, 200];
  for (const paperThreshold of thresholds) {
    const margin = Math.max(4, Math.round(Math.min(w, h) * 0.02));
    const step = Math.max(2, Math.round(Math.min(w, h) / 180));
    const topPts: Pt[] = [];
    const bottomPts: Pt[] = [];
    const leftPts: Pt[] = [];
    const rightPts: Pt[] = [];

    for (let x = margin; x < w - margin; x += step) {
      for (let y = margin; y < Math.round(h * 0.52); y += 1) {
        if (lum[y * w + x]! >= paperThreshold) {
          topPts.push([x, y]);
          break;
        }
      }
      for (let y = h - margin - 1; y >= Math.round(h * 0.48); y -= 1) {
        if (lum[y * w + x]! >= paperThreshold) {
          bottomPts.push([x, y]);
          break;
        }
      }
    }

    for (let y = margin; y < h - margin; y += step) {
      for (let x = margin; x < Math.round(w * 0.52); x += 1) {
        if (lum[y * w + x]! >= paperThreshold) {
          leftPts.push([x, y]);
          break;
        }
      }
      for (let x = w - margin - 1; x >= Math.round(w * 0.48); x -= 1) {
        if (lum[y * w + x]! >= paperThreshold) {
          rightPts.push([x, y]);
          break;
        }
      }
    }

    if (topPts.length < 6 || bottomPts.length < 6 || leftPts.length < 6 || rightPts.length < 6) {
      continue;
    }

    const top = fitLineTls(topPts);
    const bottom = fitLineTls(bottomPts);
    const left = fitLineTls(leftPts);
    const right = fitLineTls(rightPts);
    if (!top || !bottom || !left || !right) continue;

    const tl = intersectLines(top, left);
    const tr = intersectLines(top, right);
    const br = intersectLines(bottom, right);
    const bl = intersectLines(bottom, left);
    if (!tl || !tr || !br || !bl) continue;

    const corners = [tl, tr, br, bl];
    const inBounds = corners.every(([x, y]) => x >= -8 && y >= -8 && x <= w + 8 && y <= h + 8);
    if (!inBounds) continue;

    const area = quadArea(corners) / (w * h);
    if (area < 0.35 || area > 0.82) continue;
    return corners;
  }
  return null;
}

function angularSkewFromPts(points: Pt[]): number {
  const pts = points.map(([x, y]) => ({ x, y }));
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

function scoreDocumentQuad(corners: Pt[], w: number, h: number): number {
  const area = quadArea(corners) / (w * h);
  if (area < 0.35 || area > 0.82) return -1;
  const skew = angularSkewFromPts(corners);
  if (skew < 0.08) return -1;
  const idealArea = 0.64;
  const areaScore = 1 - Math.min(1, Math.abs(area - idealArea) / idealArea);
  return areaScore * (1 + Math.min(skew, 0.35) * 2);
}

function clampPoint(p: Pt, w: number, h: number): Pt {
  return [Math.max(0, Math.min(w, p[0])), Math.max(0, Math.min(h, p[1]))];
}

function pickDocumentQuad(
  _mask: Uint8Array,
  hull: Pt[],
  w: number,
  h: number,
  lum: Uint8Array
): Pt[] | null {
  const candidates: Pt[][] = [];
  const edgeScan = quadFromPaperEdgeScan(lum, w, h);
  if (edgeScan) candidates.push(edgeScan);
  const fromApprox = quadFromApproxPoly(hull);
  if (fromApprox) candidates.push(fromApprox);
  const fromHull = quadCornersFromHull(hull);
  if (fromHull) candidates.push(fromHull);

  let best: Pt[] | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = scoreDocumentQuad(candidate, w, h);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (!best) return null;
  return best.map((p) => clampPoint(p, w, h));
}

function quadArea(corners: Pt[]): number {
  return polygonArea(corners);
}

/**
 * Background flood-fill a partir das bordas da imagem.
 * Semeia pixels de borda com lum < bgThreshold (mesa cinza) e propaga pela
 * 4-vizinhança todos os pixels contíguos abaixo desse limiar. Tudo que não for
 * atingido é "documento" (folha) — incluindo o mapa escuro que fica cercado
 * pela margem branca da folha, sem precisar de dilatação.
 */
function backgroundFloodFill(
  lum: Uint8Array,
  w: number,
  h: number,
  bgThreshold: number
): Uint8Array {
  const total = w * h;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let qHead = 0;
  let qTail = 0;

  const enqueue = (i: number) => {
    if (visited[i]) return;
    visited[i] = 1;
    queue[qTail++] = i;
  };

  for (let x = 0; x < w; x += 1) {
    if ((lum[x] ?? 0) < bgThreshold) enqueue(x);
    const bot = (h - 1) * w + x;
    if ((lum[bot] ?? 0) < bgThreshold) enqueue(bot);
  }
  for (let y = 1; y < h - 1; y += 1) {
    const left = y * w;
    if ((lum[left] ?? 0) < bgThreshold) enqueue(left);
    const right = y * w + w - 1;
    if ((lum[right] ?? 0) < bgThreshold) enqueue(right);
  }

  while (qHead < qTail) {
    const idx = queue[qHead++]!;
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) {
      const n = idx - 1;
      if (!visited[n] && (lum[n] ?? 0) < bgThreshold) enqueue(n);
    }
    if (x < w - 1) {
      const n = idx + 1;
      if (!visited[n] && (lum[n] ?? 0) < bgThreshold) enqueue(n);
    }
    if (y > 0) {
      const n = idx - w;
      if (!visited[n] && (lum[n] ?? 0) < bgThreshold) enqueue(n);
    }
    if (y < h - 1) {
      const n = idx + w;
      if (!visited[n] && (lum[n] ?? 0) < bgThreshold) enqueue(n);
    }
  }

  // Documento = tudo que NÃO é fundo (não atingido pelo flood fill)
  const doc = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) doc[i] = visited[i] ? 0 : 1;
  return doc;
}

function largestComponentArea(
  mask: Uint8Array,
  w: number,
  h: number
): { points: Pt[]; count: number } {
  const total = w * h;
  const label = new Int32Array(total);
  const stack = new Int32Array(total);
  let bestId = 0;
  let bestCount = 0;
  let current = 0;
  for (let s = 0; s < total; s += 1) {
    if (mask[s] !== 1 || label[s] !== 0) continue;
    current += 1;
    let sp = 0;
    let count = 0;
    stack[sp++] = s;
    label[s] = current;
    while (sp > 0) {
      const idx = stack[--sp]!;
      count += 1;
      const x = idx % w;
      const y = (idx / w) | 0;
      if (x > 0 && mask[idx - 1] === 1 && label[idx - 1] === 0) {
        label[idx - 1] = current;
        stack[sp++] = idx - 1;
      }
      if (x < w - 1 && mask[idx + 1] === 1 && label[idx + 1] === 0) {
        label[idx + 1] = current;
        stack[sp++] = idx + 1;
      }
      if (y > 0 && mask[idx - w] === 1 && label[idx - w] === 0) {
        label[idx - w] = current;
        stack[sp++] = idx - w;
      }
      if (y < h - 1 && mask[idx + w] === 1 && label[idx + w] === 0) {
        label[idx + w] = current;
        stack[sp++] = idx + w;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestId = current;
    }
  }

  const points: Pt[] = [];
  if (bestId !== 0) {
    for (let i = 0; i < total; i += 1) {
      if (label[i] === bestId) points.push([i % w, (i / w) | 0]);
    }
  }
  return { points, count: bestCount };
}

function sampleBilinear(lum: Uint8Array, w: number, h: number, x: number, y: number): number {
  if (x < 0) x = 0;
  else if (x > w - 1) x = w - 1;
  if (y < 0) y = 0;
  else if (y > h - 1) y = h - 1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 < w - 1 ? x0 + 1 : x0;
  const y1 = y0 < h - 1 ? y0 + 1 : y0;
  const fx = x - x0;
  const fy = y - y0;
  const a = lum[y0 * w + x0]!;
  const b = lum[y0 * w + x1]!;
  const c = lum[y1 * w + x0]!;
  const d = lum[y1 * w + x1]!;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Refina uma aresta do papel: parte de cada ponto amostrado na aresta inicial e
 * varre perpendicularmente (band) procurando a transição mesa→papel sustentada
 * mais externa. Devolve os pontos de borda encontrados (descartando trechos de
 * baixo contraste, ex.: sombra). Robusto contra dobras/linhas internas porque só
 * busca a transição que permanece clara ao entrar na folha.
 */
function refineEdgePoints(
  lum: Uint8Array,
  w: number,
  h: number,
  a: Pt,
  b: Pt,
  outward: Pt,
  band: number,
  samples: number
): Pt[] {
  const edgePoints: Pt[] = [];
  const minStep = 6;
  const win = Math.max(3, Math.round(band * 0.25));
  for (let s = 0; s <= samples; s += 1) {
    const t = s / samples;
    const px = a[0] + (b[0] - a[0]) * t;
    const py = a[1] + (b[1] - a[1]) * t;
    const profile: number[] = [];
    for (let d = -band; d <= band; d += 1) {
      profile.push(sampleBilinear(lum, w, h, px + outward[0] * d, py + outward[1] * d));
    }
    const n = profile.length;
    // Passo claro→escuro (interior do papel mais claro que a mesa) via diferença
    // de medianas deslizante. Mais robusto que limiar fixo em baixo contraste.
    let maxStep = 0;
    const steps = new Float32Array(n);
    for (let i = win; i < n - win; i += 1) {
      const inside = median(profile.slice(i - win, i));
      const outside = median(profile.slice(i + 1, i + 1 + win));
      const step = inside - outside;
      steps[i] = step;
      if (step > maxStep) maxStep = step;
    }
    if (maxStep < minStep) continue;
    // Prefere a transição mais externa que ainda seja um passo forte.
    const accept = Math.max(minStep, maxStep * 0.6);
    let edgeIdx = -1;
    for (let i = n - win - 1; i >= win; i -= 1) {
      if (steps[i]! >= accept) {
        edgeIdx = i;
        break;
      }
    }
    if (edgeIdx < 0) continue;
    const d = edgeIdx - band;
    edgePoints.push([px + outward[0] * d, py + outward[1] * d]);
  }
  return edgePoints;
}

function refineEdgePointsPaperAware(
  lum: Uint8Array,
  w: number,
  h: number,
  a: Pt,
  b: Pt,
  outward: Pt,
  band: number,
  samples: number
): Pt[] {
  const edgePoints: Pt[] = [];
  const minStep = 6;
  const minPaperLuma = 176;
  const win = Math.max(3, Math.round(band * 0.25));
  for (let s = 0; s <= samples; s += 1) {
    const t = s / samples;
    const px = a[0] + (b[0] - a[0]) * t;
    const py = a[1] + (b[1] - a[1]) * t;
    const profile: number[] = [];
    for (let d = -band; d <= band; d += 1) {
      profile.push(sampleBilinear(lum, w, h, px + outward[0] * d, py + outward[1] * d));
    }
    const n = profile.length;
    let maxStep = 0;
    const steps = new Float32Array(n);
    const insideMedians = new Float32Array(n);
    for (let i = win; i < n - win; i += 1) {
      const inside = median(profile.slice(i - win, i));
      const outside = median(profile.slice(i + 1, i + 1 + win));
      const step = inside - outside;
      steps[i] = step;
      insideMedians[i] = inside;
      if (step > maxStep) maxStep = step;
    }
    if (maxStep < minStep) continue;

    const accept = Math.max(minStep, maxStep * 0.6);
    let edgeIdx = -1;
    for (let i = n - win - 1; i >= win; i -= 1) {
      if (steps[i]! >= accept && insideMedians[i]! >= minPaperLuma) {
        edgeIdx = i;
        break;
      }
    }

    if (edgeIdx < 0) {
      let bestScore = -Infinity;
      for (let i = n - win - 1; i >= win; i -= 1) {
        const score = steps[i]! + Math.max(0, insideMedians[i]! - minPaperLuma) * 0.35;
        if (score > bestScore) {
          bestScore = score;
          edgeIdx = i;
        }
      }
    }

    if (edgeIdx < 0) continue;
    const d = edgeIdx - band;
    edgePoints.push([px + outward[0] * d, py + outward[1] * d]);
  }
  if (edgePoints.length === 0) {
    return refineEdgePoints(lum, w, h, a, b, outward, band, samples);
  }
  return edgePoints;
}

function fitLineRobust(points: Pt[]): { a: number; b: number; c: number } | null {
  let line = fitLineTls(points);
  if (!line) return null;
  for (let iter = 0; iter < 2; iter += 1) {
    const residuals = points.map((p) => Math.abs(line!.a * p[0] + line!.b * p[1] - line!.c));
    const med = median(residuals);
    const cutoff = Math.max(2, med * 2.5);
    const inliers = points.filter((_, i) => residuals[i]! <= cutoff);
    if (inliers.length < 3 || inliers.length === points.length) break;
    const refit = fitLineTls(inliers);
    if (!refit) break;
    line = refit;
    points = inliers;
  }
  return line;
}

export interface RefinedCornersResult {
  corners: DocumentImagePoint[];
  /** Fração de arestas com pontos de borda suficientes (0..1). */
  edgeCoverage: number;
  /** Pontos de borda detectados por aresta [top, right, bottom, left]. */
  edgePointCounts: [number, number, number, number];
}

/**
 * Refina os 4 cantos do documento a partir de uma estimativa inicial (ex.: IA),
 * encaixando cada aresta na borda física real do papel. Determinístico, Node puro.
 * Retorna null se a estimativa não permitir refino confiável.
 */
export async function refineDocumentCorners(
  inputBuffer: Buffer,
  initialCorners: DocumentImagePoint[],
  options: { workWidth?: number; bandRatio?: number; samples?: number } = {}
): Promise<RefinedCornersResult | null> {
  if (initialCorners.length !== 4) return null;
  const workWidth = options.workWidth ?? 900;
  const samples = options.samples ?? 48;

  const meta = await sharp(inputBuffer, { failOn: 'none' }).rotate().metadata();
  const fullWidth = meta.width ?? 0;
  const fullHeight = meta.height ?? 0;
  if (fullWidth === 0 || fullHeight === 0) return null;

  const { data, info } = await sharp(inputBuffer, { failOn: 'none' })
    .rotate()
    .resize({ width: Math.min(workWidth, fullWidth) })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  if (ch < 3) return null;
  const scale = fullWidth / w;

  const lum = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < w * h; i += 1, p += ch) {
    lum[i] = (data[p]! * 0.299 + data[p + 1]! * 0.587 + data[p + 2]! * 0.114) | 0;
  }

  // Cantos iniciais ordenados [tl,tr,br,bl] em coords de trabalho.
  const ordered = ((): Pt[] => {
    const pts = initialCorners.map((c): Pt => [c.x / scale, c.y / scale]);
    const bySum = [...pts].sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
    const byDiff = [...pts].sort((p, q) => p[1] - p[0] - (q[1] - q[0]));
    return [bySum[0]!, byDiff[0]!, bySum[3]!, byDiff[3]!];
  })();
  const [tl, tr, br, bl] = ordered;

  const cx = (tl![0] + tr![0] + br![0] + bl![0]) / 4;
  const cy = (tl![1] + tr![1] + br![1] + bl![1]) / 4;
  const band = Math.max(12, Math.round(Math.min(w, h) * (options.bandRatio ?? 0.08)));

  // Para cada aresta calcula a normal apontando para fora (longe do centroide).
  const outwardNormal = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if (nx * (mx - cx) + ny * (my - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return [nx, ny];
  };

  const edges: Array<{ a: Pt; b: Pt }> = [
    { a: tl!, b: tr! },
    { a: tr!, b: br! },
    { a: br!, b: bl! },
    { a: bl!, b: tl! },
  ];

  // Linha "segura" pela aresta inicial, deslocada levemente para fora (não corta
  // conteúdo quando o refino da aresta não é confiável).
  const safeMargin = Math.max(8, Math.round(Math.min(w, h) * 0.03));
  const lineFromInitialEdge = (a: Pt, b: Pt, outward: Pt): { a: number; b: number; c: number } => {
    const ca = outward[0] * a[0] + outward[1] * a[1];
    const cb = outward[0] * b[0] + outward[1] * b[1];
    return { a: outward[0], b: outward[1], c: (ca + cb) / 2 + safeMargin };
  };

  const minPtsForLine = Math.max(10, Math.round(samples * 0.35));
  const lines: Array<{ a: number; b: number; c: number }> = [];
  const edgePointCounts: [number, number, number, number] = [0, 0, 0, 0];
  let coveredEdges = 0;
  for (let e = 0; e < edges.length; e += 1) {
    const { a, b } = edges[e]!;
    const outward = outwardNormal(a, b);
    const pts = refineEdgePointsPaperAware(lum, w, h, a, b, outward, band, samples);
    edgePointCounts[e] = pts.length;
    const fitted = pts.length >= minPtsForLine ? fitLineRobust(pts) : null;
    if (fitted) {
      coveredEdges += 1;
      lines.push(fitted);
    } else {
      lines.push(lineFromInitialEdge(a, b, outward));
    }
  }

  const cornerFromLines = (
    l1: { a: number; b: number; c: number },
    l2: { a: number; b: number; c: number },
    fb: Pt
  ): Pt => {
    const p = intersectLines(l1, l2);
    if (!p) return fb;
    if (p[0] < -band * 2 || p[1] < -band * 2 || p[0] > w + band * 2 || p[1] > h + band * 2)
      return fb;
    return p;
  };

  const lineTop = lines[0]!;
  const lineRight = lines[1]!;
  const lineBottom = lines[2]!;
  const lineLeft = lines[3]!;
  const refined: Pt[] = [
    cornerFromLines(lineLeft, lineTop, tl!),
    cornerFromLines(lineTop, lineRight, tr!),
    cornerFromLines(lineRight, lineBottom, br!),
    cornerFromLines(lineBottom, lineLeft, bl!),
  ];

  const area = quadArea(refined) / (w * h);
  if (area < 0.25 || area > 0.95) return null;

  return {
    corners: refined.map(([x, y]) => ({
      x: Math.max(0, Math.min(fullWidth, x * scale)),
      y: Math.max(0, Math.min(fullHeight, y * scale)),
    })),
    edgeCoverage: coveredEdges / 4,
    edgePointCounts,
  };
}

export interface DocumentEdgeCurves {
  /** Pontos de borda detectados por aresta, em coords da imagem original. */
  top: DocumentImagePoint[];
  right: DocumentImagePoint[];
  bottom: DocumentImagePoint[];
  left: DocumentImagePoint[];
  /** Cantos [tl, tr, br, bl] em coords da imagem original. */
  corners: [DocumentImagePoint, DocumentImagePoint, DocumentImagePoint, DocumentImagePoint];
  /** Fração de arestas com pontos suficientes (0..1). */
  edgeCoverage: number;
}

/**
 * Extrai as 4 curvas de borda do documento (não apenas cantos) a partir de uma
 * estimativa inicial. Cada aresta vem como polilinha de pontos detectados na
 * borda física real — usado pelo dewarping por malha. Node puro.
 */
export async function detectDocumentEdgeCurves(
  inputBuffer: Buffer,
  initialCorners: DocumentImagePoint[],
  options: { workWidth?: number; bandRatio?: number; samples?: number } = {}
): Promise<DocumentEdgeCurves | null> {
  if (initialCorners.length !== 4) return null;
  const workWidth = options.workWidth ?? 900;
  const samples = options.samples ?? 64;

  const meta = await sharp(inputBuffer, { failOn: 'none' }).rotate().metadata();
  const fullWidth = meta.width ?? 0;
  const fullHeight = meta.height ?? 0;
  if (fullWidth === 0 || fullHeight === 0) return null;

  const { data, info } = await sharp(inputBuffer, { failOn: 'none' })
    .rotate()
    .resize({ width: Math.min(workWidth, fullWidth) })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  if (ch < 3) return null;
  const scale = fullWidth / w;

  const lum = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < w * h; i += 1, p += ch) {
    lum[i] = (data[p]! * 0.299 + data[p + 1]! * 0.587 + data[p + 2]! * 0.114) | 0;
  }

  const pts = initialCorners.map((c): Pt => [c.x / scale, c.y / scale]);
  const bySum = [...pts].sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
  const byDiff = [...pts].sort((p, q) => p[1] - p[0] - (q[1] - q[0]));
  const tl = bySum[0]!;
  const tr = byDiff[0]!;
  const br = bySum[3]!;
  const bl = byDiff[3]!;

  const cx = (tl[0] + tr[0] + br[0] + bl[0]) / 4;
  const cy = (tl[1] + tr[1] + br[1] + bl[1]) / 4;
  const band = Math.max(12, Math.round(Math.min(w, h) * (options.bandRatio ?? 0.08)));

  const outwardNormal = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if (nx * (mx - cx) + ny * (my - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return [nx, ny];
  };

  const toOriginal = (pp: Pt[]): DocumentImagePoint[] =>
    pp.map(([x, y]) => ({
      x: Math.max(0, Math.min(fullWidth, x * scale)),
      y: Math.max(0, Math.min(fullHeight, y * scale)),
    }));

  const edges: Array<{ a: Pt; b: Pt }> = [
    { a: tl, b: tr },
    { a: tr, b: br },
    { a: br, b: bl },
    { a: bl, b: tl },
  ];
  const sides = edges.map(({ a, b }) =>
    refineEdgePointsPaperAware(lum, w, h, a, b, outwardNormal(a, b), band, samples)
  );
  const minPts = Math.max(6, Math.round(samples * 0.25));
  const coveredEdges = sides.filter((s) => s.length >= minPts).length;

  return {
    top: toOriginal(sides[0]!),
    right: toOriginal(sides[1]!),
    bottom: toOriginal(sides[2]!),
    left: toOriginal(sides[3]!),
    corners: [
      { x: tl[0] * scale, y: tl[1] * scale },
      { x: tr[0] * scale, y: tr[1] * scale },
      { x: br[0] * scale, y: br[1] * scale },
      { x: bl[0] * scale, y: bl[1] * scale },
    ],
    edgeCoverage: coveredEdges / 4,
  };
}

/**
 * Detecta o quadrilátero do documento (folha) sobre um fundo de mesa.
 * Estratégia: máscara de primeiro plano = pixels claros (margens brancas)
 * OU saturados (mapa colorido); maior componente conectado; convex hull;
 * retângulo de área mínima. Tudo em Node puro (sem Python/OpenCV).
 *
 * Retorna null quando nenhum quad confiável é encontrado (cabe ao chamador
 * usar os cantos da IA como fallback).
 */
export async function detectDocumentQuad(
  inputBuffer: Buffer,
  options: DetectDocumentQuadOptions = {}
): Promise<DetectedDocumentQuad | null> {
  const workWidth = options.workWidth ?? DEFAULT_WORK_WIDTH;
  const sat = options.saturationThreshold ?? DEFAULT_SAT;
  const lumThresholds = options.luminanceThresholds ?? DEFAULT_LUM_THRESHOLDS;
  const minAreaRatio = options.minAreaRatio ?? DEFAULT_MIN_AREA;
  const maxAreaRatio = options.maxAreaRatio ?? DEFAULT_MAX_AREA;
  const minRectangularity = options.minRectangularity ?? DEFAULT_MIN_RECTANGULARITY;
  const insetRatio = options.insetRatio ?? DEFAULT_INSET_RATIO;

  const meta = await sharp(inputBuffer, { failOn: 'none' }).rotate().metadata();
  const fullWidth = meta.width ?? 0;
  const fullHeight = meta.height ?? 0;
  if (fullWidth === 0 || fullHeight === 0) return null;

  const { data, info } = await sharp(inputBuffer, { failOn: 'none' })
    .rotate()
    .resize({ width: Math.min(workWidth, fullWidth) })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  if (ch < 3) return null;
  const total = w * h;
  const scale = fullWidth / w;

  const lum = new Uint8Array(total);
  const satMask = new Uint8Array(total);
  for (let i = 0, p = 0; i < total; i += 1, p += ch) {
    const r = data[p]!;
    const g = data[p + 1]!;
    const b = data[p + 2]!;
    lum[i] = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
    satMask[i] = Math.max(r, g, b) - Math.min(r, g, b) > sat ? 1 : 0;
  }

  let bestQuad: DetectedDocumentQuad | null = null;

  // Estratégia primária: background flood-fill.
  // A mesa cinza (fundo) é inundada a partir das bordas; o que sobrar é folha.
  // Isso engloba o mapa escuro cercado pela margem branca — sem dilatação.
  const bgThresholds = [148, 155, 140, 160];
  const fallbackThresholds = lumThresholds;
  const allThresholds: Array<{ t: number; mode: 'flood' | 'lum' }> = [
    ...bgThresholds.map((t) => ({ t, mode: 'flood' as const })),
    ...fallbackThresholds.map((t) => ({ t, mode: 'lum' as const })),
  ];

  for (const { t, mode } of allThresholds) {
    const mask =
      mode === 'flood'
        ? backgroundFloodFill(lum, w, h, t)
        : (() => {
            const m = new Uint8Array(total);
            for (let i = 0; i < total; i += 1) m[i] = lum[i]! > t || satMask[i] === 1 ? 1 : 0;
            return m;
          })();
    const { points } = largestComponentArea(mask, w, h);
    if (points.length < 8) continue;

    const hull = convexHull(points);
    if (hull.length < 3) continue;
    const hullArea = polygonArea(hull);
    const areaRatio = hullArea / total;
    if (areaRatio < minAreaRatio || areaRatio > maxAreaRatio) continue;

    const quadCorners = pickDocumentQuad(mask, hull, w, h, lum);
    if (!quadCorners) continue;
    const quadAreaValue = quadArea(quadCorners);
    if (quadAreaValue <= 0) continue;

    // O contorno (hull) deve preencher bem o quadrilátero da folha:
    // garante que a folha é aproximadamente um retângulo inclinado, não uma forma em L.
    const rectangularity = hullArea / quadAreaValue;
    if (rectangularity < minRectangularity) continue;

    const scaled = quadCorners.map(([x, y]): Pt => [x * scale, y * scale]);
    const cx = (scaled[0]![0] + scaled[1]![0] + scaled[2]![0] + scaled[3]![0]) / 4;
    const cy = (scaled[0]![1] + scaled[1]![1] + scaled[2]![1] + scaled[3]![1]) / 4;
    const diag = Math.hypot(fullWidth, fullHeight);
    const inset = diag * insetRatio;
    const corners = scaled.map(([x, y]) => {
      const dx = cx - x;
      const dy = cy - y;
      const d = Math.hypot(dx, dy) || 1;
      return {
        x: Math.max(0, Math.min(fullWidth, x + (dx / d) * inset)),
        y: Math.max(0, Math.min(fullHeight, y + (dy / d) * inset)),
      };
    });

    const candidate: DetectedDocumentQuad = {
      corners,
      areaRatio,
      rectangularity,
      threshold: t,
    };

    const angularSkewFromCorners = (pts: DocumentImagePoint[]): number => {
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
    };

    // Prefere folha grande com perspectiva real; descarta quads degenerados.
    const candidateScore = (q: DetectedDocumentQuad): number => {
      const skew = angularSkewFromCorners(q.corners);
      if (skew < 0.008) return q.areaRatio * 0.5;
      return q.areaRatio * (1 + Math.min(skew, 0.35) * 2);
    };

    if (!bestQuad || candidateScore(candidate) > candidateScore(bestQuad) + 0.001) {
      bestQuad = candidate;
    }
  }

  return bestQuad;
}
