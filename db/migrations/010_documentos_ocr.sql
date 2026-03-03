-- Migration: 010_documentos_ocr
-- Description: Tabela de documentos para OCR

CREATE TYPE status_ocr AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO');

CREATE TABLE documentos_ocr (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    processo_id UUID NOT NULL,
    volume_id UUID,
    caminho_arquivo VARCHAR(1000) NOT NULL,
    status status_ocr NOT NULL DEFAULT 'PENDENTE',
    texto_extraido TEXT,
    data_upload TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_processamento TIMESTAMP WITH TIME ZONE,
    erro TEXT,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT documentos_caminho_not_empty CHECK (LENGTH(TRIM(caminho_arquivo)) > 0),
    CONSTRAINT documentos_data_upload_not_future CHECK (data_upload <= CURRENT_TIMESTAMP),
    CONSTRAINT documentos_data_processamento_not_future CHECK (data_processamento IS NULL OR data_processamento <= CURRENT_TIMESTAMP),
    CONSTRAINT documentos_status_consistency CHECK (
        (status = 'PENDENTE' AND texto_extraido IS NULL AND data_processamento IS NULL AND erro IS NULL) OR
        (status = 'PROCESSANDO' AND texto_extraido IS NULL AND erro IS NULL) OR
        (status = 'CONCLUIDO' AND texto_extraido IS NOT NULL AND data_processamento IS NOT NULL AND erro IS NULL) OR
        (status = 'ERRO' AND data_processamento IS NOT NULL AND erro IS NOT NULL)
    ),
    CONSTRAINT fk_documentos_processo 
        FOREIGN KEY (processo_id) 
        REFERENCES processos_principais(id) 
        ON DELETE RESTRICT,
    CONSTRAINT fk_documentos_volume 
        FOREIGN KEY (volume_id) 
        REFERENCES volumes(id) 
        ON DELETE RESTRICT
);

CREATE INDEX idx_documentos_processo ON documentos_ocr (processo_id);
CREATE INDEX idx_documentos_volume ON documentos_ocr (volume_id) WHERE volume_id IS NOT NULL;
CREATE INDEX idx_documentos_status ON documentos_ocr (status);
CREATE INDEX idx_documentos_data_upload ON documentos_ocr (data_upload);
CREATE INDEX idx_documentos_pendentes ON documentos_ocr (data_upload) WHERE status = 'PENDENTE';

INSERT INTO schema_migrations (version) VALUES ('010_documentos_ocr');
