import sharp from 'sharp';

/**
 * Processa uma imagem de mapa capturada pelo colaborador.
 * Diferente do OCR preprocessor, MANTÉM as cores originais.
 * Pipeline: EXIF rotate → resize se muito grande → leve ajuste de contraste → sharpen → JPEG
 */
export async function processMapImage(imagemBase64: string): Promise<{
  processedBase64: string;
  tamanhoBytes: number;
}> {
  const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64Data, 'base64');

  const metadata = await sharp(inputBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  // 1. Auto-rotate via EXIF (corrige orientação de foto tirada no celular)
  let pipeline = sharp(inputBuffer).rotate();

  // 2. Redimensiona se muito grande (> 5000px em qualquer dimensão)
  if (width > 5000 || height > 5000) {
    pipeline = pipeline.resize({
      width: width > height ? 5000 : undefined,
      height: height >= width ? 5000 : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // 3. Leve boost de contraste mantendo as cores (normaliza histograma)
  pipeline = pipeline.normalize();

  // 4. Sharpen suave para nítidez do texto/traçados do mapa
  pipeline = pipeline.sharpen({ sigma: 1.2 });

  // 5. Output JPEG com qualidade 88% — bom equilíbrio tamanho/nitidez
  const outputBuffer = await pipeline.jpeg({ quality: 88 }).toBuffer();

  return {
    processedBase64: `data:image/jpeg;base64,${outputBuffer.toString('base64')}`,
    tamanhoBytes: outputBuffer.length,
  };
}
