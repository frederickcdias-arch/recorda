-- Migration: 099_ausencias_documento_anexo_text
-- Description: Amplia a coluna documento_anexo para armazenar data URLs e referências legadas completas.

ALTER TABLE ausencias
  ALTER COLUMN documento_anexo TYPE TEXT;
