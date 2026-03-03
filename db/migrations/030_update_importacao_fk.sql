-- Migration: 030_update_importacao_fk
-- Description: ajusta a FK de registros_producao.importacao_id para deletar em cascata

ALTER TABLE registros_producao
  DROP CONSTRAINT IF EXISTS registros_producao_importacao_id_fkey;

ALTER TABLE registros_producao
  ADD CONSTRAINT registros_producao_importacao_id_fkey
  FOREIGN KEY (importacao_id)
  REFERENCES importacoes(id)
  ON DELETE CASCADE;

INSERT INTO schema_migrations (version)
SELECT '030_update_importacao_fk'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '030_update_importacao_fk'
);
