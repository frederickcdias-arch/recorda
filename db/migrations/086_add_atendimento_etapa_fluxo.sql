-- Migration: 086_add_atendimento_etapa_fluxo
-- Descrição: Adicionar ATENDIMENTO ao enum etapa_fluxo
-- Data: 2026-05-08

ALTER TYPE etapa_fluxo ADD VALUE IF NOT EXISTS 'ATENDIMENTO' AFTER 'MONTAGEM';

INSERT INTO schema_migrations (version)
SELECT '086_add_atendimento_etapa_fluxo'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '086_add_atendimento_etapa_fluxo'
);
