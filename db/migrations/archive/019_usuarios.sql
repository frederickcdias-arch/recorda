-- Migration: 019_usuarios
-- Descrição: Tabela de usuários para autenticação
-- Data: 2026-01-28

-- Enum para perfil de usuário
CREATE TYPE perfil_usuario AS ENUM ('operador', 'supervisor', 'administrador');

-- Tabela de usuários
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    perfil perfil_usuario NOT NULL DEFAULT 'operador',
    coordenadoria_id UUID REFERENCES coordenadorias(id) ON DELETE SET NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    ultimo_acesso TIMESTAMP WITH TIME ZONE,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT usuarios_nome_not_empty CHECK (LENGTH(TRIM(nome)) >= 2),
    CONSTRAINT usuarios_email_valid CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Índices
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_perfil ON usuarios(perfil);
CREATE INDEX idx_usuarios_coordenadoria ON usuarios(coordenadoria_id);
CREATE INDEX idx_usuarios_ativos ON usuarios(ativo) WHERE ativo = true;

-- Função utilitária para atualizar o timestamp automaticamente
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger de atualização
CREATE TRIGGER update_usuarios_timestamp
    BEFORE UPDATE ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Trigger de auditoria
CREATE TRIGGER audit_usuarios
    AFTER INSERT OR UPDATE OR DELETE ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- Tabela de refresh tokens
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expira_em TIMESTAMP WITH TIME ZONE NOT NULL,
    revogado BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT refresh_tokens_expira_futuro CHECK (expira_em > criado_em)
);

CREATE INDEX idx_refresh_tokens_usuario ON refresh_tokens(usuario_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_validos ON refresh_tokens(usuario_id, revogado) WHERE revogado = false;

-- Inserir usuário administrador padrão (senha: admin123)
-- Hash gerado com bcrypt, rounds=10
INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES 
('Administrador', 'admin@recorda.local', '$2b$10$BbJ7SZ6Dy8ubdI28/XVZau979nJQj8I4w8wUehieHqEdXrhy0TUca', 'administrador');

COMMENT ON TABLE usuarios IS 'Usuários do sistema com autenticação';
COMMENT ON TABLE refresh_tokens IS 'Tokens de refresh para renovação de sessão';
