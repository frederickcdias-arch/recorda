-- Migration: 088_fix_version_066_indice
-- Descrição: Limpa o registro duplicado de versão '066_indice_refresh_tokens_expira'
--            em bancos existentes onde esse nome foi registrado em schema_migrations.
--            O índice em si já existe (criado pela 066 ou pela 087) — esta migration
--            apenas normaliza a tabela de controle de versões.
-- Data: 2026-05-08

-- Em bancos onde a versão '087_indice_refresh_tokens_expira' ainda não existe,
-- renomeia o registro antigo. Caso ambas já existam, remove o duplicado antigo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '066_indice_refresh_tokens_expira') THEN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '087_indice_refresh_tokens_expira') THEN
      UPDATE schema_migrations
        SET version = '087_indice_refresh_tokens_expira'
      WHERE version = '066_indice_refresh_tokens_expira';
    ELSE
      DELETE FROM schema_migrations WHERE version = '066_indice_refresh_tokens_expira';
    END IF;
  END IF;
END;
$$;

INSERT INTO schema_migrations (version) VALUES ('088_fix_version_066_indice')
  ON CONFLICT (version) DO NOTHING;
