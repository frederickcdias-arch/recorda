-- Migration: 096_push_subscriptions
-- Descricao: Cria estrutura para subscriptions de push notification do PWA
-- Data: 2026-05-20

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time TIMESTAMPTZ,
  user_agent TEXT,
  device_label VARCHAR(120),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_push_subscriptions_usuario_ativo
  ON push_subscriptions (usuario_id, ativo, atualizado_em DESC);

CREATE INDEX idx_push_subscriptions_endpoint_ativo
  ON push_subscriptions (endpoint, ativo);

CREATE TRIGGER update_push_subscriptions_timestamp
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER audit_push_subscriptions
  AFTER INSERT OR UPDATE OR DELETE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

COMMENT ON TABLE push_subscriptions IS 'Subscriptions Web Push por usuario/dispositivo do PWA';

INSERT INTO schema_migrations (version) VALUES ('096_push_subscriptions')
  ON CONFLICT (version) DO NOTHING;
