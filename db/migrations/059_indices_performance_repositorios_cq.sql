-- Migration 059: Performance indexes for N+1 query elimination
-- Covers: GET /operacional/repositorios subqueries + GET /operacional/lotes-cq

-- Index for checklists subqueries in repositorios listing
-- Covers: EXISTS(... WHERE repositorio_id = ? AND etapa = ? AND status = ?)
CREATE INDEX IF NOT EXISTS idx_checklists_repo_etapa_status
  ON checklists(repositorio_id, etapa, status);

-- Index for recebimento_processos COUNT subquery
-- Covers: COUNT(*) WHERE repositorio_id = ?
CREATE INDEX IF NOT EXISTS idx_recebimento_processos_repo
  ON recebimento_processos(repositorio_id);

-- Index for producao_repositorio EXISTS subquery
-- Covers: EXISTS(... WHERE repositorio_id = ? AND etapa = ?)
CREATE INDEX IF NOT EXISTS idx_producao_repo_etapa
  ON producao_repositorio(repositorio_id, etapa);

-- Index for relatorios_operacionais COUNT subquery
-- Covers: COUNT(*) WHERE repositorio_id = ?
CREATE INDEX IF NOT EXISTS idx_relatorios_operacionais_repo
  ON relatorios_operacionais(repositorio_id);

-- Index for lotes_controle_qualidade_itens GROUP BY lote_id
-- Covers: LEFT JOIN (SELECT lote_id, COUNT(*) ... GROUP BY lote_id)
CREATE INDEX IF NOT EXISTS idx_lotes_cq_itens_lote_id
  ON lotes_controle_qualidade_itens(lote_id);

INSERT INTO schema_migrations (version) VALUES ('059_indices_performance_repositorios_cq')
  ON CONFLICT (version) DO NOTHING;
