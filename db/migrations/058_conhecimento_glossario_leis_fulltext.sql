-- Migration 058: Base de Conhecimento — Glossário dinâmico, Leis/Normas dinâmicas, Full-text search

-- Glossário dinâmico (substitui array estático no frontend)
CREATE TABLE IF NOT EXISTS kb_glossario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  termo VARCHAR(200) NOT NULL,
  definicao TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ordem INT NOT NULL DEFAULT 0,
  criado_por UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_glossario_termo_unique ON kb_glossario (LOWER(termo));
CREATE INDEX IF NOT EXISTS idx_kb_glossario_ativo ON kb_glossario (ativo, ordem, termo);

-- Leis e Normas dinâmicas (substitui array estático no frontend)
CREATE TABLE IF NOT EXISTS kb_leis_normas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(300) NOT NULL,
  descricao TEXT NOT NULL,
  referencia VARCHAR(200) NOT NULL DEFAULT '',
  url VARCHAR(500),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ordem INT NOT NULL DEFAULT 0,
  criado_por UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_leis_nome_unique ON kb_leis_normas (LOWER(nome));
CREATE INDEX IF NOT EXISTS idx_kb_leis_ativo ON kb_leis_normas (ativo, ordem, nome);

-- Full-text search: índice GIN no conteúdo das versões de documentos
-- Usa configuração 'portuguese' para stemming em português
CREATE INDEX IF NOT EXISTS idx_kb_versoes_conteudo_fts
  ON kb_documento_versoes
  USING GIN (to_tsvector('portuguese', conteudo));

-- Full-text search: índice GIN no título + descrição dos documentos
CREATE INDEX IF NOT EXISTS idx_kb_documentos_fts
  ON kb_documentos
  USING GIN (to_tsvector('portuguese', COALESCE(titulo, '') || ' ' || COALESCE(descricao, '') || ' ' || COALESCE(codigo, '')));

-- Triggers de atualizado_em
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_kb_glossario_timestamp ON kb_glossario;
CREATE TRIGGER update_kb_glossario_timestamp
  BEFORE UPDATE ON kb_glossario
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

DROP TRIGGER IF EXISTS update_kb_leis_normas_timestamp ON kb_leis_normas;
CREATE TRIGGER update_kb_leis_normas_timestamp
  BEFORE UPDATE ON kb_leis_normas
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- Auditoria
DROP TRIGGER IF EXISTS audit_kb_glossario ON kb_glossario;
CREATE TRIGGER audit_kb_glossario
  AFTER INSERT OR UPDATE OR DELETE ON kb_glossario
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_kb_leis_normas ON kb_leis_normas;
CREATE TRIGGER audit_kb_leis_normas
  AFTER INSERT OR UPDATE OR DELETE ON kb_leis_normas
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
