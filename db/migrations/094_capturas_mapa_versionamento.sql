-- Migration 094: versionamento e metadata de processamento para capturas_mapa
-- Mantem compatibilidade com registros antigos preservando arquivo_path.

ALTER TABLE capturas_mapa
  ADD COLUMN IF NOT EXISTS arquivo_original_path TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_corrigido_path TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_path TEXT,
  ADD COLUMN IF NOT EXISTS processamento_status TEXT NOT NULL DEFAULT 'concluido',
  ADD COLUMN IF NOT EXISTS processamento_engine TEXT,
  ADD COLUMN IF NOT EXISTS processamento_confianca NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS processamento_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS processamento_metadata JSONB,
  ADD COLUMN IF NOT EXISTS processado_em TIMESTAMPTZ;

UPDATE capturas_mapa
SET
  arquivo_corrigido_path = COALESCE(arquivo_corrigido_path, arquivo_path),
  processamento_status = COALESCE(NULLIF(TRIM(processamento_status), ''), 'concluido'),
  processamento_fallback = COALESCE(processamento_fallback, FALSE)
WHERE arquivo_corrigido_path IS NULL
   OR processamento_status IS NULL
   OR processamento_fallback IS NULL;

CREATE INDEX IF NOT EXISTS idx_capturas_mapa_status ON capturas_mapa(processamento_status);

INSERT INTO schema_migrations (version)
SELECT '094_capturas_mapa_versionamento'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '094_capturas_mapa_versionamento'
);
