-- Migration: 025_add_interessado_processos_principais
-- Descrição: Adicionar campo `interessado` à tabela `processos_principais` para pesquisa e exibição

ALTER TABLE processos_principais
  ADD COLUMN IF NOT EXISTS interessado VARCHAR(500);

-- Índice auxiliar para buscas simples (lower) — melhora buscas case-insensitive
CREATE INDEX IF NOT EXISTS idx_processos_interessado_lower ON processos_principais (lower(interessado));

-- Registrar migration
INSERT INTO schema_migrations (version) VALUES ('025_add_interessado_processos_principais');
