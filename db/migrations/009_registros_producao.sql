-- Migration: 009_registros_producao
-- Description: Tabela de registros de produção (imutável, sem deleção física)

CREATE TABLE registros_producao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    processo_id UUID NOT NULL,
    volume_id UUID,
    etapa_id UUID NOT NULL,
    colaborador_id UUID NOT NULL,
    fonte_dados_id UUID NOT NULL,
    quantidade INTEGER NOT NULL,
    data_registro TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_producao TIMESTAMP WITH TIME ZONE NOT NULL,
    observacao TEXT NOT NULL DEFAULT '',
    cancelado BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_cancelamento TEXT,
    data_cancelamento TIMESTAMP WITH TIME ZONE,
    cancelado_por UUID,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT registros_quantidade_positive CHECK (quantidade > 0),
    CONSTRAINT registros_data_producao_not_future CHECK (data_producao <= CURRENT_TIMESTAMP),
    CONSTRAINT registros_data_registro_not_future CHECK (data_registro <= CURRENT_TIMESTAMP),
    CONSTRAINT registros_cancelamento_consistency CHECK (
        (cancelado = FALSE AND motivo_cancelamento IS NULL AND data_cancelamento IS NULL AND cancelado_por IS NULL) OR
        (cancelado = TRUE AND motivo_cancelamento IS NOT NULL AND data_cancelamento IS NOT NULL)
    ),
    CONSTRAINT fk_registros_processo 
        FOREIGN KEY (processo_id) 
        REFERENCES processos_principais(id) 
        ON DELETE RESTRICT,
    CONSTRAINT fk_registros_volume 
        FOREIGN KEY (volume_id) 
        REFERENCES volumes(id) 
        ON DELETE RESTRICT,
    CONSTRAINT fk_registros_etapa 
        FOREIGN KEY (etapa_id) 
        REFERENCES etapas(id) 
        ON DELETE RESTRICT,
    CONSTRAINT fk_registros_colaborador 
        FOREIGN KEY (colaborador_id) 
        REFERENCES colaboradores(id) 
        ON DELETE RESTRICT,
    CONSTRAINT fk_registros_fonte_dados 
        FOREIGN KEY (fonte_dados_id) 
        REFERENCES fontes_dados(id) 
        ON DELETE RESTRICT,
    CONSTRAINT fk_registros_cancelado_por 
        FOREIGN KEY (cancelado_por) 
        REFERENCES colaboradores(id) 
        ON DELETE RESTRICT
);

-- Índices para consultas frequentes
CREATE INDEX idx_registros_processo ON registros_producao (processo_id);
CREATE INDEX idx_registros_volume ON registros_producao (volume_id) WHERE volume_id IS NOT NULL;
CREATE INDEX idx_registros_etapa ON registros_producao (etapa_id);
CREATE INDEX idx_registros_colaborador ON registros_producao (colaborador_id);
CREATE INDEX idx_registros_data_producao ON registros_producao (data_producao);
CREATE INDEX idx_registros_data_registro ON registros_producao (data_registro);
CREATE INDEX idx_registros_ativos ON registros_producao (processo_id, etapa_id, data_producao) WHERE cancelado = FALSE;

-- Índice composto para relatórios de produção
CREATE INDEX idx_registros_relatorio ON registros_producao (colaborador_id, etapa_id, data_producao) WHERE cancelado = FALSE;

-- Regra para impedir DELETE físico
CREATE RULE prevent_delete_registros_producao AS
    ON DELETE TO registros_producao
    DO INSTEAD NOTHING;

-- Regra para impedir UPDATE em campos imutáveis
CREATE OR REPLACE FUNCTION check_registros_producao_immutable()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.cancelado = FALSE AND NEW.cancelado = TRUE THEN
        -- Permitir apenas cancelamento
        IF NEW.processo_id != OLD.processo_id OR
           NEW.volume_id IS DISTINCT FROM OLD.volume_id OR
           NEW.etapa_id != OLD.etapa_id OR
           NEW.colaborador_id != OLD.colaborador_id OR
           NEW.fonte_dados_id != OLD.fonte_dados_id OR
           NEW.quantidade != OLD.quantidade OR
           NEW.data_registro != OLD.data_registro OR
           NEW.data_producao != OLD.data_producao OR
           NEW.observacao != OLD.observacao THEN
            RAISE EXCEPTION 'Campos imutáveis não podem ser alterados';
        END IF;
        RETURN NEW;
    ELSIF OLD.cancelado = TRUE THEN
        RAISE EXCEPTION 'Registro cancelado não pode ser alterado';
    ELSE
        RAISE EXCEPTION 'Registro de produção é imutável, apenas cancelamento é permitido';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_registros_producao_immutable
    BEFORE UPDATE ON registros_producao
    FOR EACH ROW
    EXECUTE FUNCTION check_registros_producao_immutable();

INSERT INTO schema_migrations (version) VALUES ('009_registros_producao');
