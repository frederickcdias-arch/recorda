-- Migration: 081_repositorios_unique_por_contexto
-- Description: Regras de duplicidade de repositorios por contexto (id GED + unidade + projeto).

ALTER TABLE repositorios
  DROP CONSTRAINT IF EXISTS repositorios_id_repositorio_ged_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uk_repositorios_ged_orgao_projeto'
  ) THEN
    ALTER TABLE repositorios
      ADD CONSTRAINT uk_repositorios_ged_orgao_projeto
      UNIQUE (id_repositorio_ged, orgao, projeto);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_repositorios_id_ged
  ON repositorios (id_repositorio_ged);

INSERT INTO schema_migrations (version)
SELECT '081_repositorios_unique_por_contexto'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '081_repositorios_unique_por_contexto'
);
