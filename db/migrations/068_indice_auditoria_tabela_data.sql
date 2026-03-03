-- Migration 068: Composite index on auditoria(tabela, data_operacao DESC)
-- Rationale: Queries filtering by both tabela and date range (e.g. "all repositorios
-- changes in the last 30 days") cannot use the existing single-column indexes efficiently.
-- A composite index covers both filter dimensions in one scan.

CREATE INDEX IF NOT EXISTS idx_auditoria_tabela_data
  ON auditoria (tabela, data_operacao DESC);

INSERT INTO schema_migrations (version) VALUES ('068_indice_auditoria_tabela_data')
  ON CONFLICT (version) DO NOTHING;
