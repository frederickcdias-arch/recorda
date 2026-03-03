-- Migration: 048_recebimento_setor_classificacao
-- Description: Adiciona tabelas de lookup para setores e classificações do recebimento
-- (opções gerenciáveis pelo usuário) e colunas setor/classificacao em recebimento_processos.

-- ============================================================
-- 1. Tabela de setores (quem enviou os documentos)
-- ============================================================
CREATE TABLE IF NOT EXISTS setores_recebimento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(300) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_setor_receb_usuario
    FOREIGN KEY (criado_por)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT setor_receb_nome_not_empty CHECK (LENGTH(TRIM(nome)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_setor_receb_nome_unique
  ON setores_recebimento (LOWER(TRIM(nome))) WHERE ativo = TRUE;

-- ============================================================
-- 2. Tabela de classificações (tipo/assunto do processo)
-- ============================================================
CREATE TABLE IF NOT EXISTS classificacoes_recebimento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(500) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_classif_receb_usuario
    FOREIGN KEY (criado_por)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT classif_receb_nome_not_empty CHECK (LENGTH(TRIM(nome)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_classif_receb_nome_unique
  ON classificacoes_recebimento (LOWER(TRIM(nome))) WHERE ativo = TRUE;

-- ============================================================
-- 3. Adicionar colunas setor e classificacao em recebimento_processos
-- ============================================================
ALTER TABLE recebimento_processos
  ADD COLUMN IF NOT EXISTS setor_id UUID,
  ADD COLUMN IF NOT EXISTS classificacao_id UUID;

ALTER TABLE recebimento_processos
  ADD CONSTRAINT fk_receb_proc_setor
    FOREIGN KEY (setor_id)
    REFERENCES setores_recebimento(id)
    ON DELETE SET NULL;

ALTER TABLE recebimento_processos
  ADD CONSTRAINT fk_receb_proc_classificacao
    FOREIGN KEY (classificacao_id)
    REFERENCES classificacoes_recebimento(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_receb_proc_setor ON recebimento_processos (setor_id);
CREATE INDEX IF NOT EXISTS idx_receb_proc_classificacao ON recebimento_processos (classificacao_id);

-- ============================================================
-- 4. Audit triggers
-- ============================================================
DROP TRIGGER IF EXISTS audit_setores_recebimento ON setores_recebimento;
CREATE TRIGGER audit_setores_recebimento
  AFTER INSERT OR UPDATE OR DELETE ON setores_recebimento
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_classificacoes_recebimento ON classificacoes_recebimento;
CREATE TRIGGER audit_classificacoes_recebimento
  AFTER INSERT OR UPDATE OR DELETE ON classificacoes_recebimento
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();
