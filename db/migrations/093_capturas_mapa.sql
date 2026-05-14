-- Migration 093: Tabela de capturas de mapa (colaboradores)
-- Armazena referências a imagens de mapas capturadas pelo colaborador.
-- Expira automaticamente após 30 dias (limpeza feita pela aplicação).

CREATE TABLE IF NOT EXISTS capturas_mapa (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id    UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  arquivo_path  TEXT        NOT NULL,
  nome_arquivo  TEXT        NOT NULL,
  tamanho_bytes INTEGER,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_capturas_mapa_usuario ON capturas_mapa(usuario_id);
CREATE INDEX IF NOT EXISTS idx_capturas_mapa_expira ON capturas_mapa(expira_em);
