-- Migration: 046_add_digitalizacao_colorida
-- Descrição: Adicionar DIGITALIZACAO_COLORIDA ao enum etapa_fluxo
-- Data: 2026-02-12

ALTER TYPE etapa_fluxo ADD VALUE IF NOT EXISTS 'DIGITALIZACAO_COLORIDA' AFTER 'DIGITALIZACAO';

INSERT INTO schema_migrations (version)
SELECT '046_add_digitalizacao_colorida'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '046_add_digitalizacao_colorida'
);
