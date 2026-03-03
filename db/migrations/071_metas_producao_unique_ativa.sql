-- Migration 071: Partial UNIQUE index on metas_producao(etapa_id) WHERE ativa = TRUE
-- Rationale: Nothing prevents two active metas for the same etapa, which would cause
-- ambiguous results when the backend queries "the active meta for etapa X".
-- A partial unique index enforces at most one active meta per etapa without
-- preventing historical (ativa = FALSE) records for the same etapa.

CREATE UNIQUE INDEX IF NOT EXISTS idx_metas_producao_etapa_ativa_unique
  ON metas_producao (etapa_id)
  WHERE ativa = TRUE;

INSERT INTO schema_migrations (version) VALUES ('071_metas_producao_unique_ativa')
  ON CONFLICT (version) DO NOTHING;
