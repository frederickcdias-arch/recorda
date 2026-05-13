import sharp from 'sharp';

/**
 * Processa uma imagem de mapa capturada pelo colaborador.
 * Diferente do OCR preprocessor, MANTÉM as cores originais.
 *
 * Pipeline focado em simetria/alinhamento:
 *  1. EXIF rotate + Trim — corrige orientação EXIF e remove bordas uniformes
 *  2. Resize             — limita a 4000 px para não gerar arquivos gigantes
 *  3. Sharpen            — nitidez leve para traçados e texto do mapa
 *  4. JPEG 90 %          — alta qualidade com compressão eficiente (mozjpeg)
 */
export async function processMapImage(imagemBase64: string): Promise<{
  processedBase64: string;
  tamanhoBytes: number;
}> {
  const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64Data, 'base64');

  // ── 1. EXIF rotate + Trim ────────────────────────────────────────────────
  // Corrige a orientação gravada pelo sensor da câmera e apara bordas
  // uniformes (ex.: margens pretas de fotos tiradas em ângulo).
  let pipeline = sharp(inputBuffer).rotate().trim({ lineArt: false, threshold: 30 });

  // ── 2. Resize ────────────────────────────────────────────────────────────
  // withoutEnlargement garante que imagens menores não sejam ampliadas.
  pipeline = pipeline.resize({
    width: 4000,
    height: 4000,
    fit: 'inside',
    withoutEnlargement: true,
  });

  // ── 3. Sharpen ───────────────────────────────────────────────────────────
  // Nitidez leve para traçados e texto do mapa, sem artefatos.
  pipeline = pipeline.sharpen({ sigma: 1.5, m1: 0.5, m2: 2.0 });

  // ── 4. JPEG 90% ──────────────────────────────────────────────────────────
  const outputBuffer = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();

  return {
    processedBase64: `data:image/jpeg;base64,${outputBuffer.toString('base64')}`,
    tamanhoBytes: outputBuffer.length,
  };
}
