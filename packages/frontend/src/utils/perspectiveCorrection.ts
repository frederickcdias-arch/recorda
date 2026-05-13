/**
 * Correção automática de perspectiva para fotos de documentos.
 *
 * Algoritmo:
 *  1. Reduz para 600 px para análise rápida
 *  2. Converte para escala de cinza (somente para detecção)
 *  3. Suavização Gaussiana (2 passagens) para suprimir texto e detalhes do mapa
 *  4. Limiarização de Otsu — separa papel (claro) do fundo (escuro)
 *  5. Localiza os 4 cantos extremos da região do papel via score diagonal:
 *       TL = min(x+y),  TR = max(x–y),  BR = max(x+y),  BL = min(x–y)
 *  6. Valida a detecção; se não confiante, devolve a imagem original intacta
 *  7. Calcula a homografia inversa (retângulo → quadrilátero fonte)
 *  8. Aplica o warp prospectivo com interpolação bilinear na imagem COLORIDA
 *
 * As cores são totalmente preservadas — nenhum canal é descartado.
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

// ── Detecção dos 4 cantos do documento ──────────────────────────────────────

/**
 * Encontra os 4 cantos extremos da região clara (papel) usando pontuação diagonal:
 *   TL = min(x+y)   TR = max(x−y)   BR = max(x+y)   BL = min(x−y)
 *
 * Retorna null se a detecção não for confiável.
 */
function findDocumentCorners(gray: Uint8Array, w: number, h: number): Point[] | null {
  // Duas passagens de suavização para suprimir conteúdo do mapa/texto
  const b1 = gaussBlur(gray, w, h);
  const blurred = gaussBlur(b1, w, h);
  const threshold = otsu(blurred);

  const margin = Math.floor(Math.min(w, h) * 0.04);

  let tlS = Infinity,
    trS = -Infinity,
    brS = -Infinity,
    blS = Infinity;
  let tl: Point = [margin, margin];
  let tr: Point = [w - margin, margin];
  let br: Point = [w - margin, h - margin];
  let bl: Point = [margin, h - margin];
  let bright = 0;

  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      if (blurred[y * w + x] < threshold) continue;
      bright++;
      const sp = x + y; // soma  → TL = mín, BR = máx
      const dp = x - y; // dif   → TR = máx, BL = mín
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
  const coverage = bright / inner;

  // Rejeita: papel cobre quase tudo (sem fundo visível) ou quase nada
  if (coverage < 0.15 || coverage > 0.9) return null;

  // Rejeita quads degenerados (cantos muito próximos)
  if (Math.abs(tl[0] - br[0]) < w * 0.2) return null;
  if (Math.abs(tl[1] - br[1]) < h * 0.2) return null;

  return [tl, tr, br, bl];
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

/** Aplica a homografia H ao ponto (x, y) → (x′, y′) */
function applyH(H: number[], x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + 1;
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

// ── Warp prospectivo com interpolação bilinear ────────────────────────────────

/**
 * Aplica o warp prospectivo à imagem colorida da `srcCanvas`.
 * Os `corners` são os 4 vértices do documento em coordenadas da fonte
 * (ordem: TL, TR, BR, BL).
 *
 * A transformação é feita via mapeamento inverso: para cada pixel de saída
 * calcula-se a posição correspondente na fonte, amostrada com interpolação
 * bilinear. As cores RGB são preservadas integralmente.
 */
function warpPerspective(src: HTMLCanvasElement, corners: Point[]): string {
  const [tl, tr, br, bl] = corners;

  // Dimensões de saída = máximo das arestas opostas do quadrilátero
  const outW = Math.round(
    Math.max(Math.hypot(tr[0] - tl[0], tr[1] - tl[1]), Math.hypot(br[0] - bl[0], br[1] - bl[1]))
  );
  const outH = Math.round(
    Math.max(Math.hypot(bl[0] - tl[0], bl[1] - tl[1]), Math.hypot(br[0] - tr[0], br[1] - tr[1]))
  );

  // Homografia inversa: retângulo de saída → quadrilátero na fonte
  const dstRect: Point[] = [
    [0, 0],
    [outW, 0],
    [outW, outH],
    [0, outH],
  ];
  const Hinv = solveHomography(dstRect, corners);

  const sctx = src.getContext('2d')!;
  const srcImg = sctx.getImageData(0, 0, src.width, src.height);
  const sd = srcImg.data;
  const sw = src.width;
  const sh = src.height;

  const outCanvas = mkCanvas(outW, outH);
  const octx = outCanvas.getContext('2d')!;
  const outImg = octx.createImageData(outW, outH);
  const od = outImg.data;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = applyH(Hinv, x, y);
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) continue;

      // Interpolação bilinear (cor preservada)
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
  // JPEG 92% — qualidade alta; o backend aplicará mozjpeg na passagem final
  return outCanvas.toDataURL('image/jpeg', 0.92);
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

  let corners: Point[] | null;
  try {
    corners = findDocumentCorners(gray, dw, dh);
  } catch {
    return dataUrl;
  }

  if (!corners) return dataUrl;

  // — Warp na resolução de saída (máx OUTPUT_MAX) —
  const oScale = Math.min(1, OUTPUT_MAX / Math.max(iw, ih));
  const ow = Math.round(iw * oScale);
  const oh = Math.round(ih * oScale);

  const wc = mkCanvas(ow, oh);
  wc.getContext('2d')!.drawImage(img, 0, 0, ow, oh);

  // Escala os cantos detectados para a resolução de saída
  const scaledCorners: Point[] = corners.map(([x, y]) => [
    Math.round(x * (ow / dw)),
    Math.round(y * (oh / dh)),
  ]);

  try {
    return warpPerspective(wc, scaledCorners);
  } catch {
    return dataUrl;
  }
}
