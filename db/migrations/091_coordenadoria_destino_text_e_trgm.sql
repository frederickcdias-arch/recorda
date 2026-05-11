-- Migration: 091_coordenadoria_destino_text_e_trgm
-- Description:
--   1. Converte devolucoes_operacionais.coordenadoria_destino_id de UUID FK
--      para campo de texto livre, sincronizando com as coordenadorias do
--      fluxo operacional e legado.
--   2. Habilita pg_trgm e cria índices GIN para performance de ILIKE
--      no endpoint GET /operacional/recebimento-processos/busca.

-- ============================================================
-- Parte 1: Converter coordenadoria_destino_id para texto livre
-- ============================================================

-- Remover FK constraint
ALTER TABLE devolucoes_operacionais
  DROP CONSTRAINT IF EXISTS fk_devol_coordenadoria;

-- Remover índice do UUID (será recriado para text)
DROP INDEX IF EXISTS idx_devol_op_coordenadoria;

-- Renomear coluna
ALTER TABLE devolucoes_operacionais
  RENAME COLUMN coordenadoria_destino_id TO coordenadoria_destino;

-- Alterar tipo para texto (USING cast de UUID → text preserva registros existentes)
ALTER TABLE devolucoes_operacionais
  ALTER COLUMN coordenadoria_destino TYPE VARCHAR(255)
  USING coordenadoria_destino::text;

-- Recriar índice btree para a coluna texto
CREATE INDEX IF NOT EXISTS idx_devol_op_coordenadoria
  ON devolucoes_operacionais (coordenadoria_destino);

-- ============================================================
-- Parte 2: pg_trgm + índices GIN para busca com ILIKE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_receb_proc_protocolo_trgm
  ON recebimento_processos USING GIN (protocolo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_receb_proc_interessado_trgm
  ON recebimento_processos USING GIN (interessado gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_repositorios_ged_trgm
  ON repositorios USING GIN (id_repositorio_ged gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_repositorios_orgao_trgm
  ON repositorios USING GIN (orgao gin_trgm_ops);

INSERT INTO schema_migrations (version)
SELECT '091_coordenadoria_destino_text_e_trgm'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations
  WHERE version = '091_coordenadoria_destino_text_e_trgm'
);
