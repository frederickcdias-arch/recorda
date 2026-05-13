// @ts-nocheck — noUncheckedIndexedAccess gera falsos positivos em arrays tipados numéricos
/**
 * Correção automática de perspectiva para fotos de documentos.
 *
 * Algoritmo:
 *  1. Reduz para 600 px para análise rápida
 *  2. Converte para escala de cinza (somente para detecção)
 *  3. Mediana RGB do strip de borda inteiro → estimativa robusta do fundo (mesa),
 *     mesmo quando o papel ocupa > 90 % do quadro
 *  4. Distância RGB ao fundo (threshold 25) + flood-fill a partir da borda da
 *     imagem: preenche o interior do papel sem efeito de borda morfológico
 *  5. Varredura das bordas ajusta 4 retas do primeiro contato mesa→papel; se
 *     não houver pontos confiáveis, usa score diagonal na máscara sólida
 *  6. Valida a detecção; se não confiante, devolve a imagem original intacta
 *  7. Calcula a homografia inversa (retângulo → quadrilátero fonte)
 *  8. Aplica o warp prospectivo com interpolação bilinear na imagem COLORIDA
 *
 * As cores são totalmente preservadas — nenhum canal é descartado.
 *
 * Melhorias:
 *  - Fechamento morfológico na máscara binária: preenche buracos causados por
 *    texto e símbolos impressos no papel antes da detecção de cantos.
 *  - Correção de orientação: se fonte e saída divergirem em retrato/paisagem,
 *    roda 90° reordenando os cantos.
 *  - Saída em JPEG 92 %: reduz payload ~8× vs PNG, acelerando o upload.
 *  - Warp via WebGL (GPU): ~20× mais rápido que o loop JS; fallback automático.
 */

type Point = [number, number];

/** Dimensão máxima para a passagem de detecção de cantos */
const DETECT_SIZE = 600;
/** Dimensão máxima da imagem corrigida enviada ao backend */
const OUTPUT_MAX = 2000;

// ── Utilitários de canvas ────────────────────────────────────────────────────

function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ── Processamento de imagem (somente para detecção — não afeta cores) ────────

/** RGBA → escala de cinza (pesos inteiros, divisão por shift) */
function toGray(rgba: Uint8ClampedArray, n: number): Uint8Array {
  const g = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    g[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
  }
  return g;
}

/**
 * Suavização Gaussiana separável 1D — kernel [1,4,6,4,1]/16.
 * Passagem horizontal seguida de passagem vertical.
 */
function gaussBlur(gray: Uint8Array, w: number, h: number): Uint8Array {
  const k = [1, 4, 6, 4, 1];
  const tmp = new Uint8Array(gray.length);
  const out = new Uint8Array(gray.length);

  // Horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0,
        wt = 0;
      for (let d = -2; d <= 2; d++) {
        const xi = x + d;
        if (xi >= 0 && xi < w) {
          s += gray[y * w + xi] * k[d + 2];
          wt += k[d + 2];
        }
      }
      tmp[y * w + x] = (s / wt + 0.5) | 0;
    }
  }

  // Vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0,
        wt = 0;
      for (let d = -2; d <= 2; d++) {
        const yi = y + d;
        if (yi >= 0 && yi < h) {
          s += tmp[yi * w + x] * k[d + 2];
          wt += k[d + 2];
        }
      }
      out[y * w + x] = (s / wt + 0.5) | 0;
    }
  }
  return out;
}

/** Limiar de Otsu: maximiza a variância entre classes clara/escura */
function otsu(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (const v of gray) hist[v]++;
  const n = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0,
    wB = 0,
    maxVar = 0,
    t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > maxVar) {
      maxVar = v;
      t = i;
    }
  }
  return t;
}

// ── Fechamento morfológico (closing) ────────────────────────────────────────

/**
 * Closing morfológico separável (dilatar → erodir) com kernel caixa de raio r.
 * Preenche buracos escuros dentro da região branca do documento (texto,
 * símbolos cartográficos) para que a máscara fique contínua antes da detecção.
 */
function morphClose(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const n = mask.length;

  // ── Dilatar horizontal ──
  const dh = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let k = 0; k <= r && k < w; k++) s += mask[y * w + k];
    dh[y * w] = s > 0 ? 1 : 0;
    for (let x = 1; x < w; x++) {
      if (x + r < w) s += mask[y * w + x + r];
      if (x - r - 1 >= 0) s -= mask[y * w + x - r - 1];
      dh[y * w + x] = s > 0 ? 1 : 0;
    }
  }

  // ── Dilatar vertical ──
  const dv = new Uint8Array(n);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = 0; k <= r && k < h; k++) s += dh[k * w + x];
    dv[x] = s > 0 ? 1 : 0;
    for (let y = 1; y < h; y++) {
      if (y + r < h) s += dh[(y + r) * w + x];
      if (y - r - 1 >= 0) s -= dh[(y - r - 1) * w + x];
      dv[y * w + x] = s > 0 ? 1 : 0;
    }
  }

  // ── Erodir horizontal ──
  const eh = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let k = 0; k <= r && k < w; k++) s += dv[y * w + k];
    let ws = Math.min(r, w - 1) + 1;
    eh[y * w] = s === ws ? 1 : 0;
    for (let x = 1; x < w; x++) {
      if (x + r < w) s += dv[y * w + x + r];
      if (x - r - 1 >= 0) s -= dv[y * w + x - r - 1];
      ws = Math.min(x + r, w - 1) - Math.max(x - r, 0) + 1;
      eh[y * w + x] = s === ws ? 1 : 0;
    }
  }

  // ── Erodir vertical ──
  const ev = new Uint8Array(n);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = 0; k <= r && k < h; k++) s += eh[k * w + x];
    let ws = Math.min(r, h - 1) + 1;
    ev[x] = s === ws ? 1 : 0;
    for (let y = 1; y < h; y++) {
      if (y + r < h) s += eh[(y + r) * w + x];
      if (y - r - 1 >= 0) s -= eh[(y - r - 1) * w + x];
      ws = Math.min(y + r, h - 1) - Math.max(y - r, 0) + 1;
      ev[y * w + x] = s === ws ? 1 : 0;
    }
  }

  return ev;
}

// ── Ajuste geométrico simples para detecção de bordas ─────────────────────────

type Line = { m: number; b: number };

type DocumentGeometry = {
  corners: Point[];
  top?: Point[];
  right?: Point[];
  bottom?: Point[];
  left?: Point[];
  manualCurves?: boolean;
};

export interface PerspectiveDetection {
  corners: Point[] | null;
  confidence: 'high' | 'low' | 'none';
}

function medianOf(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
}

function percentileOf(values: number[], p: number): number {
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(values.length * p)))];
}

function fitLine(points: Point[]): Line | null {
  if (points.length < 8) return null;

  function fit(sample: Point[]): Line | null {
    let sx = 0,
      sy = 0,
      sxx = 0,
      sxy = 0;
    for (const [x, y] of sample) {
      sx += x;
      sy += y;
      sxx += x * x;
      sxy += x * y;
    }
    const n = sample.length;
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-6) return null;
    const m = (n * sxy - sx * sy) / den;
    return { m, b: (sy - m * sx) / n };
  }

  let line = fit(points);
  if (!line) return null;

  const residuals = points.map(([x, y]) => Math.abs(y - (line!.m * x + line!.b)));
  const cutoff = Math.max(3, percentileOf(residuals, 0.72));
  const trimmed = points.filter(([x, y]) => Math.abs(y - (line!.m * x + line!.b)) <= cutoff);
  if (trimmed.length < 8) return line;
  return fit(trimmed) || line;
}

function fitSwappedLine(points: Point[]): Line | null {
  return fitLine(points.map(([x, y]) => [y, x] as Point));
}

function intersectHorizontalVertical(hLine: Line, vLine: Line, w: number, h: number): Point | null {
  const den = 1 - vLine.m * hLine.m;
  if (Math.abs(den) < 1e-6) return null;
  const x = (vLine.m * hLine.b + vLine.b) / den;
  const y = hLine.m * x + hLine.b;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.max(0, Math.min(w - 1, Math.round(x))), Math.max(0, Math.min(h - 1, Math.round(y)))];
}

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function isValidDocumentQuad(corners: Point[], w: number, h: number): boolean {
  const [tl, tr, br, bl] = corners;
  const minDim = Math.min(w, h);
  const top = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
  const right = Math.hypot(br[0] - tr[0], br[1] - tr[1]);
  const bottom = Math.hypot(br[0] - bl[0], br[1] - bl[1]);
  const left = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
  if (Math.min(top, right, bottom, left) < minDim * 0.18) return false;
  if (Math.min(left, right) / Math.max(left, right) < 0.76) return false;
  if (Math.min(top, bottom) / Math.max(top, bottom) < 0.76) return false;
  if (polygonArea(corners) < w * h * 0.08) return false;
  return true;
}

function hasForegroundRun(
  mask: Uint8Array,
  start: number,
  step: number,
  maxLen: number,
  run: number
): boolean {
  for (let k = 0; k < run; k++) {
    if (k >= maxLen || !mask[start + step * k]) return false;
  }
  return true;
}

function sortEdge(points: Point[], coord: 0 | 1): Point[] {
  return points
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .sort((a, b) => a[coord] - b[coord]);
}

function findEdgeGeometry(mask: Uint8Array, w: number, h: number): DocumentGeometry | null {
  const minDim = Math.min(w, h);
  const step = Math.max(2, Math.floor(minDim / 180));
  const run = Math.max(5, Math.floor(minDim * 0.012));
  const inset = Math.max(2, Math.floor(minDim * 0.01));

  const leftPts: Point[] = [];
  const rightPts: Point[] = [];
  const topPts: Point[] = [];
  const bottomPts: Point[] = [];

  for (let y = inset; y < h - inset; y += step) {
    for (let x = inset; x < w - inset - run; x++) {
      if (hasForegroundRun(mask, y * w + x, 1, w - x, run)) {
        leftPts.push([x, y]);
        break;
      }
    }
    for (let x = w - inset - 1; x >= inset + run; x--) {
      if (hasForegroundRun(mask, y * w + x, -1, x + 1, run)) {
        rightPts.push([x, y]);
        break;
      }
    }
  }

  for (let x = inset; x < w - inset; x += step) {
    for (let y = inset; y < h - inset - run; y++) {
      if (hasForegroundRun(mask, y * w + x, w, h - y, run)) {
        topPts.push([x, y]);
        break;
      }
    }
    for (let y = h - inset - 1; y >= inset + run; y--) {
      if (hasForegroundRun(mask, y * w + x, -w, y + 1, run)) {
        bottomPts.push([x, y]);
        break;
      }
    }
  }

  const minPts = Math.max(12, Math.floor(minDim / step) * 0.18);
  if (
    leftPts.length < minPts ||
    rightPts.length < minPts ||
    topPts.length < minPts ||
    bottomPts.length < minPts
  ) {
    return null;
  }

  const topLine = fitLine(topPts);
  const bottomLine = fitLine(bottomPts);
  const leftLine = fitSwappedLine(leftPts);
  const rightLine = fitSwappedLine(rightPts);
  if (!topLine || !bottomLine || !leftLine || !rightLine) return null;

  const tl = intersectHorizontalVertical(topLine, leftLine, w, h);
  const tr = intersectHorizontalVertical(topLine, rightLine, w, h);
  const br = intersectHorizontalVertical(bottomLine, rightLine, w, h);
  const bl = intersectHorizontalVertical(bottomLine, leftLine, w, h);
  if (!tl || !tr || !br || !bl) return null;

  const corners = [tl, tr, br, bl];
  if (!isValidDocumentQuad(corners, w, h)) return null;

  return {
    corners,
    top: sortEdge([tl, ...topPts, tr], 0),
    right: sortEdge([tr, ...rightPts, br], 1),
    bottom: sortEdge([bl, ...bottomPts, br], 0),
    left: sortEdge([tl, ...leftPts, bl], 1),
  };
}

function findMaskDiagonalGeometry(mask: Uint8Array, w: number, h: number): DocumentGeometry | null {
  const margin = Math.floor(Math.min(w, h) * 0.01);
  let tlS = Infinity;
  let trS = -Infinity;
  let brS = -Infinity;
  let blS = Infinity;
  let tl: Point = [margin, margin];
  let tr: Point = [w - margin, margin];
  let br: Point = [w - margin, h - margin];
  let bl: Point = [margin, h - margin];
  let count = 0;

  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      if (!mask[y * w + x]) continue;
      count++;
      const sp = x + y;
      const dp = x - y;
      if (sp < tlS) {
        tlS = sp;
        tl = [x, y];
      }
      if (dp > trS) {
        trS = dp;
        tr = [x, y];
      }
      if (sp > brS) {
        brS = sp;
        br = [x, y];
      }
      if (dp < blS) {
        blS = dp;
        bl = [x, y];
      }
    }
  }

  const inner = (w - 2 * margin) * (h - 2 * margin);
  const corners = [tl, tr, br, bl];
  const minDim = Math.min(w, h);
  const minEdge = Math.min(
    Math.hypot(tr[0] - tl[0], tr[1] - tl[1]),
    Math.hypot(br[0] - tr[0], br[1] - tr[1]),
    Math.hypot(br[0] - bl[0], br[1] - bl[1]),
    Math.hypot(bl[0] - tl[0], bl[1] - tl[1])
  );
  if (count / inner < 0.08 || minEdge < minDim * 0.18 || polygonArea(corners) < w * h * 0.08)
    return null;
  return { corners };
}

// ── Detecção dos 4 cantos do documento ──────────────────────────────────────

/**
 * Encontra os 4 cantos do papel via distância RGB ao fundo + flood-fill da borda.
 *
 * Estratégia:
 *  1. Estima a cor da mesa pela MEDIANA do strip de borda inteiro da imagem.
 *     Usar todos os pixels da borda (não apenas 4 cantos) torna a estimativa
 *     robusta mesmo quando o papel ocupa >90% do quadro.
 *  2. Máscara de primeiro plano: pixels com distância RGB > 25 ao fundo.
 *     Captura margens brancas E interior colorido do mapa.
 *  3. Pequeno closing (r=5) para selar lacunas mínimas nas margens do papel.
 *  4. Flood-fill a partir de todos os pixels de borda com fundo → marca região
 *     "fora" (mesa acessível a partir das bordas). Pixels de fundo não alcançados
 *     estão dentro do papel → são preenchidos como primeiro plano.
 *     Não há efeito de borda morfológico: funciona para qualquer tamanho de interior.
 *  5. Varredura das bordas coleta o primeiro trecho contínuo de papel em cada
 *     linha/coluna, ajusta 4 retas e cruza essas retas para achar os cantos.
 *     Isso evita que o mapa colorido interno domine os extremos.
 *  6. Se a varredura não for confiável, score diagonal extrai os 4 pixels
 *     extremos da máscara sólida resultante.
 *  7. Rejeita quads degenerados ou cenas sem documento.
 */
function findDocumentGeometry(
  gray: Uint8Array,
  rgba: Uint8ClampedArray,
  w: number,
  h: number
): DocumentGeometry | null {
  void gray;

  // 1. Estima fundo pela mediana R/G/B da borda. O perímetro puro tem prioridade
  //    quando o strip externo fica contaminado por papel ocupando quase todo o quadro.
  const borderW = Math.max(4, Math.floor(Math.min(w, h) * 0.03));
  const rBuf: number[] = [];
  const gBuf: number[] = [];
  const bBuf: number[] = [];
  const prBuf: number[] = [];
  const pgBuf: number[] = [];
  const pbBuf: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i4 = (y * w + x) * 4;
      const isPerimeter = y === 0 || y === h - 1 || x === 0 || x === w - 1;
      if (isPerimeter) {
        prBuf.push(rgba[i4]);
        pgBuf.push(rgba[i4 + 1]);
        pbBuf.push(rgba[i4 + 2]);
      }
      if (y >= borderW && y < h - borderW && x >= borderW && x < w - borderW) continue;
      rBuf.push(rgba[i4]);
      gBuf.push(rgba[i4 + 1]);
      bBuf.push(rgba[i4 + 2]);
    }
  }
  const stripR = medianOf(rBuf);
  const stripG = medianOf(gBuf);
  const stripB = medianOf(bBuf);
  const perimeterR = medianOf(prBuf);
  const perimeterG = medianOf(pgBuf);
  const perimeterB = medianOf(pbBuf);
  const stripLuma = stripR * 0.299 + stripG * 0.587 + stripB * 0.114;
  const perimeterLuma = perimeterR * 0.299 + perimeterG * 0.587 + perimeterB * 0.114;
  const usePerimeter = stripLuma > perimeterLuma + 18;
  const bgR = usePerimeter ? perimeterR : stripR;
  const bgG = usePerimeter ? perimeterG : stripG;
  const bgB = usePerimeter ? perimeterB : stripB;
  const bgLuma = bgR * 0.299 + bgG * 0.587 + bgB * 0.114;

  // 2. Máscara de primeiro plano: distância RGB ao fundo > 25.
  const dt2 = 25 * 25;
  const rawMask = new Uint8Array(w * h);
  const paperMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i4 = (y * w + x) * 4;
      const r = rgba[i4];
      const g = rgba[i4 + 1];
      const b = rgba[i4 + 2];
      const dr = r - bgR;
      const dg = g - bgG;
      const db = b - bgB;
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      rawMask[y * w + x] = dr * dr + dg * dg + db * db > dt2 ? 1 : 0;
      paperMask[y * w + x] = luma > Math.max(145, bgLuma + 18) && chroma < 58 ? 1 : 0;
    }
  }

  // 3. Pequeno closing para selar lacunas mínimas nas margens (r=5).
  const sealed = morphClose(rawMask, w, h, 5);
  const paperSealed = morphClose(paperMask, w, h, 3);

  // 4. Flood-fill a partir de todos os pixels de fundo na borda da imagem.
  //    Marca tudo que é "fora" (mesa acessível pelas bordas).
  //    O interior fechado do papel NÃO é alcançável e permanece como buraco.
  const outside = new Uint8Array(w * h);
  // Buffer com índices de pixels a processar (simulação de fila com head pointer)
  const queue = new Int32Array(w * h);
  let qHead = 0,
    qTail = 0;

  function seedBorder(idx: number): void {
    if (!sealed[idx] && !outside[idx]) {
      outside[idx] = 1;
      queue[qTail++] = idx;
    }
  }

  for (let x = 0; x < w; x++) {
    seedBorder(x); // linha de topo
    seedBorder((h - 1) * w + x); // linha de base
  }
  for (let y = 1; y < h - 1; y++) {
    seedBorder(y * w); // coluna esquerda
    seedBorder(y * w + w - 1); // coluna direita
  }

  while (qHead < qTail) {
    const idx = queue[qHead++];
    const px = idx % w;
    const py = (idx / w) | 0;
    // 4 vizinhos
    if (px > 0) seedBorder(idx - 1);
    if (px < w - 1) seedBorder(idx + 1);
    if (py > 0) seedBorder(idx - w);
    if (py < h - 1) seedBorder(idx + w);
  }

  // Máscara final: primeiro plano original OU fundo não alcançado (interior do papel).
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    mask[i] = sealed[i] || (!outside[i] ? 1 : 0);
  }

  const paperDiagonalGeometry = findMaskDiagonalGeometry(paperSealed, w, h);
  if (paperDiagonalGeometry) return paperDiagonalGeometry;

  const edgeGeometry =
    findEdgeGeometry(paperSealed, w, h) ||
    findEdgeGeometry(mask, w, h) ||
    findEdgeGeometry(sealed, w, h);
  if (edgeGeometry) return edgeGeometry;

  // 5. Score diagonal: pixels mais extremos em cada diagonal.
  const margin = Math.floor(Math.min(w, h) * 0.02);
  let tlS = Infinity,
    trS = -Infinity,
    brS = -Infinity,
    blS = Infinity;
  let tl: Point = [margin, margin];
  let tr: Point = [w - margin, margin];
  let br: Point = [w - margin, h - margin];
  let bl: Point = [margin, h - margin];
  let fgCount = 0;

  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      if (!mask[y * w + x]) continue;
      fgCount++;
      const sp = x + y;
      const dp = x - y;
      if (sp < tlS) {
        tlS = sp;
        tl = [x, y];
      }
      if (dp > trS) {
        trS = dp;
        tr = [x, y];
      }
      if (sp > brS) {
        brS = sp;
        br = [x, y];
      }
      if (dp < blS) {
        blS = dp;
        bl = [x, y];
      }
    }
  }

  // 6. Rejeita cenas sem documento ou quads degenerados.
  const inner = (w - 2 * margin) * (h - 2 * margin);
  if (fgCount / inner < 0.08) return null;

  const diagW = Math.hypot(br[0] - tl[0], br[1] - tl[1]);
  const diagH = Math.hypot(bl[0] - tr[0], bl[1] - tr[1]);
  if (diagW < Math.min(w, h) * 0.2 && diagH < Math.min(w, h) * 0.2) return null;

  return { corners: [tl, tr, br, bl] };
}

function findDocumentCorners(
  gray: Uint8Array,
  rgba: Uint8ClampedArray,
  w: number,
  h: number
): Point[] | null {
  return findDocumentGeometry(gray, rgba, w, h)?.corners || null;
}

// ── Homografia (transformação projetiva) ─────────────────────────────────────

/**
 * Eliminação de Gauss–Jordan em sistema 8×8 aumentado.
 * Retorna o vetor solução x tal que A·x = b.
 */
function gaussJordan(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Pivô parcial
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-10) throw new Error('Homografia singular');

    // Elimina todas as linhas (Gauss–Jordan, não apenas abaixo)
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / pivot;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }

  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Calcula a homografia H (9 coeficientes, último = 1) que mapeia
 * cada ponto de `src` para o ponto correspondente em `dst`.
 */
function solveHomography(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [xp, yp] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * xp, -y * xp]);
    b.push(xp);
    A.push([0, 0, 0, x, y, 1, -x * yp, -y * yp]);
    b.push(yp);
  }
  const h = gaussJordan(A, b);
  return [...h, 1];
}

// ── Warp prospectivo ────────────────────────────────────────────────────────

/**
 * Warp perspectivo GPU-acelerado via WebGL.
 * Usa hardware bilinear sampling e executa em paralelo no driver gráfico.
 * Retorna null se WebGL não estiver disponível — o chamador usa o fallback JS.
 */
function warpPerspectiveGL(
  src: HTMLCanvasElement,
  Hinv: number[],
  outW: number,
  outH: number
): HTMLCanvasElement | null {
  const canvas = mkCanvas(outW, outH);
  const gl = canvas.getContext('webgl');
  if (!gl) return null;

  // Vertex shader: quad que cobre todo o clip space
  const vsSource = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main(){
      gl_Position=vec4(aPos,0.0,1.0);
      vUv=aPos*0.5+0.5;
    }`;

  // Fragment shader: homografia inversa por pixel + bilinear nativa do hardware
  // Sistema de coords: vUv.y=0 = fundo da tela (canvas bottom), vUv.y=1 = topo.
  // py = (1 - vUv.y) * dstH converte para canvas y-down.
  // Sem UNPACK_FLIP_Y: textura t=0 mapeia para canvas row 0 (topo da fonte),
  // portanto texV = sy / srcH está correto sem inversão adicional.
  const fsSource = `
    precision mediump float;
    uniform sampler2D uTex;
    uniform vec2 uDst,uSrc;
    uniform vec3 uH0,uH1,uH2;
    varying vec2 vUv;
    void main(){
      float px=vUv.x*uDst.x;
      float py=(1.0-vUv.y)*uDst.y;
      vec3 p=vec3(px,py,1.0);
      float w=dot(uH2,p);
      float sx=dot(uH0,p)/w;
      float sy=dot(uH1,p)/w;
      vec2 uv=vec2(sx/uSrc.x,sy/uSrc.y);
      if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)
        gl_FragColor=vec4(1.0);
      else
        gl_FragColor=texture2D(uTex,uv);
    }`;

  function makeShader(type: number, source: string): WebGLShader | null {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
    return s;
  }

  const vs = makeShader(gl.VERTEX_SHADER, vsSource);
  const fs = makeShader(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  // Quad de tela cheia (2 triângulos)
  const vbuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // Canvas fonte → textura (sem UNPACK_FLIP_Y: row 0 da imagem = t=0)
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);

  gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
  gl.uniform2f(gl.getUniformLocation(prog, 'uDst'), outW, outH);
  gl.uniform2f(gl.getUniformLocation(prog, 'uSrc'), src.width, src.height);
  gl.uniform3f(gl.getUniformLocation(prog, 'uH0'), Hinv[0], Hinv[1], Hinv[2]);
  gl.uniform3f(gl.getUniformLocation(prog, 'uH1'), Hinv[3], Hinv[4], Hinv[5]);
  gl.uniform3f(gl.getUniformLocation(prog, 'uH2'), Hinv[6], Hinv[7], 1.0);

  gl.viewport(0, 0, outW, outH);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Libera recursos GPU
  gl.deleteTexture(tex);
  gl.deleteBuffer(vbuf);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.deleteProgram(prog);

  return canvas;
}

/**
 * Aplica o warp prospectivo à imagem colorida de `src`.
 * Tenta o caminho WebGL (GPU) primeiro; cai para loop JS se não disponível.
 */
function getAseriesOutputSize(corners: Point[]): [number, number] {
  const [tl, tr, br, bl] = corners;
  const top = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
  const bottom = Math.hypot(br[0] - bl[0], br[1] - bl[1]);
  const left = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
  const right = Math.hypot(br[0] - tr[0], br[1] - tr[1]);
  const detectedW = Math.max(top, bottom);
  const detectedH = Math.max(left, right);
  const portrait = detectedH >= detectedW;
  const sqrt2 = Math.SQRT2;
  let outW: number;
  let outH: number;

  if (portrait) {
    outH = Math.round(Math.max(detectedH, detectedW * sqrt2));
    outW = Math.round(outH / sqrt2);
  } else {
    outW = Math.round(Math.max(detectedW, detectedH * sqrt2));
    outH = Math.round(outW / sqrt2);
  }

  const scale = Math.min(1, OUTPUT_MAX / Math.max(outW, outH));
  return [Math.max(1, Math.round(outW * scale)), Math.max(1, Math.round(outH * scale))];
}

function warpPerspectiveCanvas(src: HTMLCanvasElement, corners: Point[]): HTMLCanvasElement {
  let [tl, tr, br, bl] = corners;

  // Dimensões de saída normalizadas para a proporção ISO 216 (A1/A2/A3/A4 etc.).
  let [outW, outH] = getAseriesOutputSize(corners);

  // Correção de orientação: se a fonte for retrato mas a saída sair paisagem
  // (ou vice-versa), roda 90° reordenando os cantos e trocando as dimensões.
  const srcPortrait = src.height > src.width * 1.1;
  const srcLandscape = src.width > src.height * 1.1;
  const outPortrait = outH > outW * 1.1;
  const outLandscape = outW > outH * 1.1;
  if ((srcPortrait && outLandscape) || (srcLandscape && outPortrait)) {
    [tl, tr, br, bl] = [bl, tl, tr, br];
    [outW, outH] = [outH, outW];
  }
  corners = [tl, tr, br, bl];

  // Homografia inversa: retângulo de saída → quadrilátero na fonte
  const dstRect: Point[] = [
    [0, 0],
    [outW, 0],
    [outW, outH],
    [0, outH],
  ];
  const Hinv = solveHomography(dstRect, corners);

  // Caminho rápido: WebGL delega o warp à GPU (~20× mais rápido que JS)
  const glResult = warpPerspectiveGL(src, Hinv, outW, outH);
  if (glResult) {
    const copy = mkCanvas(outW, outH);
    copy.getContext('2d')!.drawImage(glResult, 0, 0);
    return copy;
  }

  // Fallback JS: interpolação bilinear por pixel (mesma lógica, mesma qualidade)
  const sctx = src.getContext('2d')!;
  const srcImg = sctx.getImageData(0, 0, src.width, src.height);
  const sd = srcImg.data;
  const sw = src.width;
  const sh = src.height;

  const outCanvas = mkCanvas(outW, outH);
  const octx = outCanvas.getContext('2d')!;
  const outImg = octx.createImageData(outW, outH);
  const od = outImg.data;

  const h0 = Hinv[0],
    h1 = Hinv[1],
    h2 = Hinv[2];
  const h3 = Hinv[3],
    h4 = Hinv[4],
    h5 = Hinv[5];
  const h6 = Hinv[6],
    h7 = Hinv[7];
  const swm1 = sw - 1,
    shm1 = sh - 1;

  for (let y = 0; y < outH; y++) {
    const ry1 = h1 * y + h2;
    const ry4 = h4 * y + h5;
    const ry7 = h7 * y;
    for (let x = 0; x < outW; x++) {
      const wInv = 1 / (h6 * x + ry7 + 1);
      const sx = (h0 * x + ry1) * wInv;
      const sy = (h3 * x + ry4) * wInv;
      if (sx < 0 || sy < 0 || sx >= swm1 || sy >= shm1) continue;
      const xi = sx | 0,
        yi = sy | 0;
      const fx = sx - xi,
        fy = sy - yi;
      const i00 = (yi * sw + xi) * 4;
      const i10 = i00 + 4;
      const i01 = ((yi + 1) * sw + xi) * 4;
      const i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy),
        w10 = fx * (1 - fy),
        w01 = (1 - fx) * fy,
        w11 = fx * fy;
      const oi = (y * outW + x) * 4;
      od[oi] = (sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11) | 0;
      od[oi + 1] =
        (sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11) | 0;
      od[oi + 2] =
        (sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11) | 0;
      od[oi + 3] = 255;
    }
  }

  octx.putImageData(outImg, 0, 0);
  return outCanvas;
}

function sampleEdge(points: Point[], t: number, coord: 0 | 1): Point {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return points[0];

  const first = points[0][coord];
  const last = points[points.length - 1][coord];
  const target = first + (last - first) * t;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const next = points[i];
    const a = prev[coord];
    const b = next[coord];
    if ((a <= target && target <= b) || (b <= target && target <= a)) {
      const local = Math.abs(b - a) < 1e-6 ? 0 : (target - a) / (b - a);
      return [prev[0] + (next[0] - prev[0]) * local, prev[1] + (next[1] - prev[1]) * local];
    }
  }
  return points[points.length - 1];
}

function scaleGeometry(geometry: DocumentGeometry, sx: number, sy: number): DocumentGeometry {
  function scalePoint([x, y]: Point): Point {
    return [x * sx, y * sy];
  }
  return {
    corners: geometry.corners.map(scalePoint),
    top: geometry.top?.map(scalePoint),
    right: geometry.right?.map(scalePoint),
    bottom: geometry.bottom?.map(scalePoint),
    left: geometry.left?.map(scalePoint),
    manualCurves: geometry.manualCurves,
  };
}

function scalePoints(points: Point[], sx: number, sy: number): Point[] {
  return points.map(([x, y]) => [x * sx, y * sy]);
}

function expandGeometry(geometry: DocumentGeometry, w: number, h: number): DocumentGeometry {
  const [tl, tr, br, bl] = geometry.corners;
  const cx = (tl[0] + tr[0] + br[0] + bl[0]) / 4;
  const cy = (tl[1] + tr[1] + br[1] + bl[1]) / 4;
  const minEdge = Math.min(
    Math.hypot(tr[0] - tl[0], tr[1] - tl[1]),
    Math.hypot(br[0] - bl[0], br[1] - bl[1]),
    Math.hypot(bl[0] - tl[0], bl[1] - tl[1]),
    Math.hypot(br[0] - tr[0], br[1] - tr[1])
  );
  const pad = minEdge * (geometry.manualCurves ? 0.04 : 0.015);

  function expandPoint([x, y]: Point): Point {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return [x, y];
    return [
      Math.max(0, Math.min(w - 1, x + (dx / len) * pad)),
      Math.max(0, Math.min(h - 1, y + (dy / len) * pad)),
    ];
  }

  return {
    corners: geometry.corners.map(expandPoint),
    top: geometry.top?.map(expandPoint),
    right: geometry.right?.map(expandPoint),
    bottom: geometry.bottom?.map(expandPoint),
    left: geometry.left?.map(expandPoint),
    manualCurves: geometry.manualCurves,
  };
}

function estimateGeometryConfidence(
  geometry: DocumentGeometry,
  w: number,
  h: number
): 'high' | 'low' {
  const [tl, tr, br, bl] = geometry.corners;
  const areaRatio = polygonArea(geometry.corners) / (w * h);
  const top = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
  const right = Math.hypot(br[0] - tr[0], br[1] - tr[1]);
  const bottom = Math.hypot(br[0] - bl[0], br[1] - bl[1]);
  const left = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
  const horizontalBalance = Math.min(top, bottom) / Math.max(top, bottom);
  const verticalBalance = Math.min(left, right) / Math.max(left, right);
  const hasEdges =
    (geometry.top?.length || 0) >= 16 &&
    (geometry.right?.length || 0) >= 16 &&
    (geometry.bottom?.length || 0) >= 16 &&
    (geometry.left?.length || 0) >= 16;

  if (hasEdges && areaRatio >= 0.22 && horizontalBalance >= 0.82 && verticalBalance >= 0.82) {
    return 'high';
  }
  return 'low';
}

function distanceToSegmentLine([x, y]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const den = Math.hypot(dx, dy);
  if (den < 1e-6) return Infinity;
  return Math.abs(dy * x - dx * y + bx * ay - by * ax) / den;
}

function edgeResidualOk(
  points: Point[] | undefined,
  a: Point,
  b: Point,
  maxResidual: number
): boolean {
  if (!points || points.length < 16) return false;
  const residuals = points.map((p) => distanceToSegmentLine(p, a, b));
  return percentileOf(residuals, 0.9) <= maxResidual;
}

function hasCurvedEdges(geometry: DocumentGeometry): boolean {
  const [tl, tr, br, bl] = geometry.corners;
  const minDim = Math.min(
    Math.hypot(tr[0] - tl[0], tr[1] - tl[1]),
    Math.hypot(br[0] - bl[0], br[1] - bl[1]),
    Math.hypot(bl[0] - tl[0], bl[1] - tl[1]),
    Math.hypot(br[0] - tr[0], br[1] - tr[1])
  );
  const maxResidual = Math.max(4, minDim * 0.055);
  if (geometry.manualCurves) {
    return (
      (geometry.top?.length || 0) >= 3 &&
      (geometry.right?.length || 0) >= 3 &&
      (geometry.bottom?.length || 0) >= 3 &&
      (geometry.left?.length || 0) >= 3
    );
  }
  return (
    edgeResidualOk(geometry.top, tl, tr, maxResidual) &&
    edgeResidualOk(geometry.right, tr, br, maxResidual) &&
    edgeResidualOk(geometry.bottom, bl, br, maxResidual) &&
    edgeResidualOk(geometry.left, tl, bl, maxResidual)
  );
}

function sampleBilinear(
  sd: Uint8ClampedArray,
  sw: number,
  sh: number,
  sx: number,
  sy: number,
  od: Uint8ClampedArray,
  oi: number
): void {
  const swm1 = sw - 1;
  const shm1 = sh - 1;
  if (sx < 0 || sy < 0 || sx >= swm1 || sy >= shm1) {
    od[oi] = 255;
    od[oi + 1] = 255;
    od[oi + 2] = 255;
    od[oi + 3] = 255;
    return;
  }
  const xi = sx | 0;
  const yi = sy | 0;
  const fx = sx - xi;
  const fy = sy - yi;
  const i00 = (yi * sw + xi) * 4;
  const i10 = i00 + 4;
  const i01 = ((yi + 1) * sw + xi) * 4;
  const i11 = i01 + 4;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  od[oi] = (sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11) | 0;
  od[oi + 1] = (sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11) | 0;
  od[oi + 2] = (sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11) | 0;
  od[oi + 3] = 255;
}

function warpCurvedDocumentCanvas(
  src: HTMLCanvasElement,
  geometry: DocumentGeometry
): HTMLCanvasElement | null {
  if (
    !geometry.top ||
    !geometry.right ||
    !geometry.bottom ||
    !geometry.left ||
    !hasCurvedEdges(geometry)
  ) {
    return null;
  }

  let { corners } = geometry;
  let [outW, outH] = getAseriesOutputSize(corners);
  const [tl, tr, br, bl] = corners;
  const srcPortrait = src.height > src.width * 1.1;
  const srcLandscape = src.width > src.height * 1.1;
  const outPortrait = outH > outW * 1.1;
  const outLandscape = outW > outH * 1.1;
  if ((srcPortrait && outLandscape) || (srcLandscape && outPortrait)) {
    return null;
  }

  const [ctl, ctr, cbr, cbl] = corners;
  const sctx = src.getContext('2d')!;
  const srcImg = sctx.getImageData(0, 0, src.width, src.height);
  const sd = srcImg.data;
  const outCanvas = mkCanvas(outW, outH);
  const octx = outCanvas.getContext('2d')!;
  const outImg = octx.createImageData(outW, outH);
  const od = outImg.data;

  for (let y = 0; y < outH; y++) {
    const v = outH <= 1 ? 0 : y / (outH - 1);
    const left = sampleEdge(geometry.left, v, 1);
    const right = sampleEdge(geometry.right, v, 1);
    for (let x = 0; x < outW; x++) {
      const u = outW <= 1 ? 0 : x / (outW - 1);
      const top = sampleEdge(geometry.top, u, 0);
      const bottom = sampleEdge(geometry.bottom, u, 0);
      const bilinearCorner: Point = [
        (1 - u) * (1 - v) * ctl[0] + u * (1 - v) * ctr[0] + u * v * cbr[0] + (1 - u) * v * cbl[0],
        (1 - u) * (1 - v) * ctl[1] + u * (1 - v) * ctr[1] + u * v * cbr[1] + (1 - u) * v * cbl[1],
      ];
      const sx =
        (1 - v) * top[0] + v * bottom[0] + (1 - u) * left[0] + u * right[0] - bilinearCorner[0];
      const sy =
        (1 - v) * top[1] + v * bottom[1] + (1 - u) * left[1] + u * right[1] - bilinearCorner[1];
      sampleBilinear(sd, src.width, src.height, sx, sy, od, (y * outW + x) * 4);
    }
  }

  octx.putImageData(outImg, 0, 0);
  return outCanvas;
}

function enhanceScannedPage(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const totalPixels = canvas.width * canvas.height;
  const originalLuma = new Uint8Array(totalPixels);
  const lumas: number[] = [];
  const step = Math.max(1, Math.floor((canvas.width * canvas.height) / 80000));
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    originalLuma[p] = Math.max(
      0,
      Math.min(255, d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114)
    );
    if (p % step !== 0) continue;
    lumas.push(originalLuma[p]);
  }
  const black = percentileOf([...lumas], 0.04);
  const white = percentileOf([...lumas], 0.93);
  const span = Math.max(40, white - black);
  let colorMinX = canvas.width;
  let colorMinY = canvas.height;
  let colorMaxX = 0;
  let colorMaxY = 0;
  let colorCount = 0;

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const luma = originalLuma[p];
    const x = p % canvas.width;
    const y = (p / canvas.width) | 0;
    if (y < canvas.height * 0.72 && chroma > 55 && luma > 35 && luma < 230) {
      colorMinX = Math.min(colorMinX, x);
      colorMinY = Math.min(colorMinY, y);
      colorMaxX = Math.max(colorMaxX, x);
      colorMaxY = Math.max(colorMaxY, y);
      colorCount++;
    }
  }

  const hasColorMap = colorCount > totalPixels * 0.08;
  const pad = Math.round(Math.min(canvas.width, canvas.height) * 0.015);
  colorMinX = Math.max(0, colorMinX - pad);
  colorMinY = Math.max(0, colorMinY - pad);
  colorMaxX = Math.min(canvas.width - 1, colorMaxX + pad);
  colorMaxY = Math.min(canvas.height - 1, colorMaxY + pad);

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const target = Math.max(0, Math.min(255, ((luma - black) / span) * 238 + 10));
    const factor = luma > 1 ? target / luma : 1;
    let nr = Math.max(0, Math.min(255, r * factor));
    let ng = Math.max(0, Math.min(255, g * factor));
    let nb = Math.max(0, Math.min(255, b * factor));
    const maxC = Math.max(nr, ng, nb);
    const minC = Math.min(nr, ng, nb);
    const x = p % canvas.width;
    const y = (p / canvas.width) | 0;
    const insideColorMap =
      hasColorMap && x >= colorMinX && x <= colorMaxX && y >= colorMinY && y <= colorMaxY;

    if (target > 166 && maxC - minC < (insideColorMap ? 26 : 56)) {
      const paper = Math.max(target, 232);
      const keep = insideColorMap ? 0.35 : 0.22;
      const lift = 1 - keep;
      nr = nr * keep + paper * lift;
      ng = ng * keep + paper * lift;
      nb = nb * keep + paper * lift;
    }

    const shadowChromaLimit = insideColorMap ? 20 : 82;
    const shadowLumaLimit = insideColorMap ? 215 : 42;
    if (chroma < shadowChromaLimit && luma > shadowLumaLimit) {
      let darkNeighborCount = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= canvas.height) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= canvas.width) continue;
          if (originalLuma[yy * canvas.width + xx] < 88) {
            darkNeighborCount++;
          }
        }
      }

      if (darkNeighborCount < 3 || luma > 118) {
        const paper = luma > 130 ? 252 : 247;
        const keep = insideColorMap ? 0.12 : 0.03;
        const lift = 1 - keep;
        nr = nr * keep + paper * lift;
        ng = ng * keep + paper * lift;
        nb = nb * keep + paper * lift;
      }
    }

    d[i] = nr | 0;
    d[i + 1] = ng | 0;
    d[i + 2] = nb | 0;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function warpDocument(src: HTMLCanvasElement, geometry: DocumentGeometry): string {
  const safeGeometry = expandGeometry(geometry, src.width, src.height);
  const curved = warpCurvedDocumentCanvas(src, safeGeometry);
  const canvas = curved || warpPerspectiveCanvas(src, safeGeometry.corners);
  enhanceScannedPage(canvas);
  return canvas.toDataURL('image/jpeg', 0.92);
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Detecta automaticamente os cantos do documento em `dataUrl` e aplica a
 * correção de perspectiva.  A imagem retornada é uma data URL JPEG com as
 * cores RGB intactas.
 *
 * Se a detecção não for confiável (papel preenche todo o quadro, fundo muito
 * claro, etc.), retorna `dataUrl` sem alterações.
 */
export async function correctPerspective(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const iw = img.width,
    ih = img.height;

  // — Detecção de cantos na cópia reduzida —
  const dScale = DETECT_SIZE / Math.max(iw, ih);
  const dw = Math.round(iw * dScale);
  const dh = Math.round(ih * dScale);

  const dc = mkCanvas(dw, dh);
  dc.getContext('2d')!.drawImage(img, 0, 0, dw, dh);
  const dd = dc.getContext('2d')!.getImageData(0, 0, dw, dh).data;
  const gray = toGray(dd, dw * dh);

  let geometry: DocumentGeometry | null;
  try {
    geometry = findDocumentGeometry(gray, dd, dw, dh);
  } catch {
    return dataUrl;
  }

  if (!geometry) return dataUrl;

  // — Warp na resolução de saída (máx OUTPUT_MAX) —
  const oScale = Math.min(1, OUTPUT_MAX / Math.max(iw, ih));
  const ow = Math.round(iw * oScale);
  const oh = Math.round(ih * oScale);

  const wc = mkCanvas(ow, oh);
  wc.getContext('2d')!.drawImage(img, 0, 0, ow, oh);

  // Escala os cantos detectados para a resolução de saída
  const scaledGeometry = scaleGeometry(geometry, ow / dw, oh / dh);

  try {
    return warpDocument(wc, scaledGeometry);
  } catch {
    return dataUrl;
  }
}

export async function detectPerspective(dataUrl: string): Promise<PerspectiveDetection> {
  const img = await loadImage(dataUrl);
  const iw = img.width;
  const ih = img.height;
  const dScale = DETECT_SIZE / Math.max(iw, ih);
  const dw = Math.round(iw * dScale);
  const dh = Math.round(ih * dScale);

  const dc = mkCanvas(dw, dh);
  dc.getContext('2d')!.drawImage(img, 0, 0, dw, dh);
  const dd = dc.getContext('2d')!.getImageData(0, 0, dw, dh).data;
  const gray = toGray(dd, dw * dh);

  try {
    const geometry = findDocumentGeometry(gray, dd, dw, dh);
    if (!geometry) return { corners: null, confidence: 'none' };
    return {
      corners: scalePoints(geometry.corners, iw / dw, ih / dh),
      confidence: estimateGeometryConfidence(geometry, dw, dh),
    };
  } catch {
    return { corners: null, confidence: 'none' };
  }
}

export async function correctPerspectiveWithCorners(
  dataUrl: string,
  corners: Point[]
): Promise<string> {
  const img = await loadImage(dataUrl);
  const iw = img.width;
  const ih = img.height;
  const oScale = Math.min(1, OUTPUT_MAX / Math.max(iw, ih));
  const ow = Math.round(iw * oScale);
  const oh = Math.round(ih * oScale);

  const wc = mkCanvas(ow, oh);
  wc.getContext('2d')!.drawImage(img, 0, 0, ow, oh);

  const scaledGeometry: DocumentGeometry = {
    corners: scalePoints(corners, ow / iw, oh / ih),
  };

  return warpDocument(wc, scaledGeometry);
}

export async function correctPerspectiveWithEdgePoints(
  dataUrl: string,
  corners: Point[],
  edgeMidpoints: Point[]
): Promise<string> {
  const img = await loadImage(dataUrl);
  const iw = img.width;
  const ih = img.height;
  const oScale = Math.min(1, OUTPUT_MAX / Math.max(iw, ih));
  const ow = Math.round(iw * oScale);
  const oh = Math.round(ih * oScale);

  const wc = mkCanvas(ow, oh);
  wc.getContext('2d')!.drawImage(img, 0, 0, ow, oh);

  const scaledCorners = scalePoints(corners, ow / iw, oh / ih);
  const scaledMidpoints = scalePoints(edgeMidpoints, ow / iw, oh / ih);
  const [tl, tr, br, bl] = scaledCorners;
  const [top, right, bottom, left] = scaledMidpoints;
  const scaledGeometry: DocumentGeometry = {
    corners: scaledCorners,
    top: [tl, top, tr],
    right: [tr, right, br],
    bottom: [bl, bottom, br],
    left: [tl, left, bl],
    manualCurves: true,
  };

  return warpDocument(wc, scaledGeometry);
}
