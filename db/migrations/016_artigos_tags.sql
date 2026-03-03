-- Migration: 016_artigos_tags
-- Description: Tabela de relacionamento entre artigos e tags

CREATE TABLE artigos_tags (
    artigo_id UUID NOT NULL,
    tag_id UUID NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (artigo_id, tag_id),
    CONSTRAINT fk_artigos_tags_artigo 
        FOREIGN KEY (artigo_id) 
        REFERENCES artigos(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_artigos_tags_tag 
        FOREIGN KEY (tag_id) 
        REFERENCES tags(id) 
        ON DELETE CASCADE
);

CREATE INDEX idx_artigos_tags_artigo ON artigos_tags (artigo_id);
CREATE INDEX idx_artigos_tags_tag ON artigos_tags (tag_id);

INSERT INTO schema_migrations (version) VALUES ('016_artigos_tags');
