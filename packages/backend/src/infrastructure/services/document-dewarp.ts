import sharp from 'sharp';
import type { DocumentImagePoint } from './document-image-processor.js';
import { detectDocumentEdgeCurves } from './node-document-detect.js';

export interface DewarpResult {
  /** JPEG quando returnRaw=false; RGB cru quando returnRaw=true. */
  buffer: Buffer;
  width: number;
  height: number;
  inputWidth: number;
  inputHeight: number;
  /** Curvatura máxima medida nas bordas (px), indica quanto o papel estava dobrado. */
  maxEdgeBow: number;
  edgeCoverage: number;
  isRaw: boolean;
}

interface Vec {
  x: number;
  y: number;
}

/** Curva paramétrica c(t) = A t² + B t + C, por componente. */
interface Curve {
  ax: number;
  bx: number;
  cx: number;
  ay: number;
  by: number;
  cy: number;
}

function evalCurve(c: Curve, t: number): Vec {
  return {
    x: c.ax * t * t + c.bx * t + c.cx,
    y: c.ay * t * t + c.by * t + c.cy,
  };
}

/** Mínimos quadrados para v = a t² + b t + c (matriz normal 3×3). */
function fitQuadratic(ts: number[], vs: number[]): [number, number, number] | null {
  const n = ts.length;
  if (n < 3) return null;
  const s0 = n;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let t0 = 0;
  let t1 = 0;
  let t2 = 0;
  for (let i = 0; i < n; i += 1) {
    const t = ts[i]!;
    const v = vs[i]!;
    const tt = t * t;
    s1 += t;
    s2 += tt;
    s3 += tt * t;
    s4 += tt * tt;
    t0 += v;
    t1 += v * t;
    t2 += v * tt;
  }
  // Resolve [[s4 s3 s2],[s3 s2 s1],[s2 s1 s0]] · [a b c] = [t2 t1 t0]
  const m = [
    [s4, s3, s2, t2],
    [s3, s2, s1, t1],
    [s2, s1, s0, t0],
  ];
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 3; r += 1) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const pv = m[col]![col]!;
    for (let cc = col; cc < 4; cc += 1) m[col]![cc]! /= pv;
    for (let r = 0; r < 3; r += 1) {
      if (r === col) continue;
      const f = m[r]![col]!;
      for (let cc = col; cc < 4; cc += 1) m[r]![cc]! -= f * m[col]![cc]!;
    }
  }
  return [m[0]![3]!, m[1]![3]!, m[2]![3]!];
}

/**
 * Ajusta uma curva quadrática pelos pontos da borda, parametrizada pela projeção
 * no acorde start→end, e fixa os extremos nos cantos (preserva a curvatura).
 */
const MIN_QUAD_POINTS = 14;
const MAX_BOW_RATIO = 0.06;

function straightCurve(start: Vec, end: Vec): Curve {
  return { ax: 0, bx: end.x - start.x, cx: start.x, ay: 0, by: end.y - start.y, cy: start.y };
}

function pinEndpoints(curve: Curve, start: Vec, end: Vec): Curve {
  const f0 = evalCurve(curve, 0);
  const f1 = evalCurve(curve, 1);
  const e0x = start.x - f0.x;
  const e0y = start.y - f0.y;
  const e1x = end.x - f1.x;
  const e1y = end.y - f1.y;
  // (1-t)e0 + t e1 = e0 + t(e1-e0) → adiciona termo linear (b) e constante (c).
  return {
    ax: curve.ax,
    bx: curve.bx + (e1x - e0x),
    cx: curve.cx + e0x,
    ay: curve.ay,
    by: curve.by + (e1y - e0y),
    cy: curve.cy + e0y,
  };
}

/**
 * Ajusta uma curva quadrática pelos pontos da borda (parametrizada pela projeção
 * no acorde) e fixa os extremos nos cantos. Usa reta quando há poucos pontos ou
 * quando a flecha resultante é grande demais (proteção contra overfit).
 */
function fitEdgeCurve(points: DocumentImagePoint[], start: Vec, end: Vec): Curve {
  const chordLen = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  if (points.length < MIN_QUAD_POINTS) {
    return straightCurve(start, end);
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy || 1;
  const ts: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of points) {
    let t = ((p.x - start.x) * dx + (p.y - start.y) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    ts.push(t);
    xs.push(p.x);
    ys.push(p.y);
  }
  const fx = fitQuadratic(ts, xs);
  const fy = fitQuadratic(ts, ys);
  if (!fx || !fy) {
    return straightCurve(start, end);
  }
  const pinned = pinEndpoints(
    { ax: fx[0], bx: fx[1], cx: fx[2], ay: fy[0], by: fy[1], cy: fy[2] },
    start,
    end
  );
  if (curveBow(pinned) > MAX_BOW_RATIO * chordLen) {
    return straightCurve(start, end);
  }
  return pinned;
}

/** Flecha (bow) máxima de uma curva em relação ao acorde. */
function curveBow(curve: Curve): number {
  const s = evalCurve(curve, 0);
  const e = evalCurve(curve, 1);
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  let maxBow = 0;
  for (let i = 1; i < 10; i += 1) {
    const t = i / 10;
    const p = evalCurve(curve, t);
    const dist = Math.abs((p.x - s.x) * dy - (p.y - s.y) * dx) / len;
    if (dist > maxBow) maxBow = dist;
  }
  return maxBow;
}

function sampleRgbBilinear(
  data: Buffer,
  w: number,
  h: number,
  ch: number,
  x: number,
  y: number,
  out: Buffer,
  outIdx: number
): void {
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
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const i00 = (y0 * w + x0) * ch;
  const i10 = (y0 * w + x1) * ch;
  const i01 = (y1 * w + x0) * ch;
  const i11 = (y1 * w + x1) * ch;
  out[outIdx] = data[i00]! * w00 + data[i10]! * w10 + data[i01]! * w01 + data[i11]! * w11;
  out[outIdx + 1] =
    data[i00 + 1]! * w00 + data[i10 + 1]! * w10 + data[i01 + 1]! * w01 + data[i11 + 1]! * w11;
  out[outIdx + 2] =
    data[i00 + 2]! * w00 + data[i10 + 2]! * w10 + data[i01 + 2]! * w01 + data[i11 + 2]! * w11;
}

export interface DewarpOptions {
  maxDimension?: number;
  /** Cobertura mínima de bordas para aceitar o dewarp. */
  minEdgeCoverage?: number;
  /** Retorna RGB cru (3 canais) em vez de JPEG (para encadear no pipeline). */
  returnRaw?: boolean;
  /** Curvatura mínima (fração da menor dimensão) para o dewarp valer a pena. */
  minBowRatio?: number;
  /** Pontos médios manuais das 4 bordas: topo, direita, base, esquerda. */
  manualEdgeMidpoints?: DocumentImagePoint[];
}

function curveFromThreePoints(start: Vec, mid: Vec, end: Vec): Curve {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy || 1;
  let tMid = ((mid.x - start.x) * dx + (mid.y - start.y) * dy) / lenSq;
  if (tMid <= 1e-3 || tMid >= 1 - 1e-3) tMid = 0.5;
  const fx = fitQuadratic([0, tMid, 1], [start.x, mid.x, end.x]);
  const fy = fitQuadratic([0, tMid, 1], [start.y, mid.y, end.y]);
  if (!fx || !fy) {
    return straightCurve(start, end);
  }
  return pinEndpoints(
    { ax: fx[0], bx: fx[1], cx: fx[2], ay: fy[0], by: fy[1], cy: fy[2] },
    start,
    end
  );
}

/**
 * Dewarping por malha (patch de Coons) a partir das curvas das 4 bordas.
 * Corrige curvatura/dobras suaves do papel — mais robusto que homografia plana
 * para folhas curvadas. 100% determinístico, Node puro. Retorna null se não há
 * bordas suficientes para um remapeamento confiável.
 */
export async function dewarpDocument(
  inputBuffer: Buffer,
  initialCorners: DocumentImagePoint[],
  options: DewarpOptions = {}
): Promise<DewarpResult | null> {
  const maxDimension = options.maxDimension ?? 1600;
  const minEdgeCoverage = options.minEdgeCoverage ?? 0.5;
  const manualEdgeMidpoints = options.manualEdgeMidpoints;
  let edgeCoverage = 1;
  let tl: DocumentImagePoint;
  let tr: DocumentImagePoint;
  let br: DocumentImagePoint;
  let bl: DocumentImagePoint;
  let topCurve: Curve;
  let rightCurve: Curve;
  let bottomCurve: Curve;
  let leftCurve: Curve;

  if (manualEdgeMidpoints?.length === 4) {
    tl = initialCorners[0]!;
    tr = initialCorners[1]!;
    br = initialCorners[2]!;
    bl = initialCorners[3]!;
    topCurve = curveFromThreePoints(tl, manualEdgeMidpoints[0]!, tr);
    rightCurve = curveFromThreePoints(tr, manualEdgeMidpoints[1]!, br);
    bottomCurve = curveFromThreePoints(bl, manualEdgeMidpoints[2]!, br);
    leftCurve = curveFromThreePoints(tl, manualEdgeMidpoints[3]!, bl);
  } else {
    const curves = await detectDocumentEdgeCurves(inputBuffer, initialCorners);
    if (!curves || curves.edgeCoverage < minEdgeCoverage) return null;
    edgeCoverage = curves.edgeCoverage;
    [tl, tr, br, bl] = curves.corners;
    topCurve = fitEdgeCurve(curves.top, tl, tr);
    rightCurve = fitEdgeCurve(curves.right, tr, br);
    bottomCurve = fitEdgeCurve(curves.bottom, bl, br);
    leftCurve = fitEdgeCurve(curves.left, tl, bl);
  }

  const maxEdgeBow = Math.max(
    curveBow(topCurve),
    curveBow(rightCurve),
    curveBow(bottomCurve),
    curveBow(leftCurve)
  );

  // Sem curvatura relevante, o dewarp não agrega sobre o warp planar.
  if (options.minBowRatio !== undefined) {
    const minMeta = await sharp(inputBuffer, { failOn: 'none' }).rotate().metadata();
    const minDim = Math.min(minMeta.width ?? 0, minMeta.height ?? 0) || 1;
    if (maxEdgeBow < options.minBowRatio * minDim) return null;
  }

  const { data, info } = await sharp(inputBuffer, { failOn: 'none' })
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const srcW = info.width;
  const srcH = info.height;
  const ch = info.channels;
  if (ch < 3) return null;

  const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
  const widthChord = (dist(tl, tr) + dist(bl, br)) / 2;
  const heightChord = (dist(tl, bl) + dist(tr, br)) / 2;
  const aspect = widthChord / Math.max(1, heightChord);
  let outH: number;
  let outW: number;
  if (heightChord >= widthChord) {
    outH = Math.min(maxDimension, Math.max(400, Math.round(heightChord)));
    outW = Math.max(1, Math.round(outH * aspect));
  } else {
    outW = Math.min(maxDimension, Math.max(400, Math.round(widthChord)));
    outH = Math.max(1, Math.round(outW / aspect));
  }

  const out = Buffer.alloc(outW * outH * 3);
  const cTL = { x: tl.x, y: tl.y };
  const cTR = { x: tr.x, y: tr.y };
  const cBR = { x: br.x, y: br.y };
  const cBL = { x: bl.x, y: bl.y };

  for (let oy = 0; oy < outH; oy += 1) {
    const v = outH === 1 ? 0 : oy / (outH - 1);
    const left = evalCurve(leftCurve, v);
    const right = evalCurve(rightCurve, v);
    let outIdx = oy * outW * 3;
    for (let ox = 0; ox < outW; ox += 1) {
      const u = outW === 1 ? 0 : ox / (outW - 1);
      const top = evalCurve(topCurve, u);
      const bottom = evalCurve(bottomCurve, u);
      // Coons patch.
      const sx =
        (1 - v) * top.x +
        v * bottom.x +
        (1 - u) * left.x +
        u * right.x -
        ((1 - u) * (1 - v) * cTL.x + u * (1 - v) * cTR.x + (1 - u) * v * cBL.x + u * v * cBR.x);
      const sy =
        (1 - v) * top.y +
        v * bottom.y +
        (1 - u) * left.y +
        u * right.y -
        ((1 - u) * (1 - v) * cTL.y + u * (1 - v) * cTR.y + (1 - u) * v * cBL.y + u * v * cBR.y);
      sampleRgbBilinear(data, srcW, srcH, ch, sx, sy, out, outIdx);
      outIdx += 3;
    }
  }

  const returnRaw = options.returnRaw ?? false;
  const buffer = returnRaw
    ? out
    : await sharp(out, { raw: { width: outW, height: outH, channels: 3 } })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();

  return {
    buffer,
    width: outW,
    height: outH,
    inputWidth: srcW,
    inputHeight: srcH,
    maxEdgeBow,
    edgeCoverage,
    isRaw: returnRaw,
  };
}
