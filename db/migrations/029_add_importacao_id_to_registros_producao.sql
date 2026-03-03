-- Migration: 029_add_importacao_id_to_registros_producao
-- Description: adiciona coluna importacao_id vinculando registros_producao às importacoes

ALTER TABLE registros_producao
  ADD COLUMN IF NOT EXISTS importacao_id UUID REFERENCES importacoes(id);

CREATE INDEX IF NOT EXISTS idx_registros_importacao
  ON registros_producao (importacao_id);

INSERT INTO schema_migrations (version)
SELECT '029_add_importacao_id_to_registros_producao'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '029_add_importacao_id_to_registros_producao'
);
