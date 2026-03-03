-- Migration 060: Remove historico_de_etapas JSONB from repositorios
-- Rationale: historico_etapas table already stores the same data as a proper
-- relational table. The JSONB column is redundant, grows unboundedly on each row,
-- and is never queried by the backend. Removing it reduces row size and eliminates
-- the dual-write in fn_validar_avanco_etapa_repositorio.

-- 1. Drop the JSONB column
ALTER TABLE repositorios DROP COLUMN IF EXISTS historico_de_etapas;

-- 2. Replace the trigger function — remove the JSONB append block, keep all validations
CREATE OR REPLACE FUNCTION fn_validar_avanco_etapa_repositorio()
RETURNS TRIGGER AS $$
DECLARE
  checklist_concluido BOOLEAN;
  ultima_movimentacao tipo_movimentacao_armario;
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

    SELECT m.tipo_movimentacao
    INTO ultima_movimentacao
    FROM movimentacoes_armario m
    WHERE m.repositorio_id = OLD.id_repositorio_recorda
      AND m.etapa = OLD.etapa_atual
    ORDER BY m.data_movimentacao DESC
    LIMIT 1;

    IF ultima_movimentacao IS DISTINCT FROM 'DEVOLUCAO' THEN
      RAISE EXCEPTION 'Não é permitido avançar etapa sem devolução do repositório ao armário';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO schema_migrations (version) VALUES ('060_remove_historico_de_etapas_jsonb')
  ON CONFLICT (version) DO NOTHING;
