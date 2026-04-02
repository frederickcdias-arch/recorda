-- Migration: Gestão de Pessoas
-- Adiciona tabelas para controle de faltas, justificativas, férias, atestados e banco de horas

-- Tabela de tipos de ausência
CREATE TABLE IF NOT EXISTS tipos_ausencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(100) NOT NULL UNIQUE,
  descricao TEXT,
  requer_justificativa BOOLEAN DEFAULT true,
  requer_documento BOOLEAN DEFAULT false,
  desconta_salario BOOLEAN DEFAULT false,
  cor VARCHAR(7) DEFAULT '#6B7280', -- Cor para visualização no calendário
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Inserir tipos de ausência padrão
INSERT INTO tipos_ausencia (nome, descricao, requer_justificativa, requer_documento, desconta_salario, cor) VALUES
  ('Falta Justificada', 'Falta com justificativa válida', true, false, false, '#10B981'),
  ('Falta Injustificada', 'Falta sem justificativa', false, false, true, '#EF4444'),
  ('Atestado Médico', 'Ausência por motivo de saúde', true, true, false, '#3B82F6'),
  ('Férias', 'Período de férias', false, false, false, '#8B5CF6'),
  ('Licença Maternidade', 'Licença maternidade', false, true, false, '#EC4899'),
  ('Licença Paternidade', 'Licença paternidade', false, true, false, '#06B6D4'),
  ('Folga Compensatória', 'Folga por banco de horas', false, false, false, '#F59E0B'),
  ('Atestado Acompanhamento', 'Acompanhamento médico de familiar', true, true, false, '#14B8A6'),
  ('Luto', 'Falecimento de familiar', true, true, false, '#6B7280'),
  ('Casamento', 'Licença casamento', false, true, false, '#F472B6'),
  ('Doação de Sangue', 'Ausência para doação de sangue', false, true, false, '#DC2626'),
  ('Convocação Judicial', 'Comparecimento à justiça', true, true, false, '#7C3AED')
ON CONFLICT (nome) DO NOTHING;

-- Tabela de registros de ausências
CREATE TABLE IF NOT EXISTS ausencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo_ausencia_id UUID NOT NULL REFERENCES tipos_ausencia(id),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  periodo VARCHAR(20) DEFAULT 'dia_completo', -- dia_completo, meio_periodo_manha, meio_periodo_tarde
  horas_ausencia DECIMAL(5,2), -- Para ausências em horas
  justificativa TEXT,
  observacoes TEXT,
  status VARCHAR(20) DEFAULT 'pendente', -- pendente, aprovado, rejeitado, cancelado
  aprovado_por UUID REFERENCES usuarios(id),
  aprovado_em TIMESTAMPTZ,
  motivo_rejeicao TEXT,
  documento_anexo VARCHAR(500), -- URL do documento anexado
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_data_fim CHECK (data_fim >= data_inicio),
  CONSTRAINT check_periodo CHECK (periodo IN ('dia_completo', 'meio_periodo_manha', 'meio_periodo_tarde', 'horas')),
  CONSTRAINT check_status CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'cancelado'))
);

-- Tabela de banco de horas
CREATE TABLE IF NOT EXISTS banco_horas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  horas_extras DECIMAL(5,2) DEFAULT 0, -- Horas positivas (trabalhou a mais)
  horas_devidas DECIMAL(5,2) DEFAULT 0, -- Horas negativas (trabalhou a menos)
  tipo VARCHAR(20) NOT NULL, -- entrada, saida, ajuste
  descricao TEXT,
  aprovado BOOLEAN DEFAULT false,
  aprovado_por UUID REFERENCES usuarios(id),
  aprovado_em TIMESTAMPTZ,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_tipo CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
  CONSTRAINT check_horas CHECK (horas_extras >= 0 AND horas_devidas >= 0)
);

-- Tabela de férias
CREATE TABLE IF NOT EXISTS ferias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  periodo_aquisitivo_inicio DATE NOT NULL,
  periodo_aquisitivo_fim DATE NOT NULL,
  dias_direito INTEGER DEFAULT 30,
  dias_utilizados INTEGER DEFAULT 0,
  dias_restantes INTEGER DEFAULT 30,
  data_inicio DATE,
  data_fim DATE,
  abono_pecuniario BOOLEAN DEFAULT false, -- Venda de 10 dias
  dias_abono INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'planejado', -- planejado, solicitado, aprovado, em_gozo, concluido, cancelado
  aprovado_por UUID REFERENCES usuarios(id),
  aprovado_em TIMESTAMPTZ,
  observacoes TEXT,
  criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_dias CHECK (dias_utilizados <= dias_direito),
  CONSTRAINT check_status_ferias CHECK (status IN ('planejado', 'solicitado', 'aprovado', 'em_gozo', 'concluido', 'cancelado'))
);

-- Tabela de advertências e ocorrências
CREATE TABLE IF NOT EXISTS ocorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL, -- advertencia_verbal, advertencia_escrita, suspensao, elogio
  data_ocorrencia DATE NOT NULL,
  motivo TEXT NOT NULL,
  descricao TEXT,
  medidas_tomadas TEXT,
  documento_anexo VARCHAR(500),
  gravidade VARCHAR(20), -- leve, media, grave
  registrado_por UUID NOT NULL REFERENCES usuarios(id),
  ciencia_funcionario BOOLEAN DEFAULT false,
  data_ciencia TIMESTAMPTZ,
  observacoes TEXT,
  criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_tipo_ocorrencia CHECK (tipo IN ('advertencia_verbal', 'advertencia_escrita', 'suspensao', 'elogio')),
  CONSTRAINT check_gravidade CHECK (gravidade IN ('leve', 'media', 'grave'))
);

-- Tabela de histórico de cargos e salários
CREATE TABLE IF NOT EXISTS historico_cargos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cargo_anterior VARCHAR(200),
  cargo_novo VARCHAR(200) NOT NULL,
  salario_anterior DECIMAL(10,2),
  salario_novo DECIMAL(10,2),
  data_efetivacao DATE NOT NULL,
  tipo_mudanca VARCHAR(20) NOT NULL, -- promocao, rebaixamento, transferencia, ajuste_salarial
  motivo TEXT,
  departamento VARCHAR(100),
  registrado_por UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_tipo_mudanca CHECK (tipo_mudanca IN ('promocao', 'rebaixamento', 'transferencia', 'ajuste_salarial'))
);

-- Tabela de avaliações de desempenho
CREATE TABLE IF NOT EXISTS avaliacoes_desempenho (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  avaliador_id UUID NOT NULL REFERENCES usuarios(id),
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  nota_geral DECIMAL(3,2), -- 0.00 a 10.00
  pontos_fortes TEXT,
  pontos_melhoria TEXT,
  metas_atingidas TEXT,
  metas_proximas TEXT,
  competencias JSONB, -- { "lideranca": 8.5, "comunicacao": 9.0, etc }
  observacoes TEXT,
  status VARCHAR(20) DEFAULT 'rascunho', -- rascunho, finalizado, revisado
  data_avaliacao DATE,
  ciencia_funcionario BOOLEAN DEFAULT false,
  data_ciencia TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_nota CHECK (nota_geral >= 0 AND nota_geral <= 10),
  CONSTRAINT check_status_avaliacao CHECK (status IN ('rascunho', 'finalizado', 'revisado'))
);

-- Índices para performance
CREATE INDEX idx_ausencias_usuario ON ausencias(usuario_id);
CREATE INDEX idx_ausencias_data ON ausencias(data_inicio, data_fim);
CREATE INDEX idx_ausencias_status ON ausencias(status);
CREATE INDEX idx_banco_horas_usuario ON banco_horas(usuario_id);
CREATE INDEX idx_banco_horas_data ON banco_horas(data);
CREATE INDEX idx_ferias_usuario ON ferias(usuario_id);
CREATE INDEX idx_ferias_periodo ON ferias(periodo_aquisitivo_inicio, periodo_aquisitivo_fim);
CREATE INDEX idx_ocorrencias_usuario ON ocorrencias(usuario_id);
CREATE INDEX idx_ocorrencias_data ON ocorrencias(data_ocorrencia);
CREATE INDEX idx_historico_cargos_usuario ON historico_cargos(usuario_id);
CREATE INDEX idx_avaliacoes_usuario ON avaliacoes_desempenho(usuario_id);
CREATE INDEX idx_avaliacoes_avaliador ON avaliacoes_desempenho(avaliador_id);

-- Triggers para atualizar updated_at
CREATE TRIGGER update_ausencias_updated_at BEFORE UPDATE ON ausencias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_banco_horas_updated_at BEFORE UPDATE ON banco_horas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ferias_updated_at BEFORE UPDATE ON ferias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ocorrencias_updated_at BEFORE UPDATE ON ocorrencias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_avaliacoes_updated_at BEFORE UPDATE ON avaliacoes_desempenho
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View para saldo de banco de horas por usuário
CREATE OR REPLACE VIEW saldo_banco_horas AS
SELECT 
  usuario_id,
  u.nome as usuario_nome,
  SUM(horas_extras) as total_horas_extras,
  SUM(horas_devidas) as total_horas_devidas,
  SUM(horas_extras) - SUM(horas_devidas) as saldo_horas
FROM banco_horas bh
JOIN usuarios u ON u.id = bh.usuario_id
WHERE aprovado = true
GROUP BY usuario_id, u.nome;

-- View para resumo de ausências por usuário
CREATE OR REPLACE VIEW resumo_ausencias AS
SELECT 
  a.usuario_id,
  u.nome as usuario_nome,
  ta.nome as tipo_ausencia,
  COUNT(*) as total_ausencias,
  SUM(CASE WHEN a.periodo = 'dia_completo' THEN (a.data_fim - a.data_inicio + 1) ELSE 0.5 END) as total_dias
FROM ausencias a
JOIN usuarios u ON u.id = a.usuario_id
JOIN tipos_ausencia ta ON ta.id = a.tipo_ausencia_id
WHERE a.status = 'aprovado'
GROUP BY a.usuario_id, u.nome, ta.nome;

-- Comentários nas tabelas
COMMENT ON TABLE tipos_ausencia IS 'Tipos de ausências configuráveis (faltas, atestados, férias, etc)';
COMMENT ON TABLE ausencias IS 'Registros de ausências dos colaboradores';
COMMENT ON TABLE banco_horas IS 'Controle de banco de horas (extras e devidas)';
COMMENT ON TABLE ferias IS 'Gestão de férias dos colaboradores';
COMMENT ON TABLE ocorrencias IS 'Registro de advertências, suspensões e elogios';
COMMENT ON TABLE historico_cargos IS 'Histórico de mudanças de cargo e salário';
COMMENT ON TABLE avaliacoes_desempenho IS 'Avaliações de desempenho dos colaboradores';
