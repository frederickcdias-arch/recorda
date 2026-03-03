-- Migration: 045_desativar_modelo_armario
-- Descrição: Desativar modelo de checklist REGISTRO_ARMARIO_INICIAL pois armário foi removido do sistema
-- Data: 2026-02-11

UPDATE checklist_modelos
SET ativo = FALSE
WHERE codigo = 'REGISTRO_ARMARIO_INICIAL';

INSERT INTO schema_migrations (version)
SELECT '045_desativar_modelo_armario'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '045_desativar_modelo_armario'
);
