-- Migration: 020_fontes_dados_api
-- Description: Adiciona campos para configuração de API nas fontes de dados

-- Adicionar tipo API ao enum
ALTER TYPE tipo_fonte ADD VALUE IF NOT EXISTS 'API';

-- Adicionar campos para configuração de API
ALTER TABLE fontes_dados 
ADD COLUMN IF NOT EXISTS url_api TEXT,
ADD COLUMN IF NOT EXISTS headers_api JSONB,
ADD COLUMN IF NOT EXISTS frequencia_sync VARCHAR(50);

-- Adicionar campo data_criacao em registros_producao se não existir
ALTER TABLE registros_producao 
ADD COLUMN IF NOT EXISTS data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

INSERT INTO schema_migrations (version) VALUES ('020_fontes_dados_api');
