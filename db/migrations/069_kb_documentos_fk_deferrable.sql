-- Migration 069: Make circular FK on kb_documentos.versao_atual_id DEFERRABLE
-- Rationale: kb_documentos.versao_atual_id → kb_documento_versoes.id and
-- kb_documento_versoes.documento_id → kb_documentos.id form a circular reference.
-- Currently works only because versao_atual_id is nullable and INSERTs must follow
-- a specific order (insert doc first with NULL, then insert version, then UPDATE doc).
-- DEFERRABLE INITIALLY DEFERRED allows both rows to be inserted in the same transaction
-- without worrying about order, making the code simpler and safer.

ALTER TABLE kb_documentos
  DROP CONSTRAINT IF EXISTS fk_kb_documentos_versao_atual;

ALTER TABLE kb_documentos
  ADD CONSTRAINT fk_kb_documentos_versao_atual
    FOREIGN KEY (versao_atual_id)
    REFERENCES kb_documento_versoes(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

INSERT INTO schema_migrations (version) VALUES ('069_kb_documentos_fk_deferrable')
  ON CONFLICT (version) DO NOTHING;
