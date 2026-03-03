-- Migration: 037_recebimento_documentos_ocr
-- Description: Documentos de recebimento com suporte a OCR assistido.

CREATE TABLE IF NOT EXISTS recebimento_documentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repositorio_id UUID NOT NULL,
  processo VARCHAR(120) NOT NULL,
  interessado VARCHAR(255) NOT NULL,
  numero_caixas INTEGER NOT NULL DEFAULT 1,
  volume VARCHAR(50) NOT NULL DEFAULT '1',
  caixa_nova BOOLEAN NOT NULL DEFAULT FALSE,
  origem VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  ocr_confianca NUMERIC(5, 4),
  texto_extraido TEXT NOT NULL DEFAULT '',
  imagem_path VARCHAR(500),
  criado_por UUID NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_receb_doc_repositorio
    FOREIGN KEY (repositorio_id)
    REFERENCES repositorios(id_repositorio_recorda)
    ON DELETE CASCADE,
  CONSTRAINT fk_receb_doc_usuario
    FOREIGN KEY (criado_por)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT receb_doc_processo_not_empty CHECK (LENGTH(TRIM(processo)) > 0),
  CONSTRAINT receb_doc_interessado_not_empty CHECK (LENGTH(TRIM(interessado)) > 0),
  CONSTRAINT receb_doc_numero_caixas_positive CHECK (numero_caixas > 0),
  CONSTRAINT receb_doc_origem_valid CHECK (origem IN ('MANUAL', 'OCR', 'LEGADO')),
  CONSTRAINT receb_doc_ocr_range CHECK (ocr_confianca IS NULL OR (ocr_confianca >= 0 AND ocr_confianca <= 1))
);

CREATE INDEX IF NOT EXISTS idx_receb_doc_repositorio_data ON recebimento_documentos (repositorio_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_receb_doc_origem ON recebimento_documentos (origem);

DROP TRIGGER IF EXISTS audit_recebimento_documentos ON recebimento_documentos;
CREATE TRIGGER audit_recebimento_documentos
  AFTER INSERT OR UPDATE OR DELETE ON recebimento_documentos
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();
