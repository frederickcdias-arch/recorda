export const OPENAI_PROMPT_VERSION = 'captura-mapa-v4';

export interface OpenAIImageConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxWidth: number;
  jpegQuality: number;
  autoCropEnabled: boolean;
  minCornerConfidence: number;
  minDocumentAreaRatio: number;
}

export function getOpenAIConfigFingerprint(
  config: OpenAIImageConfig = getOpenAIImageConfig()
): string {
  return `${config.model}|${config.maxWidth}|${config.jpegQuality}|${config.autoCropEnabled}|${config.minCornerConfidence}|${config.minDocumentAreaRatio}|${OPENAI_PROMPT_VERSION}`;
}

export function getOpenAIImageConfig(): OpenAIImageConfig {
  return {
    enabled: process.env.OPENAI_IMAGE_ENABLED === 'true',
    apiKey: process.env.OPENAI_API_KEY?.trim() ?? '',
    model: process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-4.1-mini',
    timeoutMs: parseInt(process.env.OPENAI_IMAGE_TIMEOUT_MS ?? '10000', 10),
    maxWidth: parseInt(process.env.OPENAI_IMAGE_MAX_WIDTH ?? '2000', 10),
    jpegQuality: parseInt(process.env.OPENAI_IMAGE_JPEG_QUALITY ?? '90', 10),
    autoCropEnabled: process.env.OPENAI_IMAGE_AUTO_CROP_ENABLED === 'true',
    minCornerConfidence: parseFloat(process.env.OPENAI_IMAGE_MIN_CORNER_CONFIDENCE ?? '0.75'),
    minDocumentAreaRatio: parseFloat(process.env.OPENAI_IMAGE_MIN_DOCUMENT_AREA_RATIO ?? '0.28'),
  };
}

export type OpenAISkipReason = 'disabled' | 'missing_api_key' | 'auto_crop_disabled';

export function resolveOpenAISkipReason(
  config: OpenAIImageConfig = getOpenAIImageConfig()
): OpenAISkipReason | undefined {
  if (!config.enabled) return 'disabled';
  if (!config.apiKey) return 'missing_api_key';
  return undefined;
}

export function resolveOpenAIAutoCropSkipReason(
  config: OpenAIImageConfig = getOpenAIImageConfig()
): OpenAISkipReason | undefined {
  const base = resolveOpenAISkipReason(config);
  if (base) return base;
  if (!config.autoCropEnabled) return 'auto_crop_disabled';
  return undefined;
}

export function isOpenAIImageAvailable(
  config: OpenAIImageConfig = getOpenAIImageConfig()
): boolean {
  return config.enabled && config.apiKey.length > 0;
}

export function isOpenAIAutoCropAvailable(
  config: OpenAIImageConfig = getOpenAIImageConfig()
): boolean {
  return isOpenAIImageAvailable(config) && config.autoCropEnabled;
}
