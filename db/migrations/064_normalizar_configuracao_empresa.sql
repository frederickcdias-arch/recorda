-- Migration 064: Normalize configuracao_empresa
-- Rationale:
-- 1. Several columns are nullable without defaults — can return NULL unexpectedly
-- 2. Column names data_criacao/data_atualizacao are inconsistent with the rest of
--    the schema which uses criado_em/atualizado_em
-- 3. No automatic update trigger for atualizado_em

-- Step 1: Fill NULLs before adding NOT NULL constraints
UPDATE configuracao_empresa SET cnpj    = '' WHERE cnpj    IS NULL;
UPDATE configuracao_empresa SET endereco = '' WHERE endereco IS NULL;
UPDATE configuracao_empresa SET telefone = '' WHERE telefone IS NULL;
UPDATE configuracao_empresa SET email   = '' WHERE email   IS NULL;
UPDATE configuracao_empresa SET logo_url = '' WHERE logo_url IS NULL;

-- Step 2: Set DEFAULT + NOT NULL on text columns
ALTER TABLE configuracao_empresa
  ALTER COLUMN cnpj     SET DEFAULT '',
  ALTER COLUMN cnpj     SET NOT NULL,
  ALTER COLUMN endereco SET DEFAULT '',
  ALTER COLUMN endereco SET NOT NULL,
  ALTER COLUMN telefone SET DEFAULT '',
  ALTER COLUMN telefone SET NOT NULL,
  ALTER COLUMN email    SET DEFAULT '',
  ALTER COLUMN email    SET NOT NULL,
  ALTER COLUMN logo_url SET DEFAULT '',
  ALTER COLUMN logo_url SET NOT NULL;

-- Step 3: Rename audit columns to match schema convention
ALTER TABLE configuracao_empresa RENAME COLUMN data_criacao    TO criado_em;
ALTER TABLE configuracao_empresa RENAME COLUMN data_atualizacao TO atualizado_em;

-- Step 4: Add automatic update trigger
CREATE TRIGGER update_configuracao_empresa_timestamp
  BEFORE UPDATE ON configuracao_empresa
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

INSERT INTO schema_migrations (version) VALUES ('064_normalizar_configuracao_empresa')
  ON CONFLICT (version) DO NOTHING;
