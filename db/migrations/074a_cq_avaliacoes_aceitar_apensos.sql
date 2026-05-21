-- Migration 074a: Allow cq_avaliacoes to reference both recebimento_processos and recebimento_apensos
-- Legacy compatibility: this migration used to be versioned as 074_cq_avaliacoes_aceitar_apensos.
-- The migration runner treats that old version as an alias to avoid reapplying it in existing databases.

ALTER TABLE cq_avaliacoes DROP CONSTRAINT IF EXISTS cq_avaliacoes_processo_id_fkey;

ALTER TABLE cq_avaliacoes ADD COLUMN IF NOT EXISTS is_apenso BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO schema_migrations (version) VALUES ('074a_cq_avaliacoes_aceitar_apensos')
  ON CONFLICT (version) DO NOTHING;
