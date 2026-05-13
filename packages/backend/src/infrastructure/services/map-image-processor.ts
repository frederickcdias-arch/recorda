import sharp from 'sharp';

/**
 * Processa uma imagem de mapa capturada pelo colaborador.
 * Diferente do OCR preprocessor, MANTÉM as cores originais.
 *
 * Pipeline completo:
 *  1. EXIF rotate + Trim → raw  — corrige orientação e remove bordas uniformes
 *  2. Balanço de branco          — normalização percentílica P95 por canal RGB
 *  3. Resize                     — limita a 4000px para não gerar arquivos gigantes
 *  4. CLAHE                      — melhora contraste local adaptativo
 *  5. Modulate                   — satura levemente as cores para maior legibilidade
 *  6. Sharpen                    — nitidez de traçados e texto, sem artefatos
 *  7. JPEG 90%                   — alta qualidade com compressão eficiente (mozjpeg)
 */
export async function processMapImage(imagemBase64: string): Promise<{
  processedBase64: string;
  tamanhoBytes: number;
}> {
  const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64Data, 'base64');

  // ── 1. EXIF rotate + Trim → buffer raw ──────────────────────────────────
  // Extrai pixels raw após rotação e recorte para aplicar balanço de branco
  // antes das demais operações (CLAHE funciona melhor com cores balanceadas).
  const { data: rawBuf, info } = await sharp(inputBuffer)
    .rotate()
    .trim({ lineArt: false, threshold: 30 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // ── 2. Balanço de branco (normalização percentílica) ─────────────────────
  // Corrige cast de cor (amarelado/esverdeado de iluminação artificial).
  // Para cada canal R/G/B: escala para que o percentil 95 mapeie a 255.
  applyWhiteBalance(rawBuf, info.channels);

  // ── 3. Reconstrói pipeline a partir do buffer raw corrigido ──────────────
  let pipeline = sharp(rawBuf, {
    raw: { width: info.width, height: info.height, channels: info.channels as 1 | 2 | 3 | 4 },
  });

  // ── 4. Resize ────────────────────────────────────────────────────────────
  // Limita a 4000px no lado maior. 4000px é mais que suficiente para A4.
  const maxDim = Math.max(info.width, info.height);
  if (maxDim > 4000) {
    pipeline = pipeline.resize({
      width: info.width >= info.height ? 4000 : undefined,
      height: info.height > info.width ? 4000 : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // ── 5. CLAHE — Contraste Local Adaptativo ────────────────────────────────
  // Realça detalhes em regiões claras e escuras sem estourar o histograma.
  pipeline = pipeline.clahe({ width: 64, height: 64, maxSlope: 3 });

  // ── 6. Saturação leve ────────────────────────────────────────────────────
  // +15% de saturação devolve vivacidade sem parecer artificial.
  pipeline = pipeline.modulate({ saturation: 1.15 });

  // ── 7. Sharpen ───────────────────────────────────────────────────────────
  pipeline = pipeline.sharpen({ sigma: 1.5, m1: 0.5, m2: 2.0 });

  // ── 8. JPEG 90% ──────────────────────────────────────────────────────────
  const outputBuffer = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();

  return {
    processedBase64: `data:image/jpeg;base64,${outputBuffer.toString('base64')}`,
    tamanhoBytes: outputBuffer.length,
  };
}

/**
 * Balanço de branco por normalização percentílica por canal.
 * Escala cada canal RGB para que o percentil 95 mapeie para 255.
 * Modifica o buffer in-place.
 *
 * Usa histograma O(n) para evitar ordenação de arrays grandes.
 */
function applyWhiteBalance(buf: Buffer, channels: number): void {
  const n = Math.floor(buf.length / channels);
  const target = Math.floor(n * 0.95);

  for (let ch = 0; ch < Math.min(channels, 3); ch++) {
    // Histograma em O(n) para encontrar o percentil 95
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) {
      const k = buf[i * channels + ch]!;
      hist[k] = (hist[k] || 0) + 1;
    }

    let cum = 0;
    let p95 = 255;
    for (let v = 0; v < 256; v++) {
      cum += hist[v]!;
      if (cum >= target) {
        p95 = v;
        break;
      }
    }

    // Pula canal muito escuro ou já bem calibrado
    if (p95 < 10) continue;
    const scale = 255 / p95;
    if (scale < 1.02) continue;

    for (let i = 0; i < n; i++) {
      const v = buf[i * channels + ch]! * scale + 0.5;
      buf[i * channels + ch] = v > 255 ? 255 : v | 0;
    }
  }
}
