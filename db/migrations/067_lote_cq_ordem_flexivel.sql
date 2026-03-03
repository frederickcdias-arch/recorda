-- Migration 067: Remove hardcoded batch size from lotes_controle_qualidade_itens
-- Rationale: CHECK (ordem BETWEEN 1 AND 10) hardcodes the CQ batch size in the schema.
-- If the business rule changes (e.g. batches of 5 or 20), a schema migration is required.
-- Validation of batch size belongs in the application layer (Zod schema).
-- Also update fn_validar_fechamento_lote_cq to use a configurable constant via
-- a GUC parameter (app.cq_lote_tamanho) with fallback to 10.

-- 1. Remove the hardcoded range constraint, keep only positivity
ALTER TABLE lotes_controle_qualidade_itens
  DROP CONSTRAINT IF EXISTS lote_item_ordem_range;

ALTER TABLE lotes_controle_qualidade_itens
  ADD CONSTRAINT lote_item_ordem_positive CHECK (ordem > 0);

-- 2. Update the closure trigger to read batch size from GUC with fallback to 10
CREATE OR REPLACE FUNCTION fn_validar_fechamento_lote_cq()
RETURNS TRIGGER AS $$
DECLARE
  total_itens INTEGER;
  total_pendentes INTEGER;
  tamanho_lote INTEGER;
BEGIN
  IF NEW.status = 'FECHADO' AND OLD.status <> NEW.status THEN
    -- Read configurable batch size; default to 10 if not set
    BEGIN
      tamanho_lote := current_setting('app.cq_lote_tamanho', true)::INTEGER;
      IF tamanho_lote IS NULL OR tamanho_lote <= 0 THEN
        tamanho_lote := 10;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      tamanho_lote := 10;
    END;

    SELECT COUNT(*) INTO total_itens
    FROM lotes_controle_qualidade_itens
    WHERE lote_id = NEW.id;

    IF total_itens <> tamanho_lote THEN
      RAISE EXCEPTION 'Lote de CQ deve conter exatamente % repositórios. Total atual: %', tamanho_lote, total_itens;
    END IF;

    SELECT COUNT(*) INTO total_pendentes
    FROM lotes_controle_qualidade_itens
    WHERE lote_id = NEW.id
      AND resultado = 'PENDENTE';

    IF total_pendentes > 0 THEN
      RAISE EXCEPTION 'Não é possível fechar lote de CQ com itens pendentes';
    END IF;

    NEW.data_fechamento := COALESCE(NEW.data_fechamento, CURRENT_TIMESTAMP);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO schema_migrations (version) VALUES ('067_lote_cq_ordem_flexivel')
  ON CONFLICT (version) DO NOTHING;
