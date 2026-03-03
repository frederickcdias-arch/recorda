-- Migration: 026_add_email_to_colaboradores
-- Descrição: Adicionar coluna `email` na tabela `colaboradores`

ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_email ON colaboradores (email);

INSERT INTO schema_migrations (version) VALUES ('026_add_email_to_colaboradores');
