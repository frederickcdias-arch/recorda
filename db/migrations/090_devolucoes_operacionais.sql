-- Migration: 090_devolucoes_operacionais
-- Description: Tabelas para controle de devolução operacional de processos/documentos
--              às coordenadorias de origem ou destino.

-- ============================================================
-- 1. Cabeçalho da devolução (evento único por saída)
-- ============================================================
CREATE TABLE IF NOT EXISTS devolucoes_operacionais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    data_devolucao DATE NOT NULL DEFAULT CURRENT_DATE,
    coordenadoria_destino_id UUID NOT NULL,
    responsavel_retirada VARCHAR(255) NOT NULL,
    observacoes TEXT,
    criado_por UUID,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_devol_coordenadoria
        FOREIGN KEY (coordenadoria_destino_id)
        REFERENCES coordenadorias(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_devol_usuario
        FOREIGN KEY (criado_por)
        REFERENCES usuarios(id)
        ON DELETE SET NULL,
    CONSTRAINT devol_responsavel_not_empty
        CHECK (LENGTH(TRIM(responsavel_retirada)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_devol_op_coordenadoria ON devolucoes_operacionais (coordenadoria_destino_id);
CREATE INDEX IF NOT EXISTS idx_devol_op_data ON devolucoes_operacionais (data_devolucao DESC);
CREATE INDEX IF NOT EXISTS idx_devol_op_criado_em ON devolucoes_operacionais (criado_em DESC);

-- ============================================================
-- 2. Itens da devolução (processos/documentos devolvidos)
-- ============================================================
CREATE TABLE IF NOT EXISTS devolucao_operacional_itens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    devolucao_id UUID NOT NULL,
    repositorio VARCHAR(100),
    orgao VARCHAR(500),
    protocolo VARCHAR(255),
    interessado VARCHAR(500),
    volume VARCHAR(50),
    obs TEXT,
    -- FK opcional para vincular ao processo de recebimento de origem
    recebimento_processo_id UUID,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_devol_item_devolucao
        FOREIGN KEY (devolucao_id)
        REFERENCES devolucoes_operacionais(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_devol_item_recebimento
        FOREIGN KEY (recebimento_processo_id)
        REFERENCES recebimento_processos(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_devol_item_devolucao ON devolucao_operacional_itens (devolucao_id);
CREATE INDEX IF NOT EXISTS idx_devol_item_protocolo ON devolucao_operacional_itens (protocolo);
CREATE INDEX IF NOT EXISTS idx_devol_item_repositorio ON devolucao_operacional_itens (repositorio);
CREATE INDEX IF NOT EXISTS idx_devol_item_recebimento ON devolucao_operacional_itens (recebimento_processo_id);

INSERT INTO schema_migrations (version)
SELECT '090_devolucoes_operacionais'
WHERE NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '090_devolucoes_operacionais'
);
