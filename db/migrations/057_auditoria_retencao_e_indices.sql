-- Migration 057: Auditoria - índice para retenção + índice de dedup para producao_repositorio
-- P0-6: Índice em auditoria.criado_em para queries de limpeza/retenção
-- P1-1: Índice composto para dedup de importação em producao_repositorio

-- Índice para política de retenção da auditoria (permite DELETE WHERE data_operacao < ...)
CREATE INDEX IF NOT EXISTS idx_auditoria_data_operacao ON auditoria (data_operacao);

-- Índice composto para dedup de importação legada (evita full scan a cada linha)
CREATE INDEX IF NOT EXISTS idx_producao_dedup
  ON producao_repositorio (usuario_id, repositorio_id, data_producao, etapa, quantidade);
