-- Migration: 015_artigos
-- Description: Tabela de artigos para base de conhecimento com busca full-text

CREATE TYPE status_artigo AS ENUM ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO');

CREATE TABLE artigos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    titulo VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    resumo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    categoria_id UUID NOT NULL,
    autor_id UUID NOT NULL,
    status status_artigo NOT NULL DEFAULT 'RASCUNHO',
    data_publicacao TIMESTAMP WITH TIME ZONE,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    visualizacoes INTEGER NOT NULL DEFAULT 0,
    
    -- Coluna para busca full-text
    busca_vetor tsvector,
    
    CONSTRAINT artigos_titulo_min_length CHECK (LENGTH(TRIM(titulo)) >= 2),
    CONSTRAINT artigos_slug_min_length CHECK (LENGTH(TRIM(slug)) >= 3),
    CONSTRAINT artigos_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
    CONSTRAINT artigos_resumo_min_length CHECK (LENGTH(TRIM(resumo)) >= 10),
    CONSTRAINT artigos_conteudo_min_length CHECK (LENGTH(TRIM(conteudo)) >= 50),
    CONSTRAINT artigos_visualizacoes_non_negative CHECK (visualizacoes >= 0),
    CONSTRAINT fk_artigos_categoria 
        FOREIGN KEY (categoria_id) 
        REFERENCES categorias(id) 
        ON DELETE RESTRICT,
    CONSTRAINT fk_artigos_autor 
        FOREIGN KEY (autor_id) 
        REFERENCES colaboradores(id) 
        ON DELETE RESTRICT
);

-- Índices para busca e navegação
CREATE UNIQUE INDEX idx_artigos_slug ON artigos (slug);
CREATE INDEX idx_artigos_categoria ON artigos (categoria_id);
CREATE INDEX idx_artigos_autor ON artigos (autor_id);
CREATE INDEX idx_artigos_status ON artigos (status);
CREATE INDEX idx_artigos_data_publicacao ON artigos (data_publicacao) WHERE data_publicacao IS NOT NULL;
CREATE INDEX idx_artigos_publicados ON artigos (data_publicacao DESC) WHERE status = 'PUBLICADO';

-- Índice GIN para busca full-text
CREATE INDEX idx_artigos_busca ON artigos USING GIN (busca_vetor);

-- Função para atualizar vetor de busca
CREATE OR REPLACE FUNCTION artigos_busca_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.busca_vetor := 
        setweight(to_tsvector('portuguese', COALESCE(NEW.titulo, '')), 'A') ||
        setweight(to_tsvector('portuguese', COALESCE(NEW.resumo, '')), 'B') ||
        setweight(to_tsvector('portuguese', COALESCE(NEW.conteudo, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_artigos_busca
    BEFORE INSERT OR UPDATE ON artigos
    FOR EACH ROW
    EXECUTE FUNCTION artigos_busca_trigger();

INSERT INTO schema_migrations (version) VALUES ('015_artigos');
