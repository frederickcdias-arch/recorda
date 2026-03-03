-- Simplify workflow: only Recebimento → CQ → Entrega.
-- Move all repositories in intermediate stages to CONTROLE_QUALIDADE.
-- Temporarily disable the validation trigger that requires concluded checklists.

ALTER TABLE repositorios DISABLE TRIGGER trigger_validar_avanco_etapa_repositorio;

UPDATE repositorios
SET etapa_atual = 'CONTROLE_QUALIDADE',
    status_atual = 'AGUARDANDO_CQ_LOTE'
WHERE etapa_atual IN ('PREPARACAO', 'DIGITALIZACAO', 'CONFERENCIA', 'MONTAGEM');

ALTER TABLE repositorios ENABLE TRIGGER trigger_validar_avanco_etapa_repositorio;
