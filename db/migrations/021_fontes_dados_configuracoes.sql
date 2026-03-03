-- Migration: 021_fontes_dados_configuracoes
-- Description: Adiciona campos para configurações específicas por tipo e upload de arquivos

-- Adicionar tipo OCR ao enum
ALTER TYPE tipo_fonte ADD VALUE IF NOT EXISTS 'OCR';

-- Adicionar campos para configurações específicas por tipo
ALTER TABLE fontes_dados 
ADD COLUMN IF NOT EXISTS configuracoes JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS arquivo_planilha_path TEXT,
ADD COLUMN IF NOT EXISTS arquivo_ocr_path TEXT,
ADD COLUMN IF NOT EXISTS mapeamento_colunas JSONB;

-- Adicionar índices para os novos campos
CREATE INDEX IF NOT EXISTS idx_fontes_dados_configuracoes ON fontes_dados USING GIN (configuracoes);
CREATE INDEX IF NOT EXISTS idx_fontes_dados_arquivo_planilha ON fontes_dados (arquivo_planilha_path) WHERE arquivo_planilha_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fontes_dados_arquivo_ocr ON fontes_dados (arquivo_ocr_path) WHERE arquivo_ocr_path IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('021_fontes_dados_configuracoes');
