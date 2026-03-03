-- Migration: 023_glossario
-- Descrição: Tabela de glossário de termos
-- Data: 2026-01-29

CREATE TABLE glossario (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    termo VARCHAR(200) NOT NULL,
    definicao TEXT NOT NULL,
    categoria VARCHAR(100),
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT glossario_termo_unique UNIQUE (termo)
);

-- Índices
CREATE INDEX idx_glossario_termo ON glossario(termo);
CREATE INDEX idx_glossario_categoria ON glossario(categoria);
CREATE INDEX idx_glossario_ativo ON glossario(ativo);

-- Trigger de atualização de timestamp
CREATE TRIGGER update_glossario_timestamp
    BEFORE UPDATE ON glossario
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Dados iniciais do glossário
INSERT INTO glossario (termo, definicao, categoria) VALUES
('Apenso', 'Processo que é anexado a outro processo principal, mantendo sua identidade própria mas tramitando em conjunto.', 'Processos'),
('Arquivamento', 'Ato de guardar documentos ou processos que não estão mais em tramitação ativa.', 'Processos'),
('Autuação', 'Ato de formar um processo, reunindo documentos e atribuindo um número de protocolo.', 'Processos'),
('Certidão', 'Documento que atesta a veracidade de informações constantes em registros públicos.', 'Documentos'),
('Coordenadoria', 'Unidade administrativa responsável por coordenar atividades específicas dentro da organização.', 'Organização'),
('Despacho', 'Decisão ou encaminhamento dado por autoridade competente em um processo.', 'Processos'),
('Diligência', 'Ato de buscar informações ou documentos necessários para instrução de um processo.', 'Processos'),
('Distribuição', 'Ato de encaminhar processos ou documentos para as unidades responsáveis.', 'Processos'),
('Etapa', 'Fase específica do fluxo de trabalho de produção ou tramitação de processos.', 'Produção'),
('Expediente', 'Documento oficial enviado ou recebido pela organização.', 'Documentos'),
('Folha', 'Cada página de um processo, numerada sequencialmente.', 'Processos'),
('Interessado', 'Pessoa física ou jurídica que tem interesse direto no processo.', 'Processos'),
('Juntada', 'Ato de anexar documentos a um processo já existente.', 'Processos'),
('Matrícula', 'Número de identificação único do colaborador na organização.', 'Organização'),
('Memorando', 'Comunicação interna entre unidades da mesma organização.', 'Documentos'),
('Ofício', 'Comunicação oficial enviada a pessoas ou entidades externas.', 'Documentos'),
('Parecer', 'Opinião técnica ou jurídica emitida sobre determinado assunto.', 'Documentos'),
('Processo', 'Conjunto de documentos que tramitam de forma organizada para atingir um objetivo.', 'Processos'),
('Produção', 'Quantidade de trabalho realizado por colaboradores em determinado período.', 'Produção'),
('Protocolo', 'Número único que identifica um documento ou processo no sistema.', 'Processos'),
('Recebimento', 'Ato de receber fisicamente um processo ou documento.', 'Processos'),
('Remessa', 'Envio de processo ou documento para outra unidade ou órgão.', 'Processos'),
('Setor', 'Divisão organizacional dentro de uma coordenadoria.', 'Organização'),
('Tramitação', 'Movimentação de um processo entre diferentes unidades ou setores.', 'Processos'),
('Volume', 'Parte de um processo quando este excede determinado número de folhas.', 'Processos');

-- Inserir na tabela de controle de migrations
INSERT INTO schema_migrations (version) VALUES ('023_glossario');

COMMENT ON TABLE glossario IS 'Glossário de termos utilizados no sistema';
COMMENT ON COLUMN glossario.termo IS 'Termo ou palavra a ser definida';
COMMENT ON COLUMN glossario.definicao IS 'Definição ou explicação do termo';
COMMENT ON COLUMN glossario.categoria IS 'Categoria do termo (Processos, Documentos, Organização, Produção)';
