-- Migration: 098_add_perfil_visualizador
-- Descrição: adiciona perfil somente leitura 'visualizador' ao enum perfil_usuario

ALTER TYPE perfil_usuario ADD VALUE IF NOT EXISTS 'visualizador';

COMMENT ON TYPE perfil_usuario IS 'Perfis de usuário: visualizador (somente leitura), colaborador, operador, supervisor, administrador';

INSERT INTO schema_migrations (version) VALUES ('098_add_perfil_visualizador')
ON CONFLICT (version) DO NOTHING;
