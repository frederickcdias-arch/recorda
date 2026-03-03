-- Migration 070: Composite partial index on recebimento_processos(setor_id, classificacao_id)
-- Rationale: Avulso listing queries frequently filter by setor AND classificacao simultaneously.
-- Separate indexes exist but a composite partial index (WHERE repositorio_id IS NULL)
-- covers the avulsos use-case specifically and stays small.

CREATE INDEX IF NOT EXISTS idx_receb_proc_setor_classif_avulso
  ON recebimento_processos (setor_id, classificacao_id)
  WHERE repositorio_id IS NULL;

INSERT INTO schema_migrations (version) VALUES ('070_indice_receb_proc_setor_classif')
  ON CONFLICT (version) DO NOTHING;
