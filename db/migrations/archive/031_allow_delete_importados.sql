-- Migration: 031_allow_delete_importados
-- Description: Permite excluir registros_producao somente quando possuem importacao_id

-- Remover a regra antiga que bloqueava qualquer DELETE
DROP RULE IF EXISTS prevent_delete_registros_producao ON registros_producao;

-- Função que impede deletar registros sem importacao_id (mantém imutabilidade para os demais)
CREATE OR REPLACE FUNCTION check_delete_registros_producao()
RETURNS trigger AS $$
BEGIN
  IF OLD.importacao_id IS NULL THEN
    RAISE EXCEPTION 'Registro de produção é imutável; utilize cancelamento ao invés de excluir';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger que aplica a regra antes de cada DELETE
CREATE TRIGGER prevent_delete_registros_producao
  BEFORE DELETE ON registros_producao
  FOR EACH ROW
  EXECUTE FUNCTION check_delete_registros_producao();

INSERT INTO schema_migrations (version)
SELECT '031_allow_delete_importados'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '031_allow_delete_importados'
);
