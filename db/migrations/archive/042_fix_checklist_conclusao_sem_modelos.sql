-- Migration: 042_fix_checklist_conclusao_sem_modelos
-- Descrição: Permitir conclusão de checklist quando não há modelos obrigatórios para a etapa
-- Data: 2026-02-11

-- Atualizar trigger: se não existem modelos obrigatórios para a etapa, permitir conclusão
CREATE OR REPLACE FUNCTION fn_validar_conclusao_checklist()
RETURNS TRIGGER AS $$
DECLARE
  total_obrigatorios INTEGER;
  total_preenchidos INTEGER;
BEGIN
  IF OLD.status = 'CONCLUIDO' AND NEW.status = 'ABERTO' THEN
    RAISE EXCEPTION 'Checklist concluído não pode ser reaberto';
  END IF;

  IF NEW.status = 'CONCLUIDO' AND OLD.status <> NEW.status THEN
    SELECT COUNT(*) INTO total_obrigatorios
    FROM checklist_modelos
    WHERE etapa = NEW.etapa
      AND obrigatorio = TRUE
      AND ativo = TRUE;

    -- Se não há modelos obrigatórios para a etapa, permitir conclusão
    IF total_obrigatorios > 0 THEN
      SELECT COUNT(*) INTO total_preenchidos
      FROM checklist_itens i
      JOIN checklist_modelos m ON m.id = i.modelo_id
      WHERE i.checklist_id = NEW.id
        AND m.etapa = NEW.etapa
        AND m.obrigatorio = TRUE
        AND m.ativo = TRUE;

      IF total_preenchidos < total_obrigatorios THEN
        RAISE EXCEPTION 'Checklist incompleto: % de % itens obrigatórios preenchidos', total_preenchidos, total_obrigatorios;
      END IF;
    END IF;

    NEW.data_conclusao := COALESCE(NEW.data_conclusao, CURRENT_TIMESTAMP);
    NEW.ativo := FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Adicionar modelos para ENTREGA (que estava faltando)
INSERT INTO checklist_modelos (etapa, codigo, descricao, obrigatorio, ordem, ativo)
VALUES
  ('ENTREGA', 'CONFERENCIA_FINAL', 'Conferência final de integridade do repositório', TRUE, 1, TRUE),
  ('ENTREGA', 'REGISTRO_DEVOLUCAO', 'Registro de devolução ao órgão de origem', TRUE, 2, TRUE)
ON CONFLICT (etapa, codigo) DO NOTHING;

INSERT INTO schema_migrations (version)
SELECT '042_fix_checklist_conclusao_sem_modelos'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '042_fix_checklist_conclusao_sem_modelos'
);
