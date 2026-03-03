-- Migration: 004_etapas
-- Description: Tabela de etapas do fluxo de trabalho

CREATE TYPE unidade_medida AS ENUM ('PROCESSO', 'VOLUME', 'PAGINA', 'DOCUMENTO');

CREATE TABLE etapas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    unidade unidade_medida NOT NULL,
    ordem INTEGER NOT NULL,
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT etapas_nome_min_length CHECK (LENGTH(TRIM(nome)) >= 2),
    CONSTRAINT etapas_ordem_non_negative CHECK (ordem >= 0)
);

CREATE UNIQUE INDEX idx_etapas_ordem ON etapas (ordem) WHERE ativa = TRUE;
CREATE INDEX idx_etapas_ativa ON etapas (ativa) WHERE ativa = TRUE;

INSERT INTO schema_migrations (version) VALUES ('004_etapas');
