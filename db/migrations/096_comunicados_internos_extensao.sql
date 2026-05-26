-- Migration: 096_comunicados_internos_extensao
-- Descricao: Adiciona tipo, categoria, resumo, fixado e leitura obrigatoria aos comunicados internos
-- Data: 2026-05-25

DO $$
BEGIN
  CREATE TYPE comunicado_tipo AS ENUM (
    'COMUNICADO_GERAL',
    'COMUNICADO_IMPORTANTE',
    'DECISAO_OPERACIONAL',
    'PADRONIZACAO',
    'SISTEMA',
    'TREINAMENTO',
    'BLOG_INTERNO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE comunicado_categoria AS ENUM (
    'PRODUCAO',
    'DIGITALIZACAO',
    'CONFERENCIA',
    'RECONFERENCIA',
    'QUALIDADE',
    'ADMINISTRATIVO',
    'SISTEMA',
    'GERAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE comunicados
  ADD COLUMN tipo comunicado_tipo NOT NULL DEFAULT 'COMUNICADO_GERAL',
  ADD COLUMN categoria comunicado_categoria NOT NULL DEFAULT 'GERAL',
  ADD COLUMN resumo VARCHAR(400),
  ADD COLUMN fixado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN leitura_obrigatoria BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN comunicados.tipo IS 'Tipo do comunicado para classificacao interna';
COMMENT ON COLUMN comunicados.categoria IS 'Categoria do comunicado para organizacao operacional';
COMMENT ON COLUMN comunicados.resumo IS 'Resumo curto opcional para exibir em listas';
COMMENT ON COLUMN comunicados.fixado IS 'Indica se o comunicado deve ser exibido em destaque';
COMMENT ON COLUMN comunicados.leitura_obrigatoria IS 'Indica se a leitura e obrigatoria para destinatarios';

INSERT INTO schema_migrations (version) VALUES ('096_comunicados_internos_extensao')
  ON CONFLICT (version) DO NOTHING;
