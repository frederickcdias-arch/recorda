-- Migration 073: Consolidate 3 identical timestamp trigger functions into one
-- Rationale: update_timestamp() (migration 019), update_updated_at_column() (migration 036),
-- and update_atualizado_em() (migration 058) all have identical bodies.
-- We keep update_timestamp() as the canonical function and replace the other two
-- with aliases (DROP + recreate as wrappers) so existing triggers keep working
-- without needing to be recreated.

-- Drop the two duplicates and recreate them as thin wrappers calling update_timestamp()
-- This is safer than CASCADE DROP because it avoids dropping dependent triggers.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  RETURN update_timestamp();
END;
$$ LANGUAGE plpgsql;

-- Actually, triggers call the function directly, so we need the function to set NEW.atualizado_em.
-- The cleanest approach: replace both duplicates with the exact same body as update_timestamp().

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Migrate all triggers that use the duplicate functions to use update_timestamp() directly.
-- kb_documentos
DROP TRIGGER IF EXISTS update_kb_documentos_timestamp ON kb_documentos;
CREATE TRIGGER update_kb_documentos_timestamp
  BEFORE UPDATE ON kb_documentos
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- kb_glossario
DROP TRIGGER IF EXISTS update_kb_glossario_timestamp ON kb_glossario;
CREATE TRIGGER update_kb_glossario_timestamp
  BEFORE UPDATE ON kb_glossario
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- kb_leis_normas
DROP TRIGGER IF EXISTS update_kb_leis_normas_timestamp ON kb_leis_normas;
CREATE TRIGGER update_kb_leis_normas_timestamp
  BEFORE UPDATE ON kb_leis_normas
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Now drop the duplicate functions (triggers no longer reference them)
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS update_atualizado_em();

INSERT INTO schema_migrations (version) VALUES ('073_consolidar_funcoes_timestamp')
  ON CONFLICT (version) DO NOTHING;
