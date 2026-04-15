-- Migration: 066_add_perfil_colaborador
-- Descrição: Adiciona perfil 'colaborador' ao enum perfil_usuario
-- Data: 2026-04-15

-- Adicionar novo valor ao enum perfil_usuario
ALTER TYPE perfil_usuario ADD VALUE IF NOT EXISTS 'colaborador';

-- Comentário explicativo
COMMENT ON TYPE perfil_usuario IS 'Perfis de usuário: colaborador (apenas lança produção e visualiza próprio histórico), operador, supervisor, administrador';

INSERT INTO schema_migrations (version) VALUES ('066_add_perfil_colaborador')
  ON CONFLICT (version) DO NOTHING;
