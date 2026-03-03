-- Migration: 032_producao_metas_mapeamentos
-- Description: Cria tabelas de metas de producao e templates de mapeamento de importacao

CREATE TABLE IF NOT EXISTS metas_producao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    etapa_id UUID NOT NULL,
    meta_diaria INTEGER NOT NULL DEFAULT 0,
    meta_mensal INTEGER NOT NULL DEFAULT 0,
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_metas_producao_etapa
        FOREIGN KEY (etapa_id)
        REFERENCES etapas(id)
        ON DELETE RESTRICT,
    CONSTRAINT metas_diaria_non_negative CHECK (meta_diaria >= 0),
    CONSTRAINT metas_mensal_non_negative CHECK (meta_mensal >= 0)
);

CREATE INDEX IF NOT EXISTS idx_metas_producao_etapa ON metas_producao (etapa_id);
CREATE INDEX IF NOT EXISTS idx_metas_producao_ativa ON metas_producao (ativa) WHERE ativa = TRUE;

CREATE TABLE IF NOT EXISTS mapeamentos_importacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    mapeamento JSONB NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT mapeamentos_importacao_nome_not_empty CHECK (LENGTH(TRIM(nome)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_mapeamentos_importacao_criado_em ON mapeamentos_importacao (criado_em DESC);

INSERT INTO schema_migrations (version)
SELECT '032_producao_metas_mapeamentos'
WHERE NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '032_producao_metas_mapeamentos'
);
