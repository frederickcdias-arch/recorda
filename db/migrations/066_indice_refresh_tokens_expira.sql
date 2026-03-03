-- Migration 066: Partial index on refresh_tokens(expira_em) for cleanup queries
-- Rationale: The periodic cleanup job runs:
--   DELETE FROM refresh_tokens WHERE expira_em < NOW() AND revogado = FALSE
-- Without an index on expira_em, this is a full table scan.
-- The partial index (WHERE revogado = FALSE) keeps it small and fast.

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expira_em
  ON refresh_tokens (expira_em)
  WHERE revogado = FALSE;

INSERT INTO schema_migrations (version) VALUES ('066_indice_refresh_tokens_expira')
  ON CONFLICT (version) DO NOTHING;
