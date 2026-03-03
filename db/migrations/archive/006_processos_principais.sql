-- Migration: 006_processos_principais
-- Description: Tabela de processos principais (agregado raiz)

CREATE TYPE status_processo AS ENUM ('ATIVO', 'ARQUIVADO', 'SUSPENSO', 'CANCELADO');

CREATE TABLE processos_principais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(50) NOT NULL,
    assunto VARCHAR(500) NOT NULL,
    status status_processo NOT NULL DEFAULT 'ATIVO',
    data_abertura TIMESTAMP WITH TIME ZONE NOT NULL,
    data_arquivamento TIMESTAMP WITH TIME ZONE,
    coordenadoria_origem_id UUID NOT NULL,
    coordenadoria_atual_id UUID NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT processos_numero_min_length CHECK (LENGTH(TRIM(numero)) >= 5),
    CONSTRAINT processos_assunto_not_empty CHECK (LENGTH(TRIM(assunto)) > 0),
    CONSTRAINT processos_data_abertura_not_future CHECK (data_abertura <= CURRENT_TIMESTAMP),
    CONSTRAINT processos_data_arquivamento_not_future CHECK (data_arquivamento IS NULL OR data_arquivamento <= CURRENT_TIMESTAMP),
    CONSTRAINT processos_arquivamento_after_abertura CHECK (data_arquivamento IS NULL OR data_arquivamento >= data_abertura),
    CONSTRAINT fk_processos_coordenadoria_origem 
        FOREIGN KEY (coordenadoria_origem_id) 
        REFERENCES coordenadorias(id) 
        ON DELETE RESTRICT,
    CONSTRAINT fk_processos_coordenadoria_atual 
        FOREIGN KEY (coordenadoria_atual_id) 
        REFERENCES coordenadorias(id) 
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_processos_numero ON processos_principais (numero);
CREATE INDEX idx_processos_status ON processos_principais (status);
CREATE INDEX idx_processos_data_abertura ON processos_principais (data_abertura);
CREATE INDEX idx_processos_data_arquivamento ON processos_principais (data_arquivamento) WHERE data_arquivamento IS NOT NULL;
CREATE INDEX idx_processos_coordenadoria_origem ON processos_principais (coordenadoria_origem_id);
CREATE INDEX idx_processos_coordenadoria_atual ON processos_principais (coordenadoria_atual_id);

INSERT INTO schema_migrations (version) VALUES ('006_processos_principais');
