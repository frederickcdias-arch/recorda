-- Migration: 011_importacoes
-- Description: Tabela de importações de dados

CREATE TYPE status_importacao AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'ERRO', 'CANCELADA');
CREATE TYPE tipo_importacao AS ENUM ('PLANILHA', 'SISTEMA', 'OCR', 'MANUAL');

CREATE TABLE importacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo tipo_importacao NOT NULL,
    status status_importacao NOT NULL DEFAULT 'PENDENTE',
    arquivo_origem VARCHAR(1000),
    total_registros INTEGER NOT NULL DEFAULT 0,
    registros_processados INTEGER NOT NULL DEFAULT 0,
    registros_sucesso INTEGER NOT NULL DEFAULT 0,
    registros_erro INTEGER NOT NULL DEFAULT 0,
    colaborador_id UUID NOT NULL,
    data_inicio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_fim TIMESTAMP WITH TIME ZONE,
    erro TEXT,
    detalhes_erros JSONB,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT importacoes_total_non_negative CHECK (total_registros >= 0),
    CONSTRAINT importacoes_processados_non_negative CHECK (registros_processados >= 0),
    CONSTRAINT importacoes_sucesso_non_negative CHECK (registros_sucesso >= 0),
    CONSTRAINT importacoes_erro_non_negative CHECK (registros_erro >= 0),
    CONSTRAINT importacoes_processados_le_total CHECK (registros_processados <= total_registros),
    CONSTRAINT importacoes_sucesso_erro_le_processados CHECK (registros_sucesso + registros_erro <= registros_processados),
    CONSTRAINT importacoes_data_inicio_not_future CHECK (data_inicio <= CURRENT_TIMESTAMP),
    CONSTRAINT importacoes_data_fim_not_future CHECK (data_fim IS NULL OR data_fim <= CURRENT_TIMESTAMP),
    CONSTRAINT importacoes_fim_after_inicio CHECK (data_fim IS NULL OR data_fim >= data_inicio),
    CONSTRAINT fk_importacoes_colaborador 
        FOREIGN KEY (colaborador_id) 
        REFERENCES colaboradores(id) 
        ON DELETE RESTRICT
);

CREATE INDEX idx_importacoes_tipo ON importacoes (tipo);
CREATE INDEX idx_importacoes_status ON importacoes (status);
CREATE INDEX idx_importacoes_colaborador ON importacoes (colaborador_id);
CREATE INDEX idx_importacoes_data_inicio ON importacoes (data_inicio);
CREATE INDEX idx_importacoes_pendentes ON importacoes (data_inicio) WHERE status = 'PENDENTE';

INSERT INTO schema_migrations (version) VALUES ('011_importacoes');
