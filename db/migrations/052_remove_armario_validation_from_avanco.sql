-- Remove armário movement validation from stage advancement trigger.
-- The armário feature is no longer active, so requiring DEVOLUCAO blocks all advances.

CREATE OR REPLACE FUNCTION public.fn_validar_avanco_etapa_repositorio() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
      RAISE EXCEPTION 'Não é permitido avançar etapa sem checklist concluído da etapa %', OLD.etapa_atual;
    END IF;

    NEW.historico_de_etapas :=
      COALESCE(OLD.historico_de_etapas, '[]'::jsonb) ||
      jsonb_build_array(
        jsonb_build_object(
          'etapa_origem', OLD.etapa_atual,
          'etapa_destino', NEW.etapa_atual,
          'status_origem', OLD.status_atual,
          'status_destino', NEW.status_atual,
          'data_evento', CURRENT_TIMESTAMP
        )
      );
  END IF;

  RETURN NEW;
END;
$$;
