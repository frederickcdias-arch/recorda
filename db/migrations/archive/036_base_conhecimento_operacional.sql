-- Migration: 036_base_conhecimento_operacional
-- Description: Base de conhecimento operacional com versionamento, acesso e vinculo por etapa.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kb_categoria') THEN
    CREATE TYPE kb_categoria AS ENUM (
      'MANUAIS',
      'PROCEDIMENTOS_ETAPA',
      'CHECKLISTS_EXPLICADOS',
      'GLOSSARIO',
      'NORMAS_LEIS',
      'ATUALIZACOES_PROCESSO'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kb_status_documento') THEN
    CREATE TYPE kb_status_documento AS ENUM ('ATIVO', 'INATIVO');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kb_nivel_acesso') THEN
    CREATE TYPE kb_nivel_acesso AS ENUM ('OPERADOR_ADMIN', 'ADMIN');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS kb_documentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo VARCHAR(100) NOT NULL UNIQUE,
  titulo VARCHAR(255) NOT NULL,
  categoria kb_categoria NOT NULL,
  descricao VARCHAR(1000) NOT NULL DEFAULT '',
  status kb_status_documento NOT NULL DEFAULT 'ATIVO',
  nivel_acesso kb_nivel_acesso NOT NULL DEFAULT 'OPERADOR_ADMIN',
  versao_atual_id UUID,
  criado_por UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT kb_documentos_codigo_not_empty CHECK (LENGTH(TRIM(codigo)) > 0),
  CONSTRAINT kb_documentos_titulo_not_empty CHECK (LENGTH(TRIM(titulo)) > 0),
  CONSTRAINT fk_kb_documentos_criado_por
    FOREIGN KEY (criado_por)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_kb_documentos_categoria ON kb_documentos (categoria);
CREATE INDEX IF NOT EXISTS idx_kb_documentos_status ON kb_documentos (status);
CREATE INDEX IF NOT EXISTS idx_kb_documentos_acesso ON kb_documentos (nivel_acesso);

CREATE TABLE IF NOT EXISTS kb_documento_versoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  documento_id UUID NOT NULL,
  versao INTEGER NOT NULL,
  conteudo TEXT NOT NULL,
  resumo_alteracao VARCHAR(500) NOT NULL DEFAULT '',
  publicado_por UUID NOT NULL,
  publicado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_kb_versoes_documento
    FOREIGN KEY (documento_id)
    REFERENCES kb_documentos(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_kb_versoes_publicado_por
    FOREIGN KEY (publicado_por)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT uk_kb_documento_versao UNIQUE (documento_id, versao),
  CONSTRAINT kb_versao_positive CHECK (versao > 0),
  CONSTRAINT kb_conteudo_not_empty CHECK (LENGTH(TRIM(conteudo)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_kb_versoes_documento_data ON kb_documento_versoes (documento_id, publicado_em DESC);

CREATE TABLE IF NOT EXISTS kb_documento_etapas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  documento_id UUID NOT NULL,
  etapa etapa_fluxo NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_kb_documento_etapas_documento
    FOREIGN KEY (documento_id)
    REFERENCES kb_documentos(id)
    ON DELETE CASCADE,
  CONSTRAINT uk_kb_documento_etapa UNIQUE (documento_id, etapa)
);

CREATE INDEX IF NOT EXISTS idx_kb_documento_etapas_etapa ON kb_documento_etapas (etapa);

ALTER TABLE kb_documentos
  DROP CONSTRAINT IF EXISTS fk_kb_documentos_versao_atual;

ALTER TABLE kb_documentos
  ADD CONSTRAINT fk_kb_documentos_versao_atual
  FOREIGN KEY (versao_atual_id)
  REFERENCES kb_documento_versoes(id)
  ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.atualizado_em = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_kb_documentos_timestamp ON kb_documentos;
CREATE TRIGGER update_kb_documentos_timestamp
  BEFORE UPDATE ON kb_documentos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS audit_kb_documentos ON kb_documentos;
CREATE TRIGGER audit_kb_documentos
  AFTER INSERT OR UPDATE OR DELETE ON kb_documentos
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_kb_documento_versoes ON kb_documento_versoes;
CREATE TRIGGER audit_kb_documento_versoes
  AFTER INSERT OR UPDATE OR DELETE ON kb_documento_versoes
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_kb_documento_etapas ON kb_documento_etapas;
CREATE TRIGGER audit_kb_documento_etapas
  AFTER INSERT OR UPDATE OR DELETE ON kb_documento_etapas
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();
