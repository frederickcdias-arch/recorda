export interface MapImageFaithfulScanConfig {
  /** Modo padrão para mapas/plantas: scan fiel determinístico (sem IA generativa). */
  enabled: boolean;
  /** Bloqueia substituição da imagem final por melhorias pós-IA (guided/local). */
  blockGenerativeReplacement: boolean;
  maxDimension: number;
  documentRatio: 'A1_PORTRAIT' | 'A1_LANDSCAPE' | 'AUTO';
}

export function getMapImageFaithfulScanConfig(): MapImageFaithfulScanConfig {
  const enabled = process.env.MAP_IMAGE_FAITHFUL_SCAN_ENABLED !== 'false';
  return {
    enabled,
    blockGenerativeReplacement: process.env.MAP_IMAGE_BLOCK_GENERATIVE_REPLACEMENT !== 'false',
    maxDimension: parseInt(process.env.MAP_IMAGE_FAITHFUL_MAX_DIMENSION ?? '2000', 10),
    documentRatio:
      (process.env.MAP_IMAGE_FAITHFUL_DOCUMENT_RATIO?.trim() as MapImageFaithfulScanConfig['documentRatio']) ||
      'A1_PORTRAIT',
  };
}

export function isFaithfulScanMode(): boolean {
  return getMapImageFaithfulScanConfig().enabled;
}
