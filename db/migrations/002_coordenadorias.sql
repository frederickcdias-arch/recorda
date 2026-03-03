-- Migration: 002_coordenadorias
-- Description: Tabela de coordenadorias (unidades organizacionais)

CREATE TABLE IF NOT EXISTS coordenadorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    sigla VARCHAR(20) NOT NULL,
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT coordenadorias_nome_min_length CHECK (LENGTH(TRIM(nome)) >= 2),
    CONSTRAINT coordenadorias_sigla_not_empty CHECK (LENGTH(TRIM(sigla)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coordenadorias_sigla ON coordenadorias (UPPER(sigla));
CREATE INDEX IF NOT EXISTS idx_coordenadorias_ativa ON coordenadorias (ativa) WHERE ativa = TRUE;

INSERT INTO schema_migrations (version)
SELECT '002_coordenadorias'
WHERE NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '002_coordenadorias'
);
