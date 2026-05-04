-- Migration: 084_add_reconferencia_etapa_fluxo
-- Descrição: Adicionar RECONFERENCIA ao enum etapa_fluxo
-- Data: 2026-06-30

ALTER TYPE etapa_fluxo ADD VALUE IF NOT EXISTS 'RECONFERENCIA' AFTER 'CONFERENCIA';

INSERT INTO schema_migrations (version)
SELECT '084_add_reconferencia_etapa_fluxo'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '084_add_reconferencia_etapa_fluxo'
);
