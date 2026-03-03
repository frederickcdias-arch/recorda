-- Migration 077: classificação padrão por repositório
-- Permite definir a classificação na criação do repositório e reutilizar nos processos do recebimento.

ALTER TABLE repositorios
  ADD COLUMN IF NOT EXISTS classificacao_padrao_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_repositorio_classificacao_padrao'
  ) THEN
    ALTER TABLE repositorios
      ADD CONSTRAINT fk_repositorio_classificacao_padrao
      FOREIGN KEY (classificacao_padrao_id)
      REFERENCES classificacoes_recebimento(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_repositorios_classificacao_padrao
  ON repositorios (classificacao_padrao_id);

INSERT INTO schema_migrations (version) VALUES ('077_repositorio_classificacao_padrao');
