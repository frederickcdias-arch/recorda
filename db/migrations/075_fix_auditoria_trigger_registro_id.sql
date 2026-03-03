-- Migration: 075_fix_auditoria_trigger_registro_id
-- Description: Corrige audit_trigger_function para tabelas sem coluna "id"
--              (ex.: repositorios -> id_repositorio_recorda) mantendo usuario_id da sessão.

CREATE OR REPLACE FUNCTION audit_extract_registro_id(payload JSONB)
RETURNS UUID AS $$
DECLARE
  raw_id TEXT;
BEGIN
  IF payload IS NULL THEN
    RETURN NULL;
  END IF;

  raw_id := COALESCE(
    payload->>'id',
    payload->>'id_repositorio_recorda'
  );

  IF raw_id IS NULL OR LENGTH(TRIM(raw_id)) = 0 THEN
    RETURN NULL;
  END IF;

  RETURN raw_id::UUID;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  old_data JSONB;
  new_data JSONB;
  op tipo_operacao;
  ref_id UUID;
  current_user_id UUID;
BEGIN
  BEGIN
    current_user_id := current_setting('app.current_user_id', true)::UUID;
  EXCEPTION WHEN OTHERS THEN
    current_user_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    old_data := NULL;
    new_data := to_jsonb(NEW);
    op := 'INSERT';
    ref_id := audit_extract_registro_id(new_data);

    IF ref_id IS NULL THEN
      RAISE EXCEPTION 'Audit trigger: nao foi possivel extrair identificador do registro em % (INSERT)', TG_TABLE_NAME;
    END IF;

    INSERT INTO auditoria (tabela, registro_id, operacao, dados_anteriores, dados_novos, usuario_id)
    VALUES (TG_TABLE_NAME, ref_id, op, old_data, new_data, current_user_id);

    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    op := 'UPDATE';
    ref_id := COALESCE(audit_extract_registro_id(new_data), audit_extract_registro_id(old_data));

    IF ref_id IS NULL THEN
      RAISE EXCEPTION 'Audit trigger: nao foi possivel extrair identificador do registro em % (UPDATE)', TG_TABLE_NAME;
    END IF;

    INSERT INTO auditoria (tabela, registro_id, operacao, dados_anteriores, dados_novos, usuario_id)
    VALUES (TG_TABLE_NAME, ref_id, op, old_data, new_data, current_user_id);

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    old_data := to_jsonb(OLD);
    new_data := NULL;
    op := 'DELETE';
    ref_id := audit_extract_registro_id(old_data);

    IF ref_id IS NULL THEN
      RAISE EXCEPTION 'Audit trigger: nao foi possivel extrair identificador do registro em % (DELETE)', TG_TABLE_NAME;
    END IF;

    INSERT INTO auditoria (tabela, registro_id, operacao, dados_anteriores, dados_novos, usuario_id)
    VALUES (TG_TABLE_NAME, ref_id, op, old_data, new_data, current_user_id);

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

INSERT INTO schema_migrations (version)
SELECT '075_fix_auditoria_trigger_registro_id'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '075_fix_auditoria_trigger_registro_id'
);
