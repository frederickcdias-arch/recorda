-- Migration: 005_fontes_dados
-- Description: Tabela de fontes de dados

CREATE TYPE tipo_fonte AS ENUM ('SISTEMA', 'PLANILHA', 'MANUAL', 'OCR');

CREATE TABLE fontes_dados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    tipo tipo_fonte NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fontes_dados_nome_min_length CHECK (LENGTH(TRIM(nome)) >= 2)
);

CREATE INDEX idx_fontes_dados_tipo ON fontes_dados (tipo);
CREATE INDEX idx_fontes_dados_ativa ON fontes_dados (ativa) WHERE ativa = TRUE;

INSERT INTO schema_migrations (version) VALUES ('005_fontes_dados');
