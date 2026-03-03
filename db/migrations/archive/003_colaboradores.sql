-- Migration: 003_colaboradores
-- Description: Tabela de colaboradores

CREATE TABLE colaboradores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    matricula VARCHAR(20) NOT NULL,
    coordenadoria_id UUID NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT colaboradores_nome_min_length CHECK (LENGTH(TRIM(nome)) >= 2),
    CONSTRAINT colaboradores_matricula_not_empty CHECK (LENGTH(TRIM(matricula)) > 0),
    CONSTRAINT fk_colaboradores_coordenadoria 
        FOREIGN KEY (coordenadoria_id) 
        REFERENCES coordenadorias(id) 
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_colaboradores_matricula ON colaboradores (matricula);
CREATE INDEX idx_colaboradores_coordenadoria ON colaboradores (coordenadoria_id);
CREATE INDEX idx_colaboradores_ativo ON colaboradores (ativo) WHERE ativo = TRUE;

INSERT INTO schema_migrations (version) VALUES ('003_colaboradores');
