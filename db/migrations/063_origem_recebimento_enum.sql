-- Migration 063: Create origem_recebimento ENUM and migrate VARCHAR+CHECK columns
-- Rationale: recebimento_processos, recebimento_volumes, recebimento_apensos all use
-- VARCHAR(20) CHECK (origem IN ('MANUAL','OCR','LEGADO')). A dedicated ENUM is safer,
-- more consistent with the rest of the schema, and removes the duplicated CHECK constraints.

CREATE TYPE origem_recebimento AS ENUM ('MANUAL', 'OCR', 'LEGADO');

-- recebimento_processos
ALTER TABLE recebimento_processos
  ALTER COLUMN origem DROP DEFAULT;

ALTER TABLE recebimento_processos
  ALTER COLUMN origem TYPE origem_recebimento
  USING origem::origem_recebimento;

ALTER TABLE recebimento_processos
  DROP CONSTRAINT IF EXISTS receb_proc_origem_valid;

-- recebimento_volumes
ALTER TABLE recebimento_volumes
  ALTER COLUMN origem DROP DEFAULT;

ALTER TABLE recebimento_volumes
  ALTER COLUMN origem TYPE origem_recebimento
  USING origem::origem_recebimento;

ALTER TABLE recebimento_volumes
  DROP CONSTRAINT IF EXISTS receb_vol_origem_valid;

-- recebimento_apensos
ALTER TABLE recebimento_apensos
  ALTER COLUMN origem DROP DEFAULT;

ALTER TABLE recebimento_apensos
  ALTER COLUMN origem TYPE origem_recebimento
  USING origem::origem_recebimento;

ALTER TABLE recebimento_apensos
  DROP CONSTRAINT IF EXISTS receb_apenso_origem_valid;

INSERT INTO schema_migrations (version) VALUES ('063_origem_recebimento_enum')
  ON CONFLICT (version) DO NOTHING;
