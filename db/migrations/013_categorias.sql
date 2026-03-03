-- Migration: 013_categorias
-- Description: Tabela de categorias para base de conhecimento

CREATE TABLE categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    slug VARCHAR(100) NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 0,
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    categoria_pai_id UUID,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT categorias_nome_min_length CHECK (LENGTH(TRIM(nome)) >= 2),
    CONSTRAINT categorias_slug_min_length CHECK (LENGTH(TRIM(slug)) >= 2),
    CONSTRAINT categorias_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
    CONSTRAINT categorias_ordem_non_negative CHECK (ordem >= 0),
    CONSTRAINT fk_categorias_pai 
        FOREIGN KEY (categoria_pai_id) 
        REFERENCES categorias(id) 
        ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_categorias_slug ON categorias (slug);
CREATE INDEX idx_categorias_pai ON categorias (categoria_pai_id) WHERE categoria_pai_id IS NOT NULL;
CREATE INDEX idx_categorias_ativa ON categorias (ativa) WHERE ativa = TRUE;
CREATE INDEX idx_categorias_ordem ON categorias (ordem);

INSERT INTO schema_migrations (version) VALUES ('013_categorias');
