-- Migration: 017_artigos_relacionados
-- Description: Tabela de relacionamento entre artigos (links contextuais)

CREATE TABLE artigos_relacionados (
    artigo_origem_id UUID NOT NULL,
    artigo_destino_id UUID NOT NULL,
    tipo VARCHAR(50) NOT NULL DEFAULT 'RELACIONADO',
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (artigo_origem_id, artigo_destino_id),
    CONSTRAINT artigos_relacionados_diferentes CHECK (artigo_origem_id != artigo_destino_id),
    CONSTRAINT fk_artigos_relacionados_origem 
        FOREIGN KEY (artigo_origem_id) 
        REFERENCES artigos(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_artigos_relacionados_destino 
        FOREIGN KEY (artigo_destino_id) 
        REFERENCES artigos(id) 
        ON DELETE CASCADE
);

CREATE INDEX idx_artigos_relacionados_origem ON artigos_relacionados (artigo_origem_id);
CREATE INDEX idx_artigos_relacionados_destino ON artigos_relacionados (artigo_destino_id);

-- View para busca de artigos com ranking
CREATE OR REPLACE VIEW v_artigos_busca AS
SELECT 
    a.id,
    a.titulo,
    a.slug,
    a.resumo,
    a.status,
    a.data_publicacao,
    a.visualizacoes,
    c.nome AS categoria_nome,
    c.slug AS categoria_slug,
    col.nome AS autor_nome,
    (
        SELECT array_agg(t.nome ORDER BY t.nome)
        FROM artigos_tags at
        JOIN tags t ON t.id = at.tag_id
        WHERE at.artigo_id = a.id
    ) AS tags
FROM artigos a
JOIN categorias c ON c.id = a.categoria_id
JOIN colaboradores col ON col.id = a.autor_id
WHERE a.status = 'PUBLICADO';

INSERT INTO schema_migrations (version) VALUES ('017_artigos_relacionados');
