-- Migration: 101_usuario_perfis
-- Descrição: permite múltiplos perfis por usuário

CREATE TABLE IF NOT EXISTS usuario_perfis (
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    perfil perfil_usuario NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, perfil)
);

CREATE INDEX IF NOT EXISTS idx_usuario_perfis_usuario ON usuario_perfis(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_perfis_perfil ON usuario_perfis(perfil);

INSERT INTO usuario_perfis (usuario_id, perfil)
SELECT id, perfil
FROM usuarios
ON CONFLICT (usuario_id, perfil) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('101_usuario_perfis')
ON CONFLICT (version) DO NOTHING;
