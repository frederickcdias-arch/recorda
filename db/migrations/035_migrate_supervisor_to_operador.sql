-- Migration: 035_migrate_supervisor_to_operador
-- Description: Migra perfil legado supervisor para operador

UPDATE usuarios
SET perfil = 'operador'
WHERE perfil::text = 'supervisor';

INSERT INTO schema_migrations (version)
SELECT '035_migrate_supervisor_to_operador'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '035_migrate_supervisor_to_operador'
);
