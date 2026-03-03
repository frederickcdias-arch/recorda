-- New CQ system: per-document evaluation instead of per-repository lote.
-- Each document (recebimento_processos) gets individually approved/rejected with observations.

-- Table for per-document CQ evaluations
CREATE TABLE IF NOT EXISTS cq_avaliacoes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    repositorio_id uuid NOT NULL REFERENCES repositorios(id_repositorio_recorda) ON DELETE CASCADE,
    processo_id uuid NOT NULL REFERENCES recebimento_processos(id) ON DELETE CASCADE,
    resultado VARCHAR(20) NOT NULL CHECK (resultado IN ('PENDENTE', 'APROVADO', 'REPROVADO')),
    observacao TEXT,
    avaliador_id uuid REFERENCES usuarios(id),
    data_avaliacao TIMESTAMP WITH TIME ZONE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(repositorio_id, processo_id)
);

CREATE INDEX IF NOT EXISTS idx_cq_avaliacoes_repositorio ON cq_avaliacoes(repositorio_id);
CREATE INDEX IF NOT EXISTS idx_cq_avaliacoes_resultado ON cq_avaliacoes(resultado);

-- Move repos in ENTREGA back to CQ (we're removing the Entrega stage)
ALTER TABLE repositorios DISABLE TRIGGER trigger_validar_avanco_etapa_repositorio;

UPDATE repositorios
SET etapa_atual = 'CONTROLE_QUALIDADE',
    status_atual = 'AGUARDANDO_CQ_LOTE'
WHERE etapa_atual = 'ENTREGA';

ALTER TABLE repositorios ENABLE TRIGGER trigger_validar_avanco_etapa_repositorio;

-- Update the CQ result trigger: APROVADO repos stay in CQ with CQ_APROVADO status (no more ENTREGA)
CREATE OR REPLACE FUNCTION public.fn_aplicar_resultado_cq_em_repositorios() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  item RECORD;
BEGIN
  IF NEW.status = 'FECHADO' AND OLD.status <> NEW.status THEN
    FOR item IN
      SELECT repositorio_id, resultado
      FROM lotes_controle_qualidade_itens
      WHERE lote_id = NEW.id
    LOOP
      IF item.resultado = 'APROVADO' THEN
        UPDATE repositorios
        SET status_atual = 'CQ_APROVADO'
        WHERE id_repositorio_recorda = item.repositorio_id;

        INSERT INTO historico_etapas (
          repositorio_id, etapa_origem, etapa_destino,
          status_origem, status_destino, usuario_id, detalhes
        ) VALUES (
          item.repositorio_id, 'CONTROLE_QUALIDADE', 'CONTROLE_QUALIDADE',
          'EM_CQ', 'CQ_APROVADO', NEW.auditor_id,
          jsonb_build_object('origem', 'lote_cq', 'lote_id', NEW.id)
        );
      ELSIF item.resultado = 'REPROVADO' THEN
        UPDATE repositorios
        SET status_atual = 'CQ_REPROVADO'
        WHERE id_repositorio_recorda = item.repositorio_id;

        INSERT INTO historico_etapas (
          repositorio_id, etapa_origem, etapa_destino,
          status_origem, status_destino, usuario_id, detalhes
        ) VALUES (
          item.repositorio_id, 'CONTROLE_QUALIDADE', 'CONTROLE_QUALIDADE',
          'EM_CQ', 'CQ_REPROVADO', NEW.auditor_id,
          jsonb_build_object('origem', 'lote_cq', 'lote_id', NEW.id)
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
