import sharp from 'sharp';
import { tryProcessDocumentImageWithPython } from './document-image-python-processor.js';

export interface DocumentImagePoint {
  x: number;
  y: number;
}

export interface ProcessDocumentImageInput {
  imageBuffer: Buffer;
  mimeType: string;
  manualCorners?: DocumentImagePoint[];
  assistedImageBuffer?: Buffer;
  assistedMimeType?: string;
  options?: {
    preserveColors?: boolean;
    outputFormat?: 'jpeg' | 'png' | 'webp';
    quality?: number;
  };
}

export interface ProcessDocumentImageResult {
  success: boolean;
  processedBuffer: Buffer;
  thumbnailBuffer?: Buffer;
  outputMimeType: string;
  metadata: {
    engine: string;
    confidence: number;
    fallback: boolean;
    width: number;
    height: number;
    originalWidth?: number;
    originalHeight?: number;
    corners?: DocumentImagePoint[];
    warnings?: string[];
  };
}

const MAX_OUTPUT_DIMENSION = 2600;
const MAX_THUMB_DIMENSION = 320;

function isSupportedMimeType(mimeType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType);
}

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

function mimeTypeFromFormat(format: 'jpeg' | 'png' | 'webp'): string {
  switch (format) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

function encodeDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export function decodeImageDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  const mimeType = match?.[1];
  const payload = match?.[2];
  if (!mimeType || !payload) {
    throw new Error('Imagem invalida. Envie JPEG, PNG ou WEBP em data URI base64.');
  }

  return {
    mimeType,
    buffer: Buffer.from(payload.replace(/\s+/g, ''), 'base64'),
  };
}

async function finalizeOutput(
  buffer: Buffer,
  format: 'jpeg' | 'png' | 'webp',
  quality: number,
  preserveColors: boolean
): Promise<{ buffer: Buffer; width: number; height: number; mimeType: string }> {
  let pipeline = sharp(buffer, { failOn: 'none' }).rotate().resize({
    width: MAX_OUTPUT_DIMENSION,
    height: MAX_OUTPUT_DIMENSION,
    fit: 'inside',
    withoutEnlargement: true,
  });

  if (preserveColors) {
    pipeline = pipeline.toColourspace('srgb');
  }

  if (format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 4, adaptiveFiltering: true });
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ quality, effort: 4 });
  } else {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  }

  const outputBuffer = await pipeline.toBuffer();
  const metadata = await sharp(outputBuffer).metadata();
  return {
    buffer: outputBuffer,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    mimeType: mimeTypeFromFormat(format),
  };
}

async function createThumbnail(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer, { failOn: 'none' })
    .resize({
      width: MAX_THUMB_DIMENSION,
      height: MAX_THUMB_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}

async function processWithSharpFallback(
  imageBuffer: Buffer,
  format: 'jpeg' | 'png' | 'webp',
  quality: number,
  warnings: string[]
): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
}> {
  let pipeline = sharp(imageBuffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: MAX_OUTPUT_DIMENSION,
      height: MAX_OUTPUT_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .normalize()
    .modulate({ brightness: 1.02, saturation: 1.01 })
    .sharpen({ sigma: 1.15, m1: 0.3, m2: 1.3 });

  if (format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 4, adaptiveFiltering: true });
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ quality, effort: 4 });
  } else {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  }

  const outputBuffer = await pipeline.toBuffer();
  const metadata = await sharp(outputBuffer).metadata();
  warnings.push('Documento nao corrigido com perspectiva completa; aplicada melhoria leve.');
  return {
    buffer: outputBuffer,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    mimeType: mimeTypeFromFormat(format),
  };
}

export async function processDocumentImage(
  input: ProcessDocumentImageInput
): Promise<ProcessDocumentImageResult> {
  const { imageBuffer, mimeType, manualCorners, assistedImageBuffer, assistedMimeType, options } =
    input;

  if (!isSupportedMimeType(mimeType)) {
    throw new Error('Tipo de imagem nao suportado. Use JPEG, PNG ou WEBP.');
  }

  const preserveColors = options?.preserveColors ?? true;
  const outputFormat = options?.outputFormat ?? 'jpeg';
  const quality = Math.min(100, Math.max(60, options?.quality ?? 92));
  const warnings: string[] = [];

  const originalMetadata = await sharp(imageBuffer, { failOn: 'none' }).metadata();
  const originalWidth = originalMetadata.width ?? 0;
  const originalHeight = originalMetadata.height ?? 0;

  if (assistedImageBuffer) {
    const assistedMime =
      assistedMimeType && isSupportedMimeType(assistedMimeType)
        ? assistedMimeType
        : mimeTypeFromFormat(outputFormat);
    const finalized = await finalizeOutput(
      assistedImageBuffer,
      outputFormat,
      quality,
      preserveColors
    );
    const thumbnailBuffer = await createThumbnail(finalized.buffer);
    return {
      success: true,
      processedBuffer: finalized.buffer,
      thumbnailBuffer,
      outputMimeType: finalized.mimeType,
      metadata: {
        engine: 'frontend-assisted',
        confidence: manualCorners?.length === 4 ? 0.99 : 0.9,
        fallback: false,
        width: finalized.width,
        height: finalized.height,
        originalWidth,
        originalHeight,
        corners: manualCorners,
        warnings:
          assistedMime !== finalized.mimeType
            ? ['Imagem corrigida no frontend e reencodada no backend.']
            : undefined,
      },
    };
  }

  try {
    const pythonResult = await tryProcessDocumentImageWithPython(
      encodeDataUrl(imageBuffer, mimeType)
    );
    if (pythonResult) {
      const processed = decodeImageDataUrl(pythonResult.processedBase64);
      const finalized = await finalizeOutput(
        processed.buffer,
        outputFormat,
        quality,
        preserveColors
      );
      const thumbnailBuffer = await createThumbnail(finalized.buffer);
      return {
        success: true,
        processedBuffer: finalized.buffer,
        thumbnailBuffer,
        outputMimeType: finalized.mimeType,
        metadata: {
          engine: pythonResult.processador,
          confidence: pythonResult.confiancaDeteccao,
          fallback: pythonResult.fallbackUsado,
          width: finalized.width,
          height: finalized.height,
          originalWidth,
          originalHeight,
          corners: manualCorners,
          warnings: pythonResult.fallbackUsado
            ? ['Nao foi possivel detectar a folha com seguranca. Aplicado fallback seguro.']
            : undefined,
        },
      };
    }
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Processador Python indisponivel: ${error.message}`
        : 'Processador Python indisponivel.'
    );
  }

  const fallback = await processWithSharpFallback(imageBuffer, outputFormat, quality, warnings);
  const thumbnailBuffer = await createThumbnail(fallback.buffer);
  return {
    success: true,
    processedBuffer: fallback.buffer,
    thumbnailBuffer,
    outputMimeType: fallback.mimeType,
    metadata: {
      engine: 'sharp-fallback',
      confidence: 0,
      fallback: true,
      width: fallback.width,
      height: fallback.height,
      originalWidth,
      originalHeight,
      corners: manualCorners,
      warnings,
    },
  };
}

export function buildGeneratedFilename(baseName: string, mimeType: string): string {
  const ext = extensionFromMimeType(mimeType);
  return `${baseName}.${ext}`;
}
