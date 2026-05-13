// @ts-nocheck — noUncheckedIndexedAccess gera falsos positivos em arrays tipados numéricos
/**
 * Correção automática de perspectiva para fotos de documentos.
 *
 * Algoritmo:
 *  1. Reduz para 600 px para análise rápida
 *  2. Converte para escala de cinza (somente para detecção)
 *  3. Gradiente Sobel — detecta bordas do documento independente do brilho de fundo
 *  4. Threshold adaptativo (Otsu sobre bordas, fallback P75) + closing morfológico
 *  5. Score diagonal por célula de grade para localizar os 4 cantos extremos
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

// ── Detecção dos 4 cantos do documento ──────────────────────────────────────

/**
 * Magnitude do gradiente Sobel 3×3.
 * Funciona tanto em imagens com fundo escuro como em fotos onde o mapa
 * preenche toda a cena — porque usa bordas reais (transições), não brilho.
 */
function sobelMag(gray: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(gray.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y - 1) * w + x - 1],
        tc = gray[(y - 1) * w + x],
        tr = gray[(y - 1) * w + x + 1];
      const ml = gray[y * w + x - 1],
        mr = gray[y * w + x + 1];
      const bl = gray[(y + 1) * w + x - 1],
        bc = gray[(y + 1) * w + x],
        br = gray[(y + 1) * w + x + 1];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const mag = (Math.sqrt(gx * gx + gy * gy) * 0.25) | 0; // escala para 0-255
      out[y * w + x] = mag > 255 ? 255 : mag;
    }
  }
  return out;
}

/**
 * Encontra os 4 cantos do documento via scoring diagonal sobre o mapa de bordas.
 *
 * Estratégia (robusta para fundos mistos):
 *  1. Suavização leve (1 passo Gauss) para suprimir ruído pontual
 *  2. Gradiente Sobel — detecta bordas independente de brilho de fundo
 *  3. Threshold adaptativo: usa Otsu sobre o mapa de bordas (ou fallback ao P75)
 *  4. Closing morfológico leve (r=6) para conectar bordas fragmentadas
 *  5. Score diagonal para extrair TL/TR/BR/BL
 *  6. Validação mínima: apenas rejeita quads claramente degenerados
 *
 * Retorna null somente se o quad detectado for inválido ou muito pequeno.
 */
function findDocumentCorners(gray: Uint8Array, w: number, h: number): Point[] | null {
  // 1. Suavização leve antes de Sobel para suprimir ruído de sensor
  const smoothed = gaussBlur(gray, w, h);

  // 2. Gradiente Sobel
  const edges = sobelMag(smoothed, w, h);

  // 3. Threshold sobre o mapa de bordas
  //    Otsu sobre bordas tende a separar "sem borda" de "com borda" bem.
  //    Fallback: P75 caso Otsu retorne valor muito baixo (cena de baixo contraste).
  let edgeThresh = otsu(edges);
  if (edgeThresh < 15) {
    // Cena de baixo contraste — usa percentil 75 das magnitudes > 0
    const sorted = Array.from(edges)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    edgeThresh = sorted[Math.floor(sorted.length * 0.75)] ?? 20;
  }

  const edgeMask = new Uint8Array(edges.length);
  for (let i = 0; i < edges.length; i++) edgeMask[i] = edges[i] >= edgeThresh ? 1 : 0;

  // 4. Closing morfológico para conectar bordas fragmentadas pelo conteúdo do mapa
  const mask = morphClose(edgeMask, w, h, 6);

  // 5. Score diagonal: varre pixels de borda e acumula scores por posição
  //    Para mapear bordas dispersas a um único ponto de canto, usamos
  //    "ponto mais extremo com densidade local" — janela 5% × 5% da imagem.
  const margin = Math.floor(Math.min(w, h) * 0.03);
  const wz = Math.max(1, Math.floor(w * 0.05)); // janela de agrupamento horizontal
  const hz = Math.max(1, Math.floor(h * 0.05)); // janela de agrupamento vertical

  // Acumula score (soma do inverso da distância diagonal) por quadrante de 5%
  const qw = Math.ceil(w / wz);
  const qh = Math.ceil(h / hz);
  const tlScore = new Float32Array(qw * qh);
  const trScore = new Float32Array(qw * qh);
  const brScore = new Float32Array(qw * qh);
  const blScore = new Float32Array(qw * qh);

  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      if (!mask[y * w + x]) continue;
      const qi = Math.floor(x / wz) + Math.floor(y / hz) * qw;
      const sp = x + y;
      const dp = x - y;
      // Valores menores de sp = mais próximo de TL; maiores = mais próximo de BR
      // Valores maiores de dp = mais próximo de TR; menores = mais próximo de BL
      // Pontuamos cada célula com o valor extremo que encontrou
      const tlv = -sp; // queremos mínimo sp → máximo de -sp
      const trv = dp;
      const brv = sp;
      const blv = -dp; // queremos mínimo dp → máximo de -dp
      if (tlv > tlScore[qi]) tlScore[qi] = tlv;
      if (trv > trScore[qi]) trScore[qi] = trv;
      if (brv > brScore[qi]) brScore[qi] = brv;
      if (blv > blScore[qi]) blScore[qi] = blv;
    }
  }

  // Para cada canto, encontra a célula com score máximo e retorna centro da célula
  function bestCell(scores: Float32Array): Point {
    let best = -Infinity,
      bi = 0;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > best) {
        best = scores[i];
        bi = i;
      }
    }
    const cx = (bi % qw) * wz + wz / 2;
    const cy = Math.floor(bi / qw) * hz + hz / 2;
    return [Math.min(cx, w - 1), Math.min(cy, h - 1)];
  }

  // Mas queremos o pixel exato de borda mais extremo dentro da célula vencedora
  function extremePixelInCell(qi: number, scoreType: 'tl' | 'tr' | 'br' | 'bl'): Point {
    const cellX0 = (qi % qw) * wz;
    const cellY0 = Math.floor(qi / qw) * hz;
    const cellX1 = Math.min(cellX0 + wz, w);
    const cellY1 = Math.min(cellY0 + hz, h);
    let best = -Infinity;
    let bp: Point = [cellX0 + wz / 2, cellY0 + hz / 2];
    for (let y = cellY0; y < cellY1; y++) {
      for (let x = cellX0; x < cellX1; x++) {
        if (!mask[y * w + x]) continue;
        const sp = x + y,
          dp = x - y;
        const v =
          scoreType === 'tl' ? -sp : scoreType === 'tr' ? dp : scoreType === 'br' ? sp : -dp;
        if (v > best) {
          best = v;
          bp = [x, y];
        }
      }
    }
    return bp;
  }

  let bestTlIdx = 0,
    bestTrIdx = 0,
    bestBrIdx = 0,
    bestBlIdx = 0;
  let bestTlV = -Infinity,
    bestTrV = -Infinity,
    bestBrV = -Infinity,
    bestBlV = -Infinity;
  for (let i = 0; i < qw * qh; i++) {
    if (tlScore[i] > bestTlV) {
      bestTlV = tlScore[i];
      bestTlIdx = i;
    }
    if (trScore[i] > bestTrV) {
      bestTrV = trScore[i];
      bestTrIdx = i;
    }
    if (brScore[i] > bestBrV) {
      bestBrV = brScore[i];
      bestBrIdx = i;
    }
    if (blScore[i] > bestBlV) {
      bestBlV = blScore[i];
      bestBlIdx = i;
    }
  }

  const tl = extremePixelInCell(bestTlIdx, 'tl');
  const tr = extremePixelInCell(bestTrIdx, 'tr');
  const br = extremePixelInCell(bestBrIdx, 'br');
  const bl = extremePixelInCell(bestBlIdx, 'bl');

  // 6. Validação mínima: rejeita apenas quads claramente degenerados
  const diagW = Math.hypot(br[0] - tl[0], br[1] - tl[1]);
  const diagH = Math.hypot(bl[0] - tr[0], bl[1] - tr[1]);
  const minDiag = Math.min(w, h) * 0.25; // exige ao menos 25% da dimensão menor
  if (diagW < minDiag && diagH < minDiag) return null;

  // Rejeita se todos os 4 cantos colapsaram para o mesmo ponto (sem bordas)
  const edgeCount = edgeMask.reduce((s, v) => s + v, 0);
  if (edgeCount < w * h * 0.005) return null; // < 0.5% de pixels de borda = cena sem bordas

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
): string | null {
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

  return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Aplica o warp prospectivo à imagem colorida de `src`.
 * Tenta o caminho WebGL (GPU) primeiro; cai para loop JS se não disponível.
 */
function warpPerspective(src: HTMLCanvasElement, corners: Point[]): string {
  let [tl, tr, br, bl] = corners;

  // Dimensões de saída = máximo das arestas opostas do quadrilátero
  let outW = Math.round(
    Math.max(Math.hypot(tr[0] - tl[0], tr[1] - tl[1]), Math.hypot(br[0] - bl[0], br[1] - bl[1]))
  );
  let outH = Math.round(
    Math.max(Math.hypot(bl[0] - tl[0], bl[1] - tl[1]), Math.hypot(br[0] - tr[0], br[1] - tr[1]))
  );

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
  if (glResult) return glResult;

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
