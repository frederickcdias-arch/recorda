-- Migration: 089_password_reset_tokens
-- Descrição: Cria tabela dedicada para tokens de redefinição de senha,
--            separando a responsabilidade de refresh_tokens (autenticação)
--            de password_reset_tokens (recuperação de senha).
-- Data: 2026-05-08

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  varchar(255) NOT NULL UNIQUE,
  expira_em   timestamptz NOT NULL,
  usado       boolean NOT NULL DEFAULT false,
  criado_em   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prt_usuario_id   ON password_reset_tokens (usuario_id);
CREATE INDEX IF NOT EXISTS idx_prt_token_hash   ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_expira_em    ON password_reset_tokens (expira_em) WHERE usado = false;

-- Remover registros de reset que foram armazenados na tabela refresh_tokens
-- usando o prefixo 'reset:' (padrão da implementação anterior).
DELETE FROM refresh_tokens WHERE token_hash LIKE 'reset:%';

INSERT INTO schema_migrations (version) VALUES ('089_password_reset_tokens')
  ON CONFLICT (version) DO NOTHING;
