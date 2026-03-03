-- Migration: 022_recebimentos
-- Descrição: Tabela de recebimentos de processos
-- Data: 2026-01-29

CREATE TABLE recebimentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    processo_id UUID NOT NULL,
    colaborador_id UUID NOT NULL,
    data_recebimento DATE NOT NULL DEFAULT CURRENT_DATE,
    hora_recebimento TIME WITH TIME ZONE DEFAULT CURRENT_TIME,
    setor_origem VARCHAR(200),
    setor_destino VARCHAR(200),
    observacoes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'RECEBIDO',
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_recebimentos_processo 
        FOREIGN KEY (processo_id) 
        REFERENCES processos_principais(id) 
        ON DELETE RESTRICT,
    CONSTRAINT fk_recebimentos_colaborador 
        FOREIGN KEY (colaborador_id) 
        REFERENCES colaboradores(id) 
        ON DELETE RESTRICT,
    CONSTRAINT recebimentos_status_valido 
        CHECK (status IN ('RECEBIDO', 'EM_ANALISE', 'ENCAMINHADO', 'ARQUIVADO', 'DEVOLVIDO'))
);

-- Índices para consultas frequentes
CREATE INDEX idx_recebimentos_processo ON recebimentos(processo_id);
CREATE INDEX idx_recebimentos_colaborador ON recebimentos(colaborador_id);
CREATE INDEX idx_recebimentos_data ON recebimentos(data_recebimento);
CREATE INDEX idx_recebimentos_status ON recebimentos(status);

-- Trigger de atualização de timestamp
CREATE TRIGGER update_recebimentos_timestamp
    BEFORE UPDATE ON recebimentos
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Trigger de auditoria
CREATE TRIGGER audit_recebimentos
    AFTER INSERT OR UPDATE OR DELETE ON recebimentos
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- Inserir na tabela de controle de migrations
INSERT INTO schema_migrations (version) VALUES ('022_recebimentos');

COMMENT ON TABLE recebimentos IS 'Registro de recebimentos de processos físicos';
COMMENT ON COLUMN recebimentos.status IS 'Status do recebimento: RECEBIDO, EM_ANALISE, ENCAMINHADO, ARQUIVADO, DEVOLVIDO';
