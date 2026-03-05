-- Migration: 079_unidades_recebimento
-- Description: Adiciona tabela de unidades (órgãos) para cadastro persistente no recebimento.

CREATE TABLE IF NOT EXISTS unidades_recebimento (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(300) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_unidade_receb_usuario
    FOREIGN KEY (criado_por)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT unidade_receb_nome_not_empty CHECK (LENGTH(TRIM(nome)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unidade_receb_nome_unique
  ON unidades_recebimento (LOWER(TRIM(nome))) WHERE ativo = TRUE;

DROP TRIGGER IF EXISTS audit_unidades_recebimento ON unidades_recebimento;
CREATE TRIGGER audit_unidades_recebimento
  AFTER INSERT OR UPDATE OR DELETE ON unidades_recebimento
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

INSERT INTO schema_migrations (version)
SELECT '079_unidades_recebimento'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '079_unidades_recebimento'
);
