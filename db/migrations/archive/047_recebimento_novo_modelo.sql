-- Migration: 047_recebimento_novo_modelo
-- Description: Novo modelo de recebimento com suporte completo a processos, volumes e apensos.
-- Extrai campos da capa amarela (etiqueta de protocolo) via OCR.

-- ============================================================
-- 1. Processo principal do recebimento
-- ============================================================
CREATE TABLE IF NOT EXISTS recebimento_processos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repositorio_id UUID NOT NULL,

  -- Dados extraídos da capa amarela
  protocolo VARCHAR(60) NOT NULL,            -- ex: 502824/2021
  data_protocolo TIMESTAMP WITH TIME ZONE,   -- ex: 26/10/2021 16:12
  orgao VARCHAR(500),                        -- ex: Governo do Estado de Mato Grosso - SECRETARIA DE ESTADO DO MEIO AMBIENTE
  interessado VARCHAR(500) NOT NULL,         -- ex: JBS S/A
  assunto VARCHAR(1000),                     -- ex: 256 FISCALIZAÇÃO AMBIENTAL (FISCAL
  resumo TEXT,                               -- ex: REF. AUTO DE INFRAÇÃO N 213433801 ...
  setor_origem VARCHAR(500),                 -- ex: GPROT – GER. DE PROTOCOLO
  setor_destino VARCHAR(500),                -- ex: SGPA – SUP. GEST. PROC. ADM. E AUTOS DE
  codigo_barras VARCHAR(100),                -- ex: 0000110837770

  -- Controle de volumes
  volume_atual INTEGER NOT NULL DEFAULT 1,   -- Volume X (de Y)
  volume_total INTEGER NOT NULL DEFAULT 0,   -- Volume X de Y (0 = volume único)

  -- Controle de caixas
  numero_caixas INTEGER NOT NULL DEFAULT 1,
  caixa_nova BOOLEAN NOT NULL DEFAULT FALSE,

  -- OCR metadata
  origem VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  ocr_confianca NUMERIC(5, 4),
  texto_extraido TEXT NOT NULL DEFAULT '',
  imagem_path VARCHAR(500),

  -- Auditoria
  criado_por UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_receb_proc_repositorio
    FOREIGN KEY (repositorio_id)
    REFERENCES repositorios(id_repositorio_recorda)
    ON DELETE CASCADE,
  CONSTRAINT fk_receb_proc_usuario
    FOREIGN KEY (criado_por)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT receb_proc_protocolo_not_empty CHECK (LENGTH(TRIM(protocolo)) > 0),
  CONSTRAINT receb_proc_interessado_not_empty CHECK (LENGTH(TRIM(interessado)) > 0),
  CONSTRAINT receb_proc_origem_valid CHECK (origem IN ('MANUAL', 'OCR', 'LEGADO')),
  CONSTRAINT receb_proc_volume_atual_positive CHECK (volume_atual > 0),
  CONSTRAINT receb_proc_volume_total_non_negative CHECK (volume_total >= 0),
  CONSTRAINT receb_proc_numero_caixas_positive CHECK (numero_caixas > 0)
);

CREATE INDEX IF NOT EXISTS idx_receb_proc_repositorio ON recebimento_processos (repositorio_id);
CREATE INDEX IF NOT EXISTS idx_receb_proc_protocolo ON recebimento_processos (protocolo);
CREATE INDEX IF NOT EXISTS idx_receb_proc_interessado ON recebimento_processos (interessado);
CREATE INDEX IF NOT EXISTS idx_receb_proc_criado_em ON recebimento_processos (criado_em DESC);

-- ============================================================
-- 2. Volumes adicionais de um processo
--    O volume_atual/volume_total no processo principal registra
--    o primeiro volume escaneado. Volumes extras ficam aqui.
-- ============================================================
CREATE TABLE IF NOT EXISTS recebimento_volumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  processo_id UUID NOT NULL,

  numero_volume INTEGER NOT NULL,            -- ex: 2 (de 3)
  volume_total INTEGER NOT NULL DEFAULT 0,   -- ex: 3 (0 = único)

  -- OCR metadata do volume
  ocr_confianca NUMERIC(5, 4),
  texto_extraido TEXT NOT NULL DEFAULT '',
  imagem_path VARCHAR(500),
  origem VARCHAR(20) NOT NULL DEFAULT 'MANUAL',

  observacao TEXT NOT NULL DEFAULT '',

  criado_por UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_receb_vol_processo
    FOREIGN KEY (processo_id)
    REFERENCES recebimento_processos(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_receb_vol_usuario
    FOREIGN KEY (criado_por)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT receb_vol_numero_positive CHECK (numero_volume > 0),
  CONSTRAINT receb_vol_origem_valid CHECK (origem IN ('MANUAL', 'OCR', 'LEGADO'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receb_vol_processo_numero ON recebimento_volumes (processo_id, numero_volume);
CREATE INDEX IF NOT EXISTS idx_receb_vol_processo ON recebimento_volumes (processo_id);

-- ============================================================
-- 3. Processos apensos vinculados a um processo principal
--    Cada apenso pode ter seus próprios volumes.
-- ============================================================
CREATE TABLE IF NOT EXISTS recebimento_apensos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  processo_principal_id UUID NOT NULL,

  -- Dados do apenso (mesma estrutura da capa amarela)
  protocolo VARCHAR(60) NOT NULL,
  data_protocolo TIMESTAMP WITH TIME ZONE,
  interessado VARCHAR(500),
  assunto VARCHAR(1000),
  resumo TEXT,
  setor_origem VARCHAR(500),
  setor_destino VARCHAR(500),
  codigo_barras VARCHAR(100),

  -- Volumes do apenso
  volume_atual INTEGER NOT NULL DEFAULT 1,
  volume_total INTEGER NOT NULL DEFAULT 0,

  -- OCR metadata
  origem VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  ocr_confianca NUMERIC(5, 4),
  texto_extraido TEXT NOT NULL DEFAULT '',
  imagem_path VARCHAR(500),

  observacao TEXT NOT NULL DEFAULT '',

  criado_por UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_receb_apenso_principal
    FOREIGN KEY (processo_principal_id)
    REFERENCES recebimento_processos(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_receb_apenso_usuario
    FOREIGN KEY (criado_por)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT receb_apenso_protocolo_not_empty CHECK (LENGTH(TRIM(protocolo)) > 0),
  CONSTRAINT receb_apenso_origem_valid CHECK (origem IN ('MANUAL', 'OCR', 'LEGADO')),
  CONSTRAINT receb_apenso_volume_atual_positive CHECK (volume_atual > 0),
  CONSTRAINT receb_apenso_volume_total_non_negative CHECK (volume_total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_receb_apenso_principal ON recebimento_apensos (processo_principal_id);
CREATE INDEX IF NOT EXISTS idx_receb_apenso_protocolo ON recebimento_apensos (protocolo);

-- ============================================================
-- 4. Volumes de apensos (mesma lógica de recebimento_volumes)
-- ============================================================
CREATE TABLE IF NOT EXISTS recebimento_apenso_volumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apenso_id UUID NOT NULL,

  numero_volume INTEGER NOT NULL,
  volume_total INTEGER NOT NULL DEFAULT 0,

  ocr_confianca NUMERIC(5, 4),
  texto_extraido TEXT NOT NULL DEFAULT '',
  imagem_path VARCHAR(500),
  origem VARCHAR(20) NOT NULL DEFAULT 'MANUAL',

  observacao TEXT NOT NULL DEFAULT '',

  criado_por UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_receb_apvol_apenso
    FOREIGN KEY (apenso_id)
    REFERENCES recebimento_apensos(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_receb_apvol_usuario
    FOREIGN KEY (criado_por)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT receb_apvol_numero_positive CHECK (numero_volume > 0),
  CONSTRAINT receb_apvol_origem_valid CHECK (origem IN ('MANUAL', 'OCR', 'LEGADO'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receb_apvol_apenso_numero ON recebimento_apenso_volumes (apenso_id, numero_volume);
CREATE INDEX IF NOT EXISTS idx_receb_apvol_apenso ON recebimento_apenso_volumes (apenso_id);

-- ============================================================
-- 5. Migrar dados existentes de recebimento_documentos
-- ============================================================
INSERT INTO recebimento_processos (
  repositorio_id, protocolo, interessado, numero_caixas, volume_atual, volume_total,
  caixa_nova, origem, ocr_confianca, texto_extraido, imagem_path, criado_por, criado_em
)
SELECT
  repositorio_id,
  processo,
  interessado,
  numero_caixas,
  CASE
    WHEN volume ~ '^\d+$' THEN CAST(volume AS INTEGER)
    ELSE 1
  END,
  0,
  caixa_nova,
  origem,
  ocr_confianca,
  texto_extraido,
  imagem_path,
  criado_por,
  criado_em
FROM recebimento_documentos;

-- ============================================================
-- 6. Audit triggers
-- ============================================================
DROP TRIGGER IF EXISTS audit_recebimento_processos ON recebimento_processos;
CREATE TRIGGER audit_recebimento_processos
  AFTER INSERT OR UPDATE OR DELETE ON recebimento_processos
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_recebimento_volumes ON recebimento_volumes;
CREATE TRIGGER audit_recebimento_volumes
  AFTER INSERT OR UPDATE OR DELETE ON recebimento_volumes
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_recebimento_apensos ON recebimento_apensos;
CREATE TRIGGER audit_recebimento_apensos
  AFTER INSERT OR UPDATE OR DELETE ON recebimento_apensos
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_recebimento_apenso_volumes ON recebimento_apenso_volumes;
CREATE TRIGGER audit_recebimento_apenso_volumes
  AFTER INSERT OR UPDATE OR DELETE ON recebimento_apenso_volumes
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

INSERT INTO schema_migrations (version) VALUES ('047_recebimento_novo_modelo');
