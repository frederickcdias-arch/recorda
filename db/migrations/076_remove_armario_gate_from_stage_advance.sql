-- Migration: 076_remove_armario_gate_from_stage_advance
-- Description: Remove a validação de devolução ao armário da trigger de avanço
--              de etapa, pois o fluxo de armário não é mais obrigatório.

CREATE OR REPLACE FUNCTION fn_validar_avanco_etapa_repositorio()
RETURNS TRIGGER AS $$
DECLARE
  checklist_concluido BOOLEAN;
BEGIN
  IF NEW.etapa_atual <> OLD.etapa_atual THEN
    SELECT EXISTS (
      SELECT 1
      FROM checklists
      WHERE repositorio_id = OLD.id_repositorio_recorda
        AND etapa = OLD.etapa_atual
        AND status = 'CONCLUIDO'
    ) INTO checklist_concluido;

    IF NOT checklist_concluido THEN
      RAISE EXCEPTION 'Nao e permitido avancar etapa sem checklist concluido da etapa %', OLD.etapa_atual;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO schema_migrations (version)
SELECT '076_remove_armario_gate_from_stage_advance'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '076_remove_armario_gate_from_stage_advance'
);
