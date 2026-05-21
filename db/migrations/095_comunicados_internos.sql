-- Migration: 095_comunicados_internos
-- Descricao: Cria estrutura base do modulo de comunicados internos
-- Data: 2026-05-20

DO $$
BEGIN
  CREATE TYPE comunicado_prioridade AS ENUM ('BAIXA', 'MEDIA', 'ALTA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE comunicado_escopo_destino AS ENUM ('TODOS', 'USUARIOS_ESPECIFICOS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE comunicado_status AS ENUM ('RASCUNHO', 'PUBLICADO', 'ENCERRADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE comunicados (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo VARCHAR(200) NOT NULL,
  conteudo TEXT NOT NULL,
  prioridade comunicado_prioridade NOT NULL DEFAULT 'MEDIA',
  escopo_destino comunicado_escopo_destino NOT NULL,
  status comunicado_status NOT NULL DEFAULT 'RASCUNHO',
  criado_por_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  publicado_em TIMESTAMPTZ,
  encerrado_em TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT comunicados_titulo_not_empty CHECK (LENGTH(TRIM(titulo)) >= 3),
  CONSTRAINT comunicados_conteudo_not_empty CHECK (LENGTH(TRIM(conteudo)) >= 1),
  CONSTRAINT comunicados_publicacao_coerente CHECK (
    (status = 'RASCUNHO' AND publicado_em IS NULL AND encerrado_em IS NULL)
    OR (status = 'PUBLICADO' AND publicado_em IS NOT NULL AND encerrado_em IS NULL)
    OR (status = 'ENCERRADO' AND publicado_em IS NOT NULL AND encerrado_em IS NOT NULL AND encerrado_em >= publicado_em)
  )
);

CREATE TABLE comunicado_destinatarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comunicado_id UUID NOT NULL REFERENCES comunicados(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  lido_em TIMESTAMPTZ,
  entregue_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT comunicado_destinatarios_lido_apos_entrega CHECK (
    lido_em IS NULL OR lido_em >= entregue_em
  ),
  CONSTRAINT uq_comunicado_destinatario UNIQUE (comunicado_id, usuario_id)
);

CREATE INDEX idx_comunicados_status_publicado_em
  ON comunicados (status, publicado_em DESC);

CREATE INDEX idx_comunicados_criado_por_usuario
  ON comunicados (criado_por_usuario_id, criado_em DESC);

CREATE INDEX idx_comunicado_destinatarios_usuario_lido
  ON comunicado_destinatarios (usuario_id, lido_em, criado_em DESC);

CREATE INDEX idx_comunicado_destinatarios_nao_lidos
  ON comunicado_destinatarios (usuario_id, comunicado_id)
  WHERE lido_em IS NULL;

CREATE INDEX idx_comunicado_destinatarios_comunicado
  ON comunicado_destinatarios (comunicado_id);

CREATE TRIGGER update_comunicados_timestamp
  BEFORE UPDATE ON comunicados
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER audit_comunicados
  AFTER INSERT OR UPDATE OR DELETE ON comunicados
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_comunicado_destinatarios
  AFTER INSERT OR UPDATE OR DELETE ON comunicado_destinatarios
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

COMMENT ON TABLE comunicados IS 'Comunicados internos criados por administradores';
COMMENT ON TABLE comunicado_destinatarios IS 'Destinatarios e status de leitura dos comunicados';

INSERT INTO schema_migrations (version) VALUES ('095_comunicados_internos')
  ON CONFLICT (version) DO NOTHING;
