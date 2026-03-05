-- Migration 083: Configuracao de layout da logo nos relatorios

ALTER TABLE configuracao_empresa
  ADD COLUMN IF NOT EXISTS logo_largura_relatorio INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS logo_alinhamento_relatorio VARCHAR(10) NOT NULL DEFAULT 'CENTRO',
  ADD COLUMN IF NOT EXISTS logo_deslocamento_y_relatorio INTEGER NOT NULL DEFAULT 0;

UPDATE configuracao_empresa
SET
  logo_largura_relatorio = LEAST(GREATEST(COALESCE(logo_largura_relatorio, 120), 60), 260),
  logo_deslocamento_y_relatorio = LEAST(GREATEST(COALESCE(logo_deslocamento_y_relatorio, 0), -20), 40),
  logo_alinhamento_relatorio = CASE
    WHEN UPPER(COALESCE(logo_alinhamento_relatorio, 'CENTRO')) IN ('ESQUERDA', 'CENTRO', 'DIREITA')
      THEN UPPER(logo_alinhamento_relatorio)
    ELSE 'CENTRO'
  END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_configuracao_empresa_logo_largura_relatorio'
  ) THEN
    ALTER TABLE configuracao_empresa
      ADD CONSTRAINT chk_configuracao_empresa_logo_largura_relatorio
      CHECK (logo_largura_relatorio BETWEEN 60 AND 260);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_configuracao_empresa_logo_offset_relatorio'
  ) THEN
    ALTER TABLE configuracao_empresa
      ADD CONSTRAINT chk_configuracao_empresa_logo_offset_relatorio
      CHECK (logo_deslocamento_y_relatorio BETWEEN -20 AND 40);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_configuracao_empresa_logo_alinhamento_relatorio'
  ) THEN
    ALTER TABLE configuracao_empresa
      ADD CONSTRAINT chk_configuracao_empresa_logo_alinhamento_relatorio
      CHECK (logo_alinhamento_relatorio IN ('ESQUERDA', 'CENTRO', 'DIREITA'));
  END IF;
END $$;

INSERT INTO schema_migrations (version)
VALUES ('083_logo_layout_relatorios')
ON CONFLICT (version) DO NOTHING;
