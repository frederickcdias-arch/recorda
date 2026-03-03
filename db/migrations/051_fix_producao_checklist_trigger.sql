-- Fix: trigger was checking for ABERTO/ativo=true but production should
-- require a CONCLUIDO checklist (ativo=false per DB constraint).
-- The old logic was contradictory and always blocked production registration.

CREATE OR REPLACE FUNCTION public.fn_validar_producao_com_checklist_ativo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  checklist_valido INTEGER;
BEGIN
  SELECT COUNT(*) INTO checklist_valido
  FROM checklists
  WHERE id = NEW.checklist_id
    AND repositorio_id = NEW.repositorio_id
    AND etapa = NEW.etapa
    AND status = 'CONCLUIDO';

  IF checklist_valido = 0 THEN
    RAISE EXCEPTION 'Produção exige checklist concluído da mesma etapa e repositório';
  END IF;

  RETURN NEW;
END;
$$;
