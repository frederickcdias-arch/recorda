import {
  decodeImageDataUrl,
  processDocumentImage,
  type DocumentImagePoint,
} from './document-image-processor.js';

export interface ProcessMapImageResult {
  processedBase64: string;
  tamanhoBytes: number;
  confiancaDeteccao: number;
  fallbackUsado: boolean;
  dimensoesFinais: {
    width: number;
    height: number;
  };
  processador: 'python-opencv' | 'sharp-fallback' | 'frontend-assisted';
  thumbnailBase64?: string;
  metadata?: {
    originalWidth?: number;
    originalHeight?: number;
    corners?: DocumentImagePoint[];
    warnings?: string[];
  };
}

export interface ProcessMapImageInput {
  imagemBase64: string;
  imagemCorrigidaBase64?: string;
  manualCorners?: DocumentImagePoint[];
}

/**
 * Processa uma imagem de mapa capturada pelo colaborador.
 * Preserva o fluxo atual do frontend e consolida o processamento final no backend.
 */
export async function processMapImage(
  input: string | ProcessMapImageInput
): Promise<ProcessMapImageResult> {
  const payload: ProcessMapImageInput = typeof input === 'string' ? { imagemBase64: input } : input;

  const original = decodeImageDataUrl(payload.imagemBase64);
  const assisted = payload.imagemCorrigidaBase64
    ? decodeImageDataUrl(payload.imagemCorrigidaBase64)
    : null;

  const result = await processDocumentImage({
    imageBuffer: original.buffer,
    mimeType: original.mimeType,
    manualCorners: payload.manualCorners,
    assistedImageBuffer: assisted?.buffer,
    assistedMimeType: assisted?.mimeType,
    options: {
      preserveColors: true,
      outputFormat: 'jpeg',
      quality: 92,
    },
  });

  return {
    processedBase64: `data:${result.outputMimeType};base64,${result.processedBuffer.toString('base64')}`,
    thumbnailBase64: result.thumbnailBuffer
      ? `data:image/jpeg;base64,${result.thumbnailBuffer.toString('base64')}`
      : undefined,
    tamanhoBytes: result.processedBuffer.length,
    confiancaDeteccao: result.metadata.confidence,
    fallbackUsado: result.metadata.fallback,
    dimensoesFinais: {
      width: result.metadata.width,
      height: result.metadata.height,
    },
    processador: result.metadata.engine as ProcessMapImageResult['processador'],
    metadata: {
      originalWidth: result.metadata.originalWidth,
      originalHeight: result.metadata.originalHeight,
      corners: result.metadata.corners,
      warnings: result.metadata.warnings,
    },
  };
}
