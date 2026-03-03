-- Migration 040: Add Seadesk confirmation columns to repositorios
-- These columns track when and by whom the Seadesk upload was confirmed
-- during the Digitalização stage.

ALTER TABLE repositorios
  ADD COLUMN IF NOT EXISTS seadesk_confirmado_em TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS seadesk_confirmado_por UUID DEFAULT NULL REFERENCES usuarios(id);

CREATE INDEX IF NOT EXISTS idx_repositorios_seadesk_confirmado
  ON repositorios (seadesk_confirmado_em)
  WHERE seadesk_confirmado_em IS NOT NULL;
