-- Migration: 100_justificativas_coletivas
-- Registra justificativas coletivas administrativas para destaque em relatórios de ausências

CREATE TABLE IF NOT EXISTS justificativas_coletivas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  descricao TEXT NOT NULL,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_justificativa_coletiva_data_fim CHECK (data_fim >= data_inicio),
  CONSTRAINT check_justificativa_coletiva_descricao CHECK (length(trim(descricao)) >= 3)
);

CREATE INDEX IF NOT EXISTS idx_justificativas_coletivas_periodo
  ON justificativas_coletivas (data_inicio, data_fim);

DROP TRIGGER IF EXISTS update_justificativas_coletivas_updated_at ON justificativas_coletivas;
CREATE TRIGGER update_justificativas_coletivas_updated_at
  BEFORE UPDATE ON justificativas_coletivas
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

COMMENT ON TABLE justificativas_coletivas IS
  'Justificativas coletivas administrativas exibidas no topo do relatório de ausências';

INSERT INTO schema_migrations (version)
SELECT '100_justificativas_coletivas'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '100_justificativas_coletivas'
);
