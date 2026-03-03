-- Migration 062: cq_avaliacoes.resultado VARCHAR(20)+CHECK → ENUM resultado_cq_item
-- Rationale: resultado_cq_item ENUM already exists with identical values
-- ('PENDENTE','APROVADO','REPROVADO'). Using VARCHAR+CHECK is inconsistent
-- with lotes_controle_qualidade_itens.resultado which already uses the ENUM.

ALTER TABLE cq_avaliacoes
  ALTER COLUMN resultado TYPE resultado_cq_item
  USING resultado::resultado_cq_item;

ALTER TABLE cq_avaliacoes
  DROP CONSTRAINT IF EXISTS cq_avaliacoes_resultado_check;

INSERT INTO schema_migrations (version) VALUES ('062_cq_avaliacoes_resultado_enum')
  ON CONFLICT (version) DO NOTHING;
