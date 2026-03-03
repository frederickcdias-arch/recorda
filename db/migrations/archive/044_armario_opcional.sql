-- Migration: 044_armario_opcional
-- Descrição: Tornar armário opcional - é controle físico, não digital
-- Data: 2026-02-11

-- Tornar localizacao_fisica_armario_id nullable
ALTER TABLE repositorios ALTER COLUMN localizacao_fisica_armario_id DROP NOT NULL;

-- Definir default NULL para novos repositórios
ALTER TABLE repositorios ALTER COLUMN localizacao_fisica_armario_id SET DEFAULT NULL;

INSERT INTO schema_migrations (version)
SELECT '044_armario_opcional'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '044_armario_opcional'
);
