-- Migration: 014_tags
-- Description: Tabela de tags para base de conhecimento

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    cor CHAR(7) NOT NULL DEFAULT '#3B82F6',
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT tags_nome_min_length CHECK (LENGTH(TRIM(nome)) >= 2),
    CONSTRAINT tags_slug_min_length CHECK (LENGTH(TRIM(slug)) >= 2),
    CONSTRAINT tags_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
    CONSTRAINT tags_cor_format CHECK (cor ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE UNIQUE INDEX idx_tags_slug ON tags (slug);
CREATE INDEX idx_tags_nome ON tags (nome);

INSERT INTO schema_migrations (version) VALUES ('014_tags');
