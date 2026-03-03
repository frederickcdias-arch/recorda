-- Migration 065: Composite index for fn_validar_avanco_etapa_repositorio trigger
-- Rationale: The trigger queries movimentacoes_armario with:
--   WHERE repositorio_id = ? AND etapa = ? ORDER BY data_movimentacao DESC LIMIT 1
-- The existing idx_movimentacoes_repositorio_data covers (repositorio_id, data_movimentacao DESC)
-- but requires an extra filter step for etapa. The new composite index eliminates it.

CREATE INDEX IF NOT EXISTS idx_movimentacoes_repo_etapa_data
  ON movimentacoes_armario (repositorio_id, etapa, data_movimentacao DESC);

INSERT INTO schema_migrations (version) VALUES ('065_indice_movimentacoes_etapa')
  ON CONFLICT (version) DO NOTHING;
