-- Migration: 007_volumes
-- Description: Tabela de volumes de processos

CREATE TABLE volumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    processo_id UUID NOT NULL,
    numero INTEGER NOT NULL,
    quantidade_paginas INTEGER NOT NULL DEFAULT 0,
    data_abertura TIMESTAMP WITH TIME ZONE NOT NULL,
    data_fechamento TIMESTAMP WITH TIME ZONE,
    observacao TEXT NOT NULL DEFAULT '',
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT volumes_numero_positive CHECK (numero > 0),
    CONSTRAINT volumes_quantidade_paginas_non_negative CHECK (quantidade_paginas >= 0),
    CONSTRAINT volumes_data_abertura_not_future CHECK (data_abertura <= CURRENT_TIMESTAMP),
    CONSTRAINT volumes_data_fechamento_not_future CHECK (data_fechamento IS NULL OR data_fechamento <= CURRENT_TIMESTAMP),
    CONSTRAINT volumes_fechamento_after_abertura CHECK (data_fechamento IS NULL OR data_fechamento >= data_abertura),
    CONSTRAINT fk_volumes_processo 
        FOREIGN KEY (processo_id) 
        REFERENCES processos_principais(id) 
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_volumes_processo_numero ON volumes (processo_id, numero);
CREATE INDEX idx_volumes_processo ON volumes (processo_id);
CREATE INDEX idx_volumes_data_abertura ON volumes (data_abertura);
CREATE INDEX idx_volumes_data_fechamento ON volumes (data_fechamento) WHERE data_fechamento IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('007_volumes');
