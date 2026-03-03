-- Migration: 038_importacoes_legado_operacional
-- Description: Log de importacoes legadas do fluxo operacional com vinculo de usuario.

CREATE TABLE IF NOT EXISTS importacoes_legado_operacional (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo VARCHAR(40) NOT NULL DEFAULT 'RECEBIMENTO',
  total_registros INTEGER NOT NULL DEFAULT 0,
  registros_sucesso INTEGER NOT NULL DEFAULT 0,
  registros_erro INTEGER NOT NULL DEFAULT 0,
  detalhes_erros JSONB NOT NULL DEFAULT '[]'::jsonb,
  usuario_destino_id UUID NOT NULL,
  executado_por UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT import_legado_total_non_negative CHECK (total_registros >= 0),
  CONSTRAINT import_legado_sucesso_non_negative CHECK (registros_sucesso >= 0),
  CONSTRAINT import_legado_erro_non_negative CHECK (registros_erro >= 0),
  CONSTRAINT import_legado_consistencia CHECK (registros_sucesso + registros_erro <= total_registros),
  CONSTRAINT fk_import_legado_usuario_destino
    FOREIGN KEY (usuario_destino_id)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_import_legado_executado_por
    FOREIGN KEY (executado_por)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_import_legado_criado_em
  ON importacoes_legado_operacional (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_import_legado_usuario_destino
  ON importacoes_legado_operacional (usuario_destino_id);

DROP TRIGGER IF EXISTS audit_importacoes_legado_operacional ON importacoes_legado_operacional;
CREATE TRIGGER audit_importacoes_legado_operacional
  AFTER INSERT OR UPDATE OR DELETE ON importacoes_legado_operacional
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();
