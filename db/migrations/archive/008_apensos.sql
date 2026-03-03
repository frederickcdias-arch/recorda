-- Migration: 008_apensos
-- Description: Tabela de apensos (vinculação entre processos)

CREATE TYPE tipo_apenso AS ENUM ('APENSO', 'ANEXO', 'APENSAMENTO');

CREATE TABLE apensos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    processo_principal_id UUID NOT NULL,
    numero_processo_apenso VARCHAR(50) NOT NULL,
    tipo tipo_apenso NOT NULL,
    data_apensamento TIMESTAMP WITH TIME ZONE NOT NULL,
    data_desapensamento TIMESTAMP WITH TIME ZONE,
    motivo TEXT NOT NULL DEFAULT '',
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT apensos_numero_min_length CHECK (LENGTH(TRIM(numero_processo_apenso)) >= 5),
    CONSTRAINT apensos_data_apensamento_not_future CHECK (data_apensamento <= CURRENT_TIMESTAMP),
    CONSTRAINT apensos_data_desapensamento_not_future CHECK (data_desapensamento IS NULL OR data_desapensamento <= CURRENT_TIMESTAMP),
    CONSTRAINT apensos_desapensamento_after_apensamento CHECK (data_desapensamento IS NULL OR data_desapensamento >= data_apensamento),
    CONSTRAINT fk_apensos_processo_principal 
        FOREIGN KEY (processo_principal_id) 
        REFERENCES processos_principais(id) 
        ON DELETE RESTRICT
);

CREATE INDEX idx_apensos_processo_principal ON apensos (processo_principal_id);
CREATE INDEX idx_apensos_numero_processo ON apensos (numero_processo_apenso);
CREATE INDEX idx_apensos_data_apensamento ON apensos (data_apensamento);
CREATE INDEX idx_apensos_ativos ON apensos (processo_principal_id) WHERE data_desapensamento IS NULL;

INSERT INTO schema_migrations (version) VALUES ('008_apensos');
