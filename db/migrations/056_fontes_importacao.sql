-- Saved import sources (Google Sheets links) for quick re-import
CREATE TABLE IF NOT EXISTS fontes_importacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  url TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'sheets', -- 'sheets' for now, extensible
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_importacao_em TIMESTAMPTZ
);
