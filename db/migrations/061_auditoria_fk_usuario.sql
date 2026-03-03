-- Migration 061: Fix auditoria FK — colaborador_id → usuario_id
-- Rationale: The system authenticates via `usuarios`, not `colaboradores`.
-- All API actions are performed by authenticated usuarios. The old FK pointed
-- to the wrong table, leaving colaborador_id always NULL for API-driven actions.
-- Also adds support for app.current_user_id session variable so the trigger
-- can auto-populate usuario_id from the request context.

-- 1. Drop old FK and index
ALTER TABLE auditoria DROP CONSTRAINT IF EXISTS fk_auditoria_colaborador;
DROP INDEX IF EXISTS idx_auditoria_colaborador;

-- 2. Rename column
ALTER TABLE auditoria RENAME COLUMN colaborador_id TO usuario_id;

-- 3. Add correct FK
ALTER TABLE auditoria
  ADD CONSTRAINT fk_auditoria_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL;

-- 4. Recreate index on new column name
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario
  ON auditoria (usuario_id)
  WHERE usuario_id IS NOT NULL;

-- 5. Update audit_trigger_function to auto-populate usuario_id from session variable
--    Backend sets: SET LOCAL app.current_user_id = '<uuid>' at start of each request
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    old_data JSONB;
    new_data JSONB;
    op tipo_operacao;
    current_user_id UUID;
BEGIN
    -- Read user ID from session variable set by the application middleware
    BEGIN
        current_user_id := current_setting('app.current_user_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN
        current_user_id := NULL;
    END;

    IF TG_OP = 'INSERT' THEN
        old_data := NULL;
        new_data := to_jsonb(NEW);
        op := 'INSERT';
        INSERT INTO auditoria (tabela, registro_id, operacao, dados_anteriores, dados_novos, usuario_id)
        VALUES (TG_TABLE_NAME, NEW.id, op, old_data, new_data, current_user_id);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
        op := 'UPDATE';
        INSERT INTO auditoria (tabela, registro_id, operacao, dados_anteriores, dados_novos, usuario_id)
        VALUES (TG_TABLE_NAME, NEW.id, op, old_data, new_data, current_user_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        old_data := to_jsonb(OLD);
        new_data := NULL;
        op := 'DELETE';
        INSERT INTO auditoria (tabela, registro_id, operacao, dados_anteriores, dados_novos, usuario_id)
        VALUES (TG_TABLE_NAME, OLD.id, op, old_data, new_data, current_user_id);
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

INSERT INTO schema_migrations (version) VALUES ('061_auditoria_fk_usuario')
  ON CONFLICT (version) DO NOTHING;
