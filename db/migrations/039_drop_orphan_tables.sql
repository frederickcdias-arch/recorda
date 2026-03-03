-- Migration: 039_drop_orphan_tables
-- Description: Drop orphan tables from the legacy data model that are no longer
--              referenced by any backend production code. The operational flow now
--              uses repositorios, producao_repositorio, checklists, etc.
--
-- Tables dropped (16):
--   artigos_relacionados, artigos_tags, artigos, tags, categorias
--   registros_importados, recebimentos, documentos_ocr
--   fontes_dados_configuracoes, fontes_dados_api, fontes_dados
--   importacoes, volumes, apensos, processos_principais
--   glossario
--
-- NOTE: registros_producao is NOT dropped here — it is still used by metas.ts
--       and will be unified with producao_repositorio in a separate migration.

-- Drop trigger and function first (from 009_registros_producao references)
-- No action needed here since registros_producao is kept.

-- Drop tables in reverse dependency order

-- artigos depend on categorias; artigos_tags depends on artigos + tags; artigos_relacionados depends on artigos
DROP TABLE IF EXISTS artigos_relacionados CASCADE;
DROP TABLE IF EXISTS artigos_tags CASCADE;
DROP TABLE IF EXISTS artigos CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS categorias CASCADE;

-- registros_importados depends on importacoes
DROP TABLE IF EXISTS registros_importados CASCADE;

-- recebimentos depends on processos_principais
DROP TABLE IF EXISTS recebimentos CASCADE;

-- documentos_ocr depends on processos_principais
DROP TABLE IF EXISTS documentos_ocr CASCADE;

-- fontes_dados_configuracoes and fontes_dados_api depend on fontes_dados
DROP TABLE IF EXISTS fontes_dados_configuracoes CASCADE;
DROP TABLE IF EXISTS fontes_dados_api CASCADE;

-- importacoes depends on colaboradores (kept) and fontes_dados
DROP TABLE IF EXISTS importacoes CASCADE;

-- volumes depends on processos_principais
DROP TABLE IF EXISTS volumes CASCADE;

-- apensos depends on processos_principais
DROP TABLE IF EXISTS apensos CASCADE;

-- processos_principais depends on coordenadorias (kept)
DROP TABLE IF EXISTS processos_principais CASCADE;

-- fontes_dados (no remaining dependents after above drops)
DROP TABLE IF EXISTS fontes_dados CASCADE;

-- glossario (standalone)
DROP TABLE IF EXISTS glossario CASCADE;

INSERT INTO schema_migrations (version) VALUES ('039_drop_orphan_tables');
