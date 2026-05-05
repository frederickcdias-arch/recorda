-- Migration: 085_logo_in_database
-- Description: Armazena a logo da empresa diretamente no banco de dados
-- para garantir persistência em ambientes com filesystem efêmero (ex: Railway).

ALTER TABLE configuracao_empresa
  ADD COLUMN IF NOT EXISTS logo_data BYTEA,
  ADD COLUMN IF NOT EXISTS logo_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS logo_atualizado_em TIMESTAMPTZ;
