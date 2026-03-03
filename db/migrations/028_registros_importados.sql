-- Migration: 028_registros_importados
-- Description: Tabela para armazenar registros importados sem vínculo prévio

CREATE TABLE registros_importados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    importacao_id UUID NOT NULL REFERENCES importacoes(id) ON DELETE CASCADE,
    fonte_dados_id UUID NOT NULL REFERENCES fontes_dados(id) ON DELETE CASCADE,
    linha INTEGER NOT NULL,
    data_producao TEXT,
    colaborador TEXT,
    funcao TEXT,
    processo TEXT,
    repositorio TEXT,
    coordenadoria TEXT,
    tipo TEXT,
    quantidade INTEGER,
    observacao TEXT,
    dados JSONB,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_registros_importados_importacao ON registros_importados (importacao_id);
CREATE INDEX idx_registros_importados_fonte ON registros_importados (fonte_dados_id);
CREATE INDEX idx_registros_importados_colaborador ON registros_importados (LOWER(colaborador));

INSERT INTO schema_migrations (version) VALUES ('028_registros_importados');
