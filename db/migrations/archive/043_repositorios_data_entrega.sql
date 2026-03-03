-- Migration: 043_repositorios_data_entrega
-- Descrição: Adicionar coluna data_entrega na tabela repositorios para registrar quando o repositório foi entregue
-- Data: 2026-02-11

ALTER TABLE repositorios ADD COLUMN IF NOT EXISTS data_entrega TIMESTAMP WITH TIME ZONE;

INSERT INTO schema_migrations (version)
SELECT '043_repositorios_data_entrega'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '043_repositorios_data_entrega'
);
