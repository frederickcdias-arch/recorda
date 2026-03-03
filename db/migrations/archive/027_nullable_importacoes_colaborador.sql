-- Migration: 027_nullable_importacoes_colaborador
-- Description: Allow import records without a linked collaborator so imports can proceed when the user is not mapped

ALTER TABLE importacoes
  ALTER COLUMN colaborador_id DROP NOT NULL;

-- This migration intentionally allows NULL collaborator references so that imports
-- can be created even when the authenticated user does not have a corresponding
-- `colaboradores` row. Systems that require stronger linkage can still create
-- or update the association later.

INSERT INTO schema_migrations (version) VALUES ('027_nullable_importacoes_colaborador');
