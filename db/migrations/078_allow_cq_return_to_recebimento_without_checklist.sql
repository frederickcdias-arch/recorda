-- Migration: 078_allow_cq_return_to_recebimento_without_checklist
-- Description: Permite retorno de CONTROLE_QUALIDADE para RECEBIMENTO sem exigir
-- checklist concluido da etapa de CQ.

CREATE OR REPLACE FUNCTION fn_validar_avanco_etapa_repositorio()
RETURNS TRIGGER AS $$
DECLARE
  checklist_concluido BOOLEAN;
BEGIN
  IF NEW.etapa_atual <> OLD.etapa_atual THEN
    -- Excecao operacional: retorno de CQ para recebimento para correcao.
    IF OLD.etapa_atual = 'CONTROLE_QUALIDADE' AND NEW.etapa_atual = 'RECEBIMENTO' THEN
      RETURN NEW;
    END IF;

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
SELECT '078_allow_cq_return_to_recebimento_without_checklist'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '078_allow_cq_return_to_recebimento_without_checklist'
);
