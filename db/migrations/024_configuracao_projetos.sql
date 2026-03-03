-- Migration: Configuração de Projetos
-- Armazena projetos internos exibidos na área de configurações do sistema

CREATE TABLE IF NOT EXISTS configuracao_projetos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(200) NOT NULL,
    descricao TEXT DEFAULT '',
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_configuracao_projetos_ativo ON configuracao_projetos (ativo);
