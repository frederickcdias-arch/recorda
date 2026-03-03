-- Migration 072: Drop legacy article/category/tag tables
-- Rationale: Migrations 013-017 created artigos, artigos_tags, artigos_relacionados,
-- categorias, and tags as a knowledge-base prototype. Migration 036 replaced them with
-- the proper kb_documentos/kb_documento_versoes system. Migration 039 dropped some
-- orphan tables but left these behind. No backend routes reference them.
-- Dropping them reduces schema noise and prevents confusion.

-- Drop in dependency order (children before parents)
DROP TABLE IF EXISTS artigos_relacionados;
DROP TABLE IF EXISTS artigos_tags;
DROP TABLE IF EXISTS artigos;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS categorias;

INSERT INTO schema_migrations (version) VALUES ('072_drop_tabelas_legado_artigos')
  ON CONFLICT (version) DO NOTHING;
