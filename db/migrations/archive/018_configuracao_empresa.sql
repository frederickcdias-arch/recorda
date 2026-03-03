-- Migration: Configuração da Empresa
-- Tabela para armazenar dados da empresa que aparecem nos relatórios

CREATE TABLE IF NOT EXISTS configuracao_empresa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(200) NOT NULL DEFAULT '',
    cnpj VARCHAR(20) DEFAULT '',
    endereco TEXT DEFAULT '',
    telefone VARCHAR(30) DEFAULT '',
    email VARCHAR(100) DEFAULT '',
    logo_url TEXT DEFAULT '',
    exibir_logo_relatorio BOOLEAN DEFAULT TRUE,
    exibir_endereco_relatorio BOOLEAN DEFAULT TRUE,
    exibir_contato_relatorio BOOLEAN DEFAULT TRUE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Garantir que só existe uma linha de configuração
CREATE UNIQUE INDEX IF NOT EXISTS idx_configuracao_empresa_singleton ON configuracao_empresa ((TRUE));

-- Inserir configuração padrão se não existir
INSERT INTO configuracao_empresa (nome) 
SELECT '' WHERE NOT EXISTS (SELECT 1 FROM configuracao_empresa);
