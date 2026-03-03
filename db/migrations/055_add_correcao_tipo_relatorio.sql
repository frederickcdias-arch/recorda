-- Add CORRECAO and DEVOLUCAO to tipo_relatorio_operacional enum
-- and update the constraint to allow them with repositorio_id

ALTER TYPE tipo_relatorio_operacional ADD VALUE IF NOT EXISTS 'CORRECAO';
ALTER TYPE tipo_relatorio_operacional ADD VALUE IF NOT EXISTS 'DEVOLUCAO';

-- Update constraint to allow CORRECAO and DEVOLUCAO with repositorio_id,
-- and ENTREGA with either lote_id OR repositorio_id (for per-repo devolução terms)
ALTER TABLE relatorios_operacionais DROP CONSTRAINT IF EXISTS relatorio_alvo_consistencia;
ALTER TABLE relatorios_operacionais ADD CONSTRAINT relatorio_alvo_consistencia CHECK (
  (lote_id IS NOT NULL) OR (repositorio_id IS NOT NULL)
);
