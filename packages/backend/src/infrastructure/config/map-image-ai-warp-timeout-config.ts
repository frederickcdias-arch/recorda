export interface MapImageAiWarpTimeoutConfig {
  aiWarpTimeoutMs: number;
}

export function getMapImageAiWarpTimeoutConfig(): MapImageAiWarpTimeoutConfig {
  return {
    aiWarpTimeoutMs: parseInt(process.env.MAP_IMAGE_AI_WARP_TIMEOUT_MS ?? '8000', 10),
  };
}
