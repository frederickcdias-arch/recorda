import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  getOpenAIConfigFingerprint,
  getOpenAIImageConfig,
  isOpenAIAutoCropAvailable,
  isOpenAIImageAvailable,
  OPENAI_PROMPT_VERSION,
  resolveOpenAISkipReason,
  type OpenAIImageConfig,
  type OpenAISkipReason,
} from '../config/openai-image-config.js';
import { getMapImageFaithfulScanConfig } from '../config/map-image-faithful-scan-config.js';
import { parseCornersPayload } from './openai-corners-utils.js';

export type OpenAIRecommendedAction =
  | 'use'
  | 'local_correct'
  | 'ai_correct'
  | 'retake'
  | 'auto_crop'
  | 'manual_adjust'
  | 'use_original';
export type OpenAIQuality = 'good' | 'acceptable' | 'poor';

export interface OpenAICornerPoint {
  x: number;
  y: number;
}

export interface OpenAICornersPayload {
  topLeft: OpenAICornerPoint;
  topRight: OpenAICornerPoint;
  bottomRight: OpenAICornerPoint;
  bottomLeft: OpenAICornerPoint;
}

export interface OpenAIImageAnalysis {
  documentDetected: boolean;
  quality: OpenAIQuality;
  recommendedAction: OpenAIRecommendedAction;
  problems: string[];
  confidence: number;
  notes: string;
  corners?: OpenAICornersPayload;
  imageSize?: { width: number; height: number };
}

export interface OpenAIImageProcessorResult {
  success: boolean;
  analysis?: OpenAIImageAnalysis;
  correctedImageBuffer?: Buffer;
  processingOrigin: 'openai';
  model?: string;
  durationMs?: number;
  error?: string;
  usedGuidedLocalEnhancement?: boolean;
  cacheHit?: boolean;
  metadata?: OpenAIImageMetadata;
}

export interface OpenAIImageMetadata {
  called: boolean;
  attempted: boolean;
  success: boolean;
  cacheHit?: boolean;
  model?: string;
  durationMs?: number;
  imageHash?: string;
  configFingerprint?: string;
  promptVersion?: string;
  analyzedAt?: string;
  inputImageWidth?: number;
  inputImageHeight?: number;
  sentImageWidth?: number;
  sentImageHeight?: number;
  inputImageBytes?: number;
  compressedBytes?: number;
  maxWidth?: number;
  jpegQuality?: number;
  reason?: string;
  recommendedAction?: OpenAIRecommendedAction;
  quality?: OpenAIQuality;
  confidence?: number;
  problems?: string[];
  analysis?: OpenAIImageAnalysis;
  error?: string;
  skippedReason?: OpenAISkipReason;
  timeout?: boolean;
  resizeMs?: number;
  usedGuidedLocalEnhancement?: boolean;
  /** Sempre false — este módulo nunca usa IA generativa de imagem (DALL-E / image edit). */
  usedGenerativeAI?: false;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface OpenAIEnhancementOptions {
  melhorarComIa?: boolean;
  forcarAnaliseIa?: boolean;
  reprocessarComIa?: boolean;
  priorOpenAIMetadata?: OpenAIImageMetadata;
}

export interface LocalMapProcessingSnapshot {
  confiancaDeteccao: number;
  fallbackUsado: boolean;
  processador: string;
  metadata?: {
    decision?: string;
    documentClass?: string;
  };
}

type FetchFn = typeof fetch;

let fetchImpl: FetchFn = fetch;

export function setOpenAIFetchForTests(mockFetch: FetchFn | null): void {
  fetchImpl = mockFetch ?? fetch;
}

interface OpenAICacheEntry {
  metadata: OpenAIImageMetadata;
  analysis: OpenAIImageAnalysis;
}

const openAICache = new Map<string, OpenAICacheEntry>();

export function clearOpenAICacheForTests(): void {
  openAICache.clear();
}

export function computeOpenAIImageHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 32);
}

function buildCacheKey(imageHash: string, configFingerprint: string): string {
  return `${configFingerprint}:${imageHash}`;
}

export function canReuseOpenAICache(
  cached: OpenAIImageMetadata | undefined,
  imageHash: string,
  configFingerprint: string,
  options: OpenAIEnhancementOptions
): cached is OpenAIImageMetadata {
  if (options.reprocessarComIa) {
    return false;
  }
  if (!cached?.success || !cached.imageHash) {
    return false;
  }
  return cached.imageHash === imageHash && cached.configFingerprint === configFingerprint;
}

export function resolveOpenAIInvocationReason(
  localResult: LocalMapProcessingSnapshot,
  options: OpenAIEnhancementOptions
): string | undefined {
  if (options.reprocessarComIa) return 'reprocessar_com_ia';
  if (options.melhorarComIa) return 'melhorar_com_ia';
  if (options.forcarAnaliseIa) return 'forcar_analise_ia';
  if (localResult.metadata?.decision === 'manual_review_recommended') {
    return 'manual_review_recommended';
  }
  if (localResult.metadata?.documentClass === 'low_confidence_capture') {
    return 'low_confidence_capture';
  }
  if (localResult.processador === 'sharp-fallback') {
    return 'sharp_fallback';
  }
  if (localResult.fallbackUsado && localResult.confiancaDeteccao < 0.75) {
    return 'fallback_low_confidence';
  }
  if (localResult.confiancaDeteccao < 0.55) {
    return 'low_confidence';
  }
  return undefined;
}

const ANALYSIS_PROMPT = `Detecte os quatro cantos EXTERNOS da folha/documento/mapa arquivistico visivel na imagem.
Responda SOMENTE JSON valido com:
{
  "documentDetected": boolean,
  "confidence": number,
  "quality": "good" | "acceptable" | "poor",
  "recommendedAction": "auto_crop" | "retake" | "manual_adjust" | "use_original",
  "corners": {
    "topLeft": { "x": number, "y": number },
    "topRight": { "x": number, "y": number },
    "bottomRight": { "x": number, "y": number },
    "bottomLeft": { "x": number, "y": number }
  },
  "imageSize": { "width": number, "height": number },
  "problems": string[],
  "notes": string
}
Regras obrigatorias:
- Detecte os quatro cantos externos da folha/documento branco inteiro, NAO os cantos da imagem/foto impressa dentro da folha.
- Se houver folha branca com conteudo (foto colorida, mapa ou texto) dentro, os cantos devem ser da folha branca inteira, ignorando mesa/fundo.
- Coordenadas no sistema da imagem enviada (pixels), no tamanho exato da imagem enviada.
- PRECISAO MAXIMA: informe as coordenadas de pixel mais precisas possivel para cada canto da folha, rastreando a borda fisica EXTERNA do papel (ponta do retangulo branco), NAO bordas internas do mapa/conteudo impresso. Prefira incluir a margem branca completa da folha a cortar conteudo — e melhor marcar 5-15 px para fora do conteudo do que para dentro.
- NAO arredonde para multiplos de 5 ou 10 — use o valor de pixel real. Os cantos superior-esquerdo e superior-direito QUASE NUNCA tem o mesmo Y numa foto tirada com inclinacao.
- Cantos na ordem topLeft, topRight, bottomRight, bottomLeft.
- Use problems como: blur, shadow, cropped, perspective, background, partial_document, low_light, glare, low_contrast, inner_content_only.
- Se nao detectar a folha/documento externo com seguranca, use recommendedAction manual_adjust ou retake e documentDetected false.
- Nao invente conteudo fora do documento visivel.`;

export async function prepareImageForOpenAI(
  imageBuffer: Buffer,
  config: OpenAIImageConfig = getOpenAIImageConfig()
): Promise<{
  buffer: Buffer;
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}> {
  const prepared = await sharp(imageBuffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: config.maxWidth,
      height: config.maxWidth,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: config.jpegQuality, mozjpeg: true })
    .toBuffer();

  const metadata = await sharp(prepared, { failOn: 'none' }).metadata();

  return {
    buffer: prepared,
    base64: prepared.toString('base64'),
    mimeType: 'image/jpeg',
    width: metadata.width ?? config.maxWidth,
    height: metadata.height ?? config.maxWidth,
  };
}

export function shouldInvokeOpenAIAutoCrop(
  hasManualCorners: boolean,
  config: OpenAIImageConfig = getOpenAIImageConfig()
): boolean {
  if (hasManualCorners) return false;
  return isOpenAIAutoCropAvailable(config);
}

export function shouldInvokeOpenAI(
  localResult: LocalMapProcessingSnapshot,
  options: OpenAIEnhancementOptions = {},
  config: OpenAIImageConfig = getOpenAIImageConfig()
): boolean {
  if (!isOpenAIImageAvailable(config)) {
    return false;
  }
  if (options.melhorarComIa || options.forcarAnaliseIa || options.reprocessarComIa) {
    return true;
  }

  if (localResult.metadata?.decision === 'manual_review_recommended') {
    return true;
  }
  if (localResult.metadata?.documentClass === 'low_confidence_capture') {
    return true;
  }
  if (localResult.processador === 'sharp-fallback') {
    return true;
  }
  if (localResult.fallbackUsado && localResult.confiancaDeteccao < 0.75) {
    return true;
  }
  if (localResult.confiancaDeteccao < 0.55) {
    return true;
  }

  return false;
}

function parseAnalysisPayload(raw: string): OpenAIImageAnalysis {
  const parsed = JSON.parse(raw) as Partial<OpenAIImageAnalysis> & {
    corners?: unknown;
    imageSize?: { width?: number; height?: number };
  };
  const recommendedAction =
    parsed.recommendedAction === 'use' ||
    parsed.recommendedAction === 'local_correct' ||
    parsed.recommendedAction === 'ai_correct' ||
    parsed.recommendedAction === 'retake' ||
    parsed.recommendedAction === 'auto_crop' ||
    parsed.recommendedAction === 'manual_adjust' ||
    parsed.recommendedAction === 'use_original'
      ? parsed.recommendedAction
      : 'manual_adjust';

  return {
    documentDetected: Boolean(parsed.documentDetected),
    quality: parsed.quality === 'good' || parsed.quality === 'acceptable' ? parsed.quality : 'poor',
    recommendedAction,
    problems: Array.isArray(parsed.problems)
      ? parsed.problems.filter((item): item is string => typeof item === 'string')
      : [],
    confidence:
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0,
    notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 500) : '',
    corners: parseCornersPayload(parsed.corners),
    imageSize:
      typeof parsed.imageSize?.width === 'number' &&
      typeof parsed.imageSize?.height === 'number' &&
      parsed.imageSize.width > 0 &&
      parsed.imageSize.height > 0
        ? { width: parsed.imageSize.width, height: parsed.imageSize.height }
        : undefined,
  };
}

async function applyAnalysisGuidedLocalEnhancement(
  imageBuffer: Buffer,
  analysis: OpenAIImageAnalysis,
  config: OpenAIImageConfig
): Promise<Buffer | null> {
  if (analysis.recommendedAction === 'retake' || analysis.recommendedAction === 'use') {
    return null;
  }

  let pipeline = sharp(imageBuffer, { failOn: 'none' }).rotate();

  if (
    analysis.problems.includes('shadow') ||
    analysis.problems.includes('low_light') ||
    analysis.problems.includes('low_contrast')
  ) {
    pipeline = pipeline.normalize().modulate({ brightness: 1.04, saturation: 1.02 });
  }
  if (analysis.problems.includes('blur')) {
    pipeline = pipeline.sharpen({ sigma: 0.65, m1: 0.08, m2: 0.35 });
  }
  if (analysis.problems.includes('glare')) {
    pipeline = pipeline.gamma(1.05);
  }

  return pipeline.jpeg({ quality: config.jpegQuality, mozjpeg: true }).toBuffer();
}

function buildOpenAIMetadata(params: {
  called: boolean;
  success: boolean;
  cacheHit: boolean;
  config: OpenAIImageConfig;
  imageHash: string;
  reason?: string;
  durationMs: number;
  inputImageWidth?: number;
  inputImageHeight?: number;
  inputImageBytes: number;
  compressedBytes: number;
  sentImageWidth?: number;
  sentImageHeight?: number;
  analysis?: OpenAIImageAnalysis;
  error?: string;
  usedGuidedLocalEnhancement?: boolean;
  usage?: OpenAIImageMetadata['usage'];
  resizeMs?: number;
}): OpenAIImageMetadata {
  return {
    called: params.called,
    attempted: params.called,
    success: params.success,
    cacheHit: params.cacheHit,
    model: params.config.model,
    durationMs: params.durationMs,
    imageHash: params.imageHash,
    configFingerprint: getOpenAIConfigFingerprint(params.config),
    promptVersion: OPENAI_PROMPT_VERSION,
    analyzedAt: params.success ? new Date().toISOString() : undefined,
    inputImageWidth: params.inputImageWidth,
    inputImageHeight: params.inputImageHeight,
    sentImageWidth: params.sentImageWidth,
    sentImageHeight: params.sentImageHeight,
    inputImageBytes: params.inputImageBytes,
    compressedBytes: params.compressedBytes,
    maxWidth: params.config.maxWidth,
    jpegQuality: params.config.jpegQuality,
    reason: params.reason,
    recommendedAction: params.analysis?.recommendedAction,
    quality: params.analysis?.quality,
    confidence: params.analysis?.confidence,
    problems: params.analysis?.problems,
    analysis: params.analysis,
    error: params.error,
    usedGuidedLocalEnhancement: params.usedGuidedLocalEnhancement,
    usedGenerativeAI: false,
    usage: params.usage,
    resizeMs: params.resizeMs,
  };
}

async function buildResultFromAnalysis(
  prepared: {
    buffer: Buffer;
    base64: string;
    mimeType: 'image/jpeg';
    width: number;
    height: number;
  },
  analysis: OpenAIImageAnalysis,
  options: OpenAIEnhancementOptions,
  config: OpenAIImageConfig,
  metadataBase: {
    called: boolean;
    attempted: boolean;
    cacheHit?: boolean;
    imageHash?: string;
    reason?: string;
    durationMs?: number;
    inputImageWidth?: number;
    inputImageHeight?: number;
    inputImageBytes?: number;
    compressedBytes?: number;
    sentImageWidth?: number;
    sentImageHeight?: number;
    usage?: OpenAIImageMetadata['usage'];
    resizeMs?: number;
  }
): Promise<OpenAIImageProcessorResult> {
  let correctedImageBuffer: Buffer | undefined;
  let usedGuidedLocalEnhancement = false;

  if (
    !getMapImageFaithfulScanConfig().blockGenerativeReplacement &&
    (analysis.recommendedAction === 'ai_correct' ||
      analysis.recommendedAction === 'local_correct' ||
      options.melhorarComIa ||
      options.reprocessarComIa)
  ) {
    const enhanced = await applyAnalysisGuidedLocalEnhancement(prepared.buffer, analysis, config);
    if (enhanced) {
      correctedImageBuffer = enhanced;
      usedGuidedLocalEnhancement = true;
    }
  }

  const metadata = buildOpenAIMetadata({
    called: metadataBase.called,
    success: true,
    cacheHit: Boolean(metadataBase.cacheHit),
    config,
    imageHash: metadataBase.imageHash ?? computeOpenAIImageHash(prepared.buffer),
    reason: metadataBase.reason,
    durationMs: metadataBase.durationMs ?? 0,
    inputImageWidth: metadataBase.inputImageWidth,
    inputImageHeight: metadataBase.inputImageHeight,
    inputImageBytes: metadataBase.inputImageBytes ?? prepared.buffer.length,
    compressedBytes: metadataBase.compressedBytes ?? prepared.buffer.length,
    sentImageWidth: metadataBase.sentImageWidth ?? prepared.width,
    sentImageHeight: metadataBase.sentImageHeight ?? prepared.height,
    analysis,
    usedGuidedLocalEnhancement,
    usage: metadataBase.usage,
    resizeMs: metadataBase.resizeMs,
  });

  return {
    success: true,
    analysis,
    correctedImageBuffer,
    processingOrigin: 'openai',
    model: config.model,
    durationMs: metadata.durationMs,
    usedGuidedLocalEnhancement,
    cacheHit: metadata.cacheHit,
    metadata,
  };
}

export function createSkippedOpenAIMetadata(
  skippedReason: OpenAISkipReason,
  reason?: string
): OpenAIImageMetadata {
  return {
    called: false,
    attempted: false,
    success: false,
    skippedReason,
    reason,
  };
}

export async function processOpenAIImageEnhancement(
  imageBuffer: Buffer,
  options: OpenAIEnhancementOptions = {},
  config: OpenAIImageConfig = getOpenAIImageConfig(),
  invocationReason?: string
): Promise<OpenAIImageProcessorResult> {
  const startedAt = Date.now();
  const inputMeta = await sharp(imageBuffer, { failOn: 'none' }).metadata();

  const skipReason = resolveOpenAISkipReason(config);
  if (skipReason) {
    return {
      success: false,
      processingOrigin: 'openai',
      error:
        skipReason === 'disabled' ? 'OpenAI image processing disabled' : 'OpenAI API key missing',
      metadata: createSkippedOpenAIMetadata(skipReason, invocationReason),
    };
  }

  let resizeMs = 0;
  try {
    const resizeStartedAt = Date.now();
    const prepared = await prepareImageForOpenAI(imageBuffer, config);
    resizeMs = Date.now() - resizeStartedAt;
    const imageHash = computeOpenAIImageHash(prepared.buffer);
    const configFingerprint = getOpenAIConfigFingerprint(config);
    const cacheKey = buildCacheKey(imageHash, configFingerprint);
    const reason = invocationReason;

    const cachedFromMemory = openAICache.get(cacheKey);
    const cachedFromRequest = canReuseOpenAICache(
      options.priorOpenAIMetadata,
      imageHash,
      configFingerprint,
      options
    )
      ? options.priorOpenAIMetadata
      : undefined;

    const reusableAnalysis =
      !options.reprocessarComIa &&
      (cachedFromMemory?.analysis ??
        (cachedFromRequest?.analysis ? cachedFromRequest.analysis : undefined));

    if (reusableAnalysis) {
      const durationMs = Date.now() - startedAt;
      return buildResultFromAnalysis(prepared, reusableAnalysis, options, config, {
        called: true,
        attempted: true,
        cacheHit: true,
        imageHash,
        reason,
        durationMs,
        inputImageWidth: inputMeta.width,
        inputImageHeight: inputMeta.height,
        inputImageBytes: imageBuffer.length,
        compressedBytes: prepared.buffer.length,
        sentImageWidth: prepared.width,
        sentImageHeight: prepared.height,
        usage: cachedFromMemory?.metadata.usage ?? cachedFromRequest?.usage,
        resizeMs,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          response_format: { type: 'json_object' },
          max_tokens: 700,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: ANALYSIS_PROMPT },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${prepared.mimeType};base64,${prepared.base64}`,
                  },
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      const errorText = await response.text();
      const metadata = buildOpenAIMetadata({
        called: true,
        success: false,
        cacheHit: false,
        config,
        imageHash,
        reason,
        durationMs,
        inputImageWidth: inputMeta.width,
        inputImageHeight: inputMeta.height,
        inputImageBytes: imageBuffer.length,
        compressedBytes: prepared.buffer.length,
        error: `OpenAI HTTP ${response.status}: ${errorText.slice(0, 200)}`,
      });
      return {
        success: false,
        processingOrigin: 'openai',
        model: config.model,
        durationMs,
        error: metadata.error,
        metadata,
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      const metadata = buildOpenAIMetadata({
        called: true,
        success: false,
        cacheHit: false,
        config,
        imageHash,
        reason,
        durationMs,
        inputImageWidth: inputMeta.width,
        inputImageHeight: inputMeta.height,
        inputImageBytes: imageBuffer.length,
        compressedBytes: prepared.buffer.length,
        error: 'OpenAI response without content',
      });
      return {
        success: false,
        processingOrigin: 'openai',
        model: config.model,
        durationMs,
        error: metadata.error,
        metadata,
      };
    }

    const analysis = parseAnalysisPayload(content);
    const usage = payload.usage
      ? {
          promptTokens: payload.usage.prompt_tokens,
          completionTokens: payload.usage.completion_tokens,
          totalTokens: payload.usage.total_tokens,
        }
      : undefined;

    const result = await buildResultFromAnalysis(prepared, analysis, options, config, {
      called: true,
      attempted: true,
      cacheHit: false,
      imageHash,
      reason,
      durationMs,
      inputImageWidth: inputMeta.width,
      inputImageHeight: inputMeta.height,
      inputImageBytes: imageBuffer.length,
      compressedBytes: prepared.buffer.length,
      sentImageWidth: prepared.width,
      sentImageHeight: prepared.height,
      usage,
      resizeMs,
    });

    if (result.metadata) {
      openAICache.set(cacheKey, {
        metadata: result.metadata,
        analysis,
      });
    }

    return result;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === 'AbortError'
          ? 'OpenAI request timeout'
          : error.message
        : 'OpenAI request failed';
    const durationMs = Date.now() - startedAt;
    const metadata = buildOpenAIMetadata({
      called: true,
      success: false,
      cacheHit: false,
      config,
      imageHash: computeOpenAIImageHash(imageBuffer),
      reason: invocationReason,
      durationMs,
      inputImageWidth: inputMeta.width,
      inputImageHeight: inputMeta.height,
      inputImageBytes: imageBuffer.length,
      compressedBytes: imageBuffer.length,
      error: message,
      resizeMs,
    });
    metadata.timeout = error instanceof Error && error.name === 'AbortError';
    return {
      success: false,
      processingOrigin: 'openai',
      model: config.model,
      durationMs,
      error: message,
      metadata,
    };
  }
}
