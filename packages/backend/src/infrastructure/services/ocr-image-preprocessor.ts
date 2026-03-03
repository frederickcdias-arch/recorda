import sharp from 'sharp';

/**
 * Pre-processes an image to improve OCR accuracy.
 * Pipeline: EXIF rotate → resize → grayscale → normalize → sharpen → PNG
 */
export async function preprocessImageForOCR(imagemBase64: string): Promise<string> {
  const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64Data, 'base64');

  const metadata = await sharp(inputBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  // 1. Auto-rotate based on EXIF (handles phone camera rotation)
  let pipeline = sharp(inputBuffer).rotate();

  // 2. Resize if very large (>4000px) — saves processing time
  if (width > 4000 || height > 4000) {
    pipeline = pipeline.resize({
      width: width > height ? 4000 : undefined,
      height: height >= width ? 4000 : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // 3. Upscale small images (< 1000px) — Tesseract works better with larger text
  if (width < 1000 && height < 1000) {
    const scale = Math.ceil(1000 / Math.max(width, height));
    pipeline = pipeline.resize({
      width: width * scale,
      height: height * scale,
      fit: 'fill',
      kernel: 'lanczos3',
    });
  }

  // 4. Convert to grayscale
  pipeline = pipeline.grayscale();

  // 5. Normalize contrast
  pipeline = pipeline.normalize();

  // 6. Sharpen text edges
  pipeline = pipeline.sharpen({ sigma: 1.5 });

  // 7. Output as PNG
  const outputBuffer = await pipeline.png().toBuffer();

  return `data:image/png;base64,${outputBuffer.toString('base64')}`;
}
