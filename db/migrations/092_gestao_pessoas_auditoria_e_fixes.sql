-- Migration: 092_gestao_pessoas_auditoria_e_fixes
-- Description: Adiciona triggers de auditoria e atualizado_em ausentes nas tabelas
--              criadas pela migration 074_gestao_pessoas, e corrige dias_restantes
--              em ferias para ser mantido consistente automaticamente.

-- ============================================================
-- 1. Trigger atualizado_em para tipos_ausencia (único sem trigger em 074)
-- ============================================================
DROP TRIGGER IF EXISTS update_tipos_ausencia_atualizado_em ON tipos_ausencia;
CREATE TRIGGER update_tipos_ausencia_atualizado_em
    BEFORE UPDATE ON tipos_ausencia
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================
-- 2. Triggers de auditoria para tabelas de gestão de pessoas
-- ============================================================
DROP TRIGGER IF EXISTS audit_tipos_ausencia ON tipos_ausencia;
CREATE TRIGGER audit_tipos_ausencia
    AFTER INSERT OR UPDATE OR DELETE ON tipos_ausencia
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_ausencias ON ausencias;
CREATE TRIGGER audit_ausencias
    AFTER INSERT OR UPDATE OR DELETE ON ausencias
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_banco_horas ON banco_horas;
CREATE TRIGGER audit_banco_horas
    AFTER INSERT OR UPDATE OR DELETE ON banco_horas
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_ferias ON ferias;
CREATE TRIGGER audit_ferias
    AFTER INSERT OR UPDATE OR DELETE ON ferias
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_ocorrencias ON ocorrencias;
CREATE TRIGGER audit_ocorrencias
    AFTER INSERT OR UPDATE OR DELETE ON ocorrencias
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_historico_cargos ON historico_cargos;
CREATE TRIGGER audit_historico_cargos
    AFTER INSERT OR UPDATE OR DELETE ON historico_cargos
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_avaliacoes_desempenho ON avaliacoes_desempenho;
CREATE TRIGGER audit_avaliacoes_desempenho
    AFTER INSERT OR UPDATE OR DELETE ON avaliacoes_desempenho
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- ============================================================
-- 3. Trigger para manter ferias.dias_restantes sincronizado
--    com dias_direito - dias_utilizados - dias_abono
-- ============================================================
CREATE OR REPLACE FUNCTION sync_ferias_dias_restantes()
RETURNS TRIGGER AS $$
BEGIN
    NEW.dias_restantes := NEW.dias_direito - NEW.dias_utilizados - NEW.dias_abono;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_ferias_dias ON ferias;
CREATE TRIGGER sync_ferias_dias
    BEFORE INSERT OR UPDATE OF dias_direito, dias_utilizados, dias_abono ON ferias
    FOR EACH ROW EXECUTE FUNCTION sync_ferias_dias_restantes();

INSERT INTO schema_migrations (version)
SELECT '092_gestao_pessoas_auditoria_e_fixes'
WHERE NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '092_gestao_pessoas_auditoria_e_fixes'
);
