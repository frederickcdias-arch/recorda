import sharp from 'sharp';
import type { DocumentImagePoint } from './document-image-processor.js';
import { processFaithfulDocumentScan } from './faithful-document-scan.js';
import { extractAIWarpFromError, type AIWarpMetadata } from './fast-perspective-warp-python.js';

export type { AIWarpMetadata } from './fast-perspective-warp-python.js';

export class FastWarpTimeoutError extends Error {
  readonly aiWarp?: AIWarpMetadata;

  constructor(
    readonly timeoutMs: number,
    readonly elapsedMs: number,
    aiWarp?: AIWarpMetadata
  ) {
    super('ai_warp_timeout');
    this.name = 'FastWarpTimeoutError';
    this.aiWarp = aiWarp;
  }
}

export class FastWarpFailedError extends Error {
  readonly aiWarp?: AIWarpMetadata;

  constructor(
    message: string,
    readonly cause?: unknown,
    aiWarp?: AIWarpMetadata
  ) {
    super(message);
    this.name = 'FastWarpFailedError';
    this.aiWarp = aiWarp;
  }
}

export interface ApplyPerspectiveFromCornersFastOptions {
  quality?: number;
  timeoutMs?: number;
  documentRatio?: 'A1_PORTRAIT' | 'A1_LANDSCAPE' | 'AUTO';
}

export interface FastWarpResult {
  processedBuffer: Buffer;
  thumbnailBuffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  confidence: number;
  warpMs: number;
  aiWarp: AIWarpMetadata;
  faithfulScan: {
    processingMode: 'faithful-scan';
    usedGenerativeAI: false;
    perspectiveCorrected: true;
    contentPreservationMode: true;
    cornerSource: 'manual' | 'native-detect' | 'provided';
    documentRatio: string;
    meshDewarpApplied?: boolean;
    meshDewarpBow?: number;
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: (partial?: AIWarpMetadata) => FastWarpTimeoutError
): Promise<T> {
  if (timeoutMs <= 0) {
    throw onTimeout();
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function applyPerspectiveFromCornersFast(
  inputBuffer: Buffer,
  _mimeType: string,
  corners: DocumentImagePoint[],
  options: ApplyPerspectiveFromCornersFastOptions = {}
): Promise<FastWarpResult> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 5000;

  const warpTask = (async (): Promise<FastWarpResult> => {
    const result = await processFaithfulDocumentScan({
      imageBuffer: inputBuffer,
      corners,
      autoDetectCorners: false,
      documentRatio: options.documentRatio ?? 'AUTO',
      maxDimension: 1600,
      jpegQuality: options.quality ?? 92,
      enhanceText: true,
      reduceShadows: true,
      sharpen: true,
      enableFineAlignment: false,
      enableMeshDewarp: true,
    });

    const durationMs = result.timingMs.totalMs ?? Date.now() - startedAt;

    const aiWarp: AIWarpMetadata = {
      attempted: true,
      method: 'faithful-scan',
      success: true,
      timeout: false,
      durationMs,
      warpMs: result.timingMs.warpMs,
      outputMs: result.timingMs.enhanceMs + result.timingMs.illuminationMs,
      inputWidth: 0,
      inputHeight: 0,
      outputWidth: result.width,
      outputHeight: result.height,
    };

    const meta = await sharp(inputBuffer, { failOn: 'none' }).metadata();
    aiWarp.inputWidth = meta.width;
    aiWarp.inputHeight = meta.height;

    return {
      processedBuffer: result.imageBuffer,
      thumbnailBuffer: result.thumbnailBuffer,
      mimeType: 'image/jpeg' as const,
      width: result.width,
      height: result.height,
      confidence: 0.9,
      warpMs: result.timingMs.warpMs,
      aiWarp,
      faithfulScan: {
        processingMode: result.processingMode,
        usedGenerativeAI: result.usedGenerativeAI,
        perspectiveCorrected: result.perspectiveCorrected,
        contentPreservationMode: result.contentPreservationMode,
        cornerSource: result.cornerSource,
        documentRatio: result.documentRatio,
        meshDewarpApplied: result.meshDewarpApplied ?? false,
        meshDewarpBow: result.meshDewarpBow,
      },
    };
  })();

  try {
    return await withTimeout(
      warpTask,
      timeoutMs,
      (partial) =>
        new FastWarpTimeoutError(timeoutMs, Date.now() - startedAt, {
          attempted: true,
          method: 'faithful-scan',
          success: false,
          timeout: true,
          durationMs: Date.now() - startedAt,
          error: 'ai_warp_timeout',
          ...partial,
        })
    );
  } catch (error) {
    if (error instanceof FastWarpTimeoutError) {
      throw error;
    }
    const aiWarp = extractAIWarpFromError(error);
    if (error instanceof Error && error.message.includes('timeout')) {
      throw new FastWarpTimeoutError(timeoutMs, Date.now() - startedAt, {
        ...aiWarp,
        attempted: true,
        method: 'faithful-scan',
        success: false,
        timeout: true,
        durationMs: Date.now() - startedAt,
        error: error.message,
      });
    }
    throw new FastWarpFailedError(
      error instanceof Error ? error.message : 'Falha no scan fiel por cantos.',
      error,
      aiWarp ?? {
        attempted: true,
        method: 'faithful-scan',
        success: false,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'ai_warp_failed',
      }
    );
  }
}
