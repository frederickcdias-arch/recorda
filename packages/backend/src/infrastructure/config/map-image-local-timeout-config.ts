export interface MapImageLocalTimeoutConfig {
  localProcessorTimeoutMs: number;
  totalProcessingTimeoutMs: number;
}

export function getMapImageLocalTimeoutConfig(): MapImageLocalTimeoutConfig {
  return {
    localProcessorTimeoutMs: parseInt(
      process.env.MAP_IMAGE_LOCAL_PROCESSOR_TIMEOUT_MS ?? '15000',
      10
    ),
    totalProcessingTimeoutMs: parseInt(
      process.env.MAP_IMAGE_TOTAL_PROCESSING_TIMEOUT_MS ?? '25000',
      10
    ),
  };
}
