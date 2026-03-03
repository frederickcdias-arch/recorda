-- Migration: 050_recebimento_avulsos_e_batch
-- Description: Permite processos de recebimento avulsos (sem repositório vinculado).
-- O operador cadastra documentos soltos e depois vincula a repositórios.

-- ============================================================
-- 1. Tornar repositorio_id nullable em recebimento_processos
-- ============================================================

-- Remover a constraint NOT NULL do repositorio_id
ALTER TABLE recebimento_processos
  ALTER COLUMN repositorio_id DROP NOT NULL;

-- Índice parcial para processos avulsos (sem repositório)
CREATE INDEX IF NOT EXISTS idx_receb_proc_avulsos
  ON recebimento_processos (criado_em DESC)
  WHERE repositorio_id IS NULL;

-- ============================================================
-- 2. Adicionar coluna de observação para contexto do avulso
-- ============================================================
ALTER TABLE recebimento_processos
  ADD COLUMN IF NOT EXISTS observacao TEXT NOT NULL DEFAULT '';
