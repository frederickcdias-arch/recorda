import sharp from 'sharp';

/**
 * Processa uma imagem de mapa capturada pelo colaborador.
 * Diferente do OCR preprocessor, MANTÉM as cores originais.
 *
 * Pipeline completo:
 *  1. EXIF rotate        — corrige orientação de fotos tiradas no celular
 *  2. Trim automático    — recorta bordas uniformes (fundo claro ao redor do mapa)
 *  3. Resize             — limita a 4000px para não gerar arquivos gigantes
 *  4. CLAHE              — melhora contraste local adaptativo (realça detalhes do mapa)
 *  5. Modulate           — satura levemente as cores para maior legibilidade
 *  6. Sharpen            — nitidez de traçados e texto, sem artefatos
 *  7. JPEG 90%           — alta qualidade com compressão eficiente
 */
export async function processMapImage(imagemBase64: string): Promise<{
  processedBase64: string;
  tamanhoBytes: number;
}> {
  const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64Data, 'base64');

  // Lê metadados para saber dimensões originais (antes do rotate)
  const metadata = await sharp(inputBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  // ── 1. Auto-rotate via EXIF ──────────────────────────────────────────────
  // Corrige orientação sem degradar qualidade (não aplica resize ainda)
  let pipeline = sharp(inputBuffer).rotate();

  // ── 2. Recorte automático de bordas uniformes (trim) ────────────────────
  // Remove margens de cor homogênea ao redor da foto (fundo branco/escuro/cinza).
  // threshold: tolerância de cor (0–255). 30 funciona bem para fotos reais.
  pipeline = pipeline.trim({ lineArt: false, threshold: 30 });

  // ── 3. Resize ────────────────────────────────────────────────────────────
  // Limita a 4000px no lado maior. Fotos de celular costumam ter 8–12 MP;
  // 4000px já é resolução mais que suficiente para impressão A4.
  const maxDim = Math.max(width, height);
  if (maxDim > 4000) {
    pipeline = pipeline.resize({
      width: width >= height ? 4000 : undefined,
      height: height > width ? 4000 : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // ── 4. CLAHE — Contraste Local Adaptativo ────────────────────────────────
  // Realça detalhes em regiões claras e escuras sem estourar o histograma.
  // width/height: tamanho do tile (64×64 px é bom para mapas físicos).
  // maxSlope: limita amplificação de ruído (3 = equilibrado).
  pipeline = pipeline.clahe({ width: 64, height: 64, maxSlope: 3 });

  // ── 5. Saturação leve ────────────────────────────────────────────────────
  // Fotos de mapa em papel costumam sair acinzentadas. +15% de saturação
  // devolve vivacidade às cores sem parecer artificial.
  pipeline = pipeline.modulate({ saturation: 1.15 });

  // ── 6. Sharpen — nitidez de traçados e texto ─────────────────────────────
  // sigma: raio do kernel gaussiano. 1.5 é mais nítido que 1.2 sem halos.
  // m1/m2: ganho em regiões planas vs bordas.
  pipeline = pipeline.sharpen({ sigma: 1.5, m1: 0.5, m2: 2.0 });

  // ── 7. JPEG 90% ──────────────────────────────────────────────────────────
  // mozjpeg: encoder otimizado da Mozilla — melhor compressão no mesmo nível.
  const outputBuffer = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();

  return {
    processedBase64: `data:image/jpeg;base64,${outputBuffer.toString('base64')}`,
    tamanhoBytes: outputBuffer.length,
  };
}
