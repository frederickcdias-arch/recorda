import sharp from 'sharp';

/**
 * Processa uma imagem de mapa capturada pelo colaborador.
 * Diferente do OCR preprocessor, MANTÉM as cores originais.
 *
 * Pipeline completo:
 *  1. Balanço de branco  — P95 por canal calculado em miniatura; aplicado via linear()
 *  2. EXIF rotate + Trim — corrige orientação e remove bordas uniformes
 *  3. Resize             — limita a 4000 px para não gerar arquivos gigantes
 *  4. CLAHE              — melhora contraste local adaptativo
 *  5. Modulate           — satura levemente as cores para maior legibilidade
 *  6. Sharpen            — nitidez de traçados e texto, sem artefatos
 *  7. JPEG 90 %          — alta qualidade com compressão eficiente (mozjpeg)
 */
export async function processMapImage(imagemBase64: string): Promise<{
  processedBase64: string;
  tamanhoBytes: number;
}> {
  const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64Data, 'base64');

  // ── 1. Balanço de branco — análise em miniatura, aplicação via linear() ──
  // Calcula escala percentílica P95 por canal em uma cópia reduzida a ≤400 px
  // (rápida) e aplica com sharp.linear() (libvips, C++), eliminando o loop JS
  // sobre o buffer em resolução completa — até 100× mais rápido em imagens grandes.
  const { data: smallBuf, info: smallInfo } = await sharp(inputBuffer)
    .rotate()
    .trim({ lineArt: false, threshold: 30 })
    .resize({ width: 400, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const wbScales = computeWbScales(smallBuf, smallInfo.channels);

  // ── 2. Pipeline principal ─────────────────────────────────────────────────
  let pipeline = sharp(inputBuffer).rotate().trim({ lineArt: false, threshold: 30 });

  if (wbScales.some((s) => s !== 1)) {
    pipeline = pipeline.linear(wbScales, new Array<number>(wbScales.length).fill(0));
  }

  // ── 3. Resize ────────────────────────────────────────────────────────────
  // withoutEnlargement garante que imagens menores não sejam ampliadas.
  pipeline = pipeline.resize({
    width: 4000,
    height: 4000,
    fit: 'inside',
    withoutEnlargement: true,
  });

  // ── 4. CLAHE — Contraste Local Adaptativo ────────────────────────────────
  // Realça detalhes em regiões claras e escuras sem estourar o histograma.
  pipeline = pipeline.clahe({ width: 64, height: 64, maxSlope: 3 });

  // ── 5. Saturação leve ────────────────────────────────────────────────────
  // +15% de saturação devolve vivacidade sem parecer artificial.
  pipeline = pipeline.modulate({ saturation: 1.15 });

  // ── 6. Sharpen ───────────────────────────────────────────────────────────
  pipeline = pipeline.sharpen({ sigma: 1.5, m1: 0.5, m2: 2.0 });

  // ── 7. JPEG 90% ──────────────────────────────────────────────────────────
  const outputBuffer = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();

  return {
    processedBase64: `data:image/jpeg;base64,${outputBuffer.toString('base64')}`,
    tamanhoBytes: outputBuffer.length,
  };
}

/**
 * Calcula os fatores de escala de balanço de branco por canal.
 * Para cada canal RGB, retorna o fator que mapeia o percentil 95 para 255.
 * Canais muito escuros (p95 < 10) ou já bem calibrados (escala < 1.02)
 * recebem fator 1 (sem ajuste).
 */
function computeWbScales(buf: Buffer, channels: number): number[] {
  const scales = new Array<number>(channels).fill(1);
  const n = Math.floor(buf.length / channels);
  const target = Math.floor(n * 0.95);

  for (let ch = 0; ch < Math.min(channels, 3); ch++) {
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

    if (p95 < 10) continue;
    const scale = 255 / p95;
    if (scale < 1.02) continue;
    scales[ch] = scale;
  }

  return scales;
}
