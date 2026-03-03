-- Migration 074: Allow cq_avaliacoes to reference both recebimento_processos and recebimento_apensos
-- The FK processo_id -> recebimento_processos prevents evaluating apensos in CQ.
-- Solution: drop the FK constraint and add is_apenso flag to distinguish the source table.

ALTER TABLE cq_avaliacoes DROP CONSTRAINT IF EXISTS cq_avaliacoes_processo_id_fkey;

ALTER TABLE cq_avaliacoes ADD COLUMN IF NOT EXISTS is_apenso BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO schema_migrations (version) VALUES ('074_cq_avaliacoes_aceitar_apensos')
  ON CONFLICT (version) DO NOTHING;
