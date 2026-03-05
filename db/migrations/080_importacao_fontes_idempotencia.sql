-- Migration: 080_importacao_fontes_idempotencia
-- Description: Controle de idempotencia por linha para importacao de fontes salvas.

CREATE TABLE IF NOT EXISTS importacao_fontes_linhas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fonte_id UUID NOT NULL,
  chave_hash CHAR(64) NOT NULL,
  linha INTEGER NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_importacao_fontes_linhas_fonte
    FOREIGN KEY (fonte_id)
    REFERENCES fontes_importacao(id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_importacao_fontes_linhas_unique
  ON importacao_fontes_linhas (fonte_id, chave_hash);

CREATE INDEX IF NOT EXISTS idx_importacao_fontes_linhas_fonte
  ON importacao_fontes_linhas (fonte_id, criado_em DESC);

DROP TRIGGER IF EXISTS audit_importacao_fontes_linhas ON importacao_fontes_linhas;
CREATE TRIGGER audit_importacao_fontes_linhas
  AFTER INSERT OR UPDATE OR DELETE ON importacao_fontes_linhas
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

INSERT INTO schema_migrations (version)
SELECT '080_importacao_fontes_idempotencia'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '080_importacao_fontes_idempotencia'
);
