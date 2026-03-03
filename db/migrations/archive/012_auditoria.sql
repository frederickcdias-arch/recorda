-- Migration: 012_auditoria
-- Description: Tabela de auditoria para rastreamento de alterações

CREATE TYPE tipo_operacao AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'CANCEL');

CREATE TABLE auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tabela VARCHAR(100) NOT NULL,
    registro_id UUID NOT NULL,
    operacao tipo_operacao NOT NULL,
    dados_anteriores JSONB,
    dados_novos JSONB,
    colaborador_id UUID,
    ip_origem VARCHAR(45),
    user_agent TEXT,
    data_operacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT auditoria_tabela_not_empty CHECK (LENGTH(TRIM(tabela)) > 0),
    CONSTRAINT auditoria_data_not_future CHECK (data_operacao <= CURRENT_TIMESTAMP),
    CONSTRAINT fk_auditoria_colaborador 
        FOREIGN KEY (colaborador_id) 
        REFERENCES colaboradores(id) 
        ON DELETE SET NULL
);

CREATE INDEX idx_auditoria_tabela ON auditoria (tabela);
CREATE INDEX idx_auditoria_registro ON auditoria (registro_id);
CREATE INDEX idx_auditoria_tabela_registro ON auditoria (tabela, registro_id);
CREATE INDEX idx_auditoria_operacao ON auditoria (operacao);
CREATE INDEX idx_auditoria_colaborador ON auditoria (colaborador_id) WHERE colaborador_id IS NOT NULL;
CREATE INDEX idx_auditoria_data ON auditoria (data_operacao);

-- Função genérica para auditoria
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    old_data JSONB;
    new_data JSONB;
    op tipo_operacao;
BEGIN
    IF TG_OP = 'INSERT' THEN
        old_data := NULL;
        new_data := to_jsonb(NEW);
        op := 'INSERT';
        
        INSERT INTO auditoria (tabela, registro_id, operacao, dados_anteriores, dados_novos)
        VALUES (TG_TABLE_NAME, NEW.id, op, old_data, new_data);
        
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
        op := 'UPDATE';
        
        INSERT INTO auditoria (tabela, registro_id, operacao, dados_anteriores, dados_novos)
        VALUES (TG_TABLE_NAME, NEW.id, op, old_data, new_data);
        
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        old_data := to_jsonb(OLD);
        new_data := NULL;
        op := 'DELETE';
        
        INSERT INTO auditoria (tabela, registro_id, operacao, dados_anteriores, dados_novos)
        VALUES (TG_TABLE_NAME, OLD.id, op, old_data, new_data);
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers de auditoria para tabelas principais
CREATE TRIGGER audit_coordenadorias
    AFTER INSERT OR UPDATE OR DELETE ON coordenadorias
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_colaboradores
    AFTER INSERT OR UPDATE OR DELETE ON colaboradores
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_etapas
    AFTER INSERT OR UPDATE OR DELETE ON etapas
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_fontes_dados
    AFTER INSERT OR UPDATE OR DELETE ON fontes_dados
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_processos_principais
    AFTER INSERT OR UPDATE OR DELETE ON processos_principais
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_volumes
    AFTER INSERT OR UPDATE OR DELETE ON volumes
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_apensos
    AFTER INSERT OR UPDATE OR DELETE ON apensos
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_registros_producao
    AFTER INSERT OR UPDATE ON registros_producao
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_documentos_ocr
    AFTER INSERT OR UPDATE OR DELETE ON documentos_ocr
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_importacoes
    AFTER INSERT OR UPDATE OR DELETE ON importacoes
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

INSERT INTO schema_migrations (version) VALUES ('012_auditoria');
