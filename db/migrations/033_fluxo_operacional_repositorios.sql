-- Migration: 033_fluxo_operacional_repositorios
-- Description: Base operacional do fluxo por repositório (armários, checklists, CQ em lote e relatórios)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'etapa_fluxo') THEN
    CREATE TYPE etapa_fluxo AS ENUM (
      'RECEBIMENTO',
      'PREPARACAO',
      'DIGITALIZACAO',
      'CONFERENCIA',
      'MONTAGEM',
      'CONTROLE_QUALIDADE',
      'ENTREGA'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_repositorio') THEN
    CREATE TYPE status_repositorio AS ENUM (
      'RECEBIDO',
      'EM_PREPARACAO',
      'PREPARADO',
      'EM_DIGITALIZACAO',
      'DIGITALIZADO',
      'EM_CONFERENCIA',
      'CONFERIDO',
      'EM_MONTAGEM',
      'MONTADO',
      'AGUARDANDO_CQ_LOTE',
      'EM_CQ',
      'CQ_APROVADO',
      'CQ_REPROVADO',
      'EM_ENTREGA',
      'ENTREGUE'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_movimentacao_armario') THEN
    CREATE TYPE tipo_movimentacao_armario AS ENUM ('RETIRADA', 'DEVOLUCAO');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_checklist') THEN
    CREATE TYPE status_checklist AS ENUM ('ABERTO', 'CONCLUIDO');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resultado_item_checklist') THEN
    CREATE TYPE resultado_item_checklist AS ENUM ('CONFORME', 'NAO_CONFORME_COM_TRATATIVA');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_excecao_repositorio') THEN
    CREATE TYPE tipo_excecao_repositorio AS ENUM ('MIDIA', 'COLORIDO', 'MAPA', 'FRAGILIDADE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_tratativa_excecao') THEN
    CREATE TYPE status_tratativa_excecao AS ENUM ('ABERTA', 'EM_TRATATIVA', 'RESOLVIDA');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_lote_cq') THEN
    CREATE TYPE status_lote_cq AS ENUM ('ABERTO', 'FECHADO');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resultado_cq_item') THEN
    CREATE TYPE resultado_cq_item AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_relatorio_operacional') THEN
    CREATE TYPE tipo_relatorio_operacional AS ENUM ('RECEBIMENTO', 'PRODUCAO', 'ENTREGA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS armarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo VARCHAR(50) NOT NULL UNIQUE,
  descricao VARCHAR(255) NOT NULL DEFAULT '',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT armarios_codigo_not_empty CHECK (LENGTH(TRIM(codigo)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_armarios_ativo ON armarios (ativo) WHERE ativo = TRUE;

CREATE TABLE IF NOT EXISTS repositorios (
  id_repositorio_recorda UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_repositorio_ged VARCHAR(100) NOT NULL UNIQUE,
  orgao VARCHAR(255) NOT NULL,
  projeto VARCHAR(255) NOT NULL,
  status_atual status_repositorio NOT NULL DEFAULT 'RECEBIDO',
  etapa_atual etapa_fluxo NOT NULL DEFAULT 'RECEBIMENTO',
  localizacao_fisica_armario_id UUID NOT NULL,
  data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  historico_de_etapas JSONB NOT NULL DEFAULT '[]'::jsonb,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT repositorio_ged_not_empty CHECK (LENGTH(TRIM(id_repositorio_ged)) > 0),
  CONSTRAINT repositorio_orgao_not_empty CHECK (LENGTH(TRIM(orgao)) > 0),
  CONSTRAINT repositorio_projeto_not_empty CHECK (LENGTH(TRIM(projeto)) > 0),
  CONSTRAINT fk_repositorio_armario
    FOREIGN KEY (localizacao_fisica_armario_id)
    REFERENCES armarios(id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_repositorios_status ON repositorios (status_atual);
CREATE INDEX IF NOT EXISTS idx_repositorios_etapa ON repositorios (etapa_atual);
CREATE INDEX IF NOT EXISTS idx_repositorios_armario ON repositorios (localizacao_fisica_armario_id);

CREATE TABLE IF NOT EXISTS movimentacoes_armario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repositorio_id UUID NOT NULL,
  armario_id UUID NOT NULL,
  etapa etapa_fluxo NOT NULL,
  tipo_movimentacao tipo_movimentacao_armario NOT NULL,
  usuario_id UUID NOT NULL,
  data_movimentacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observacao VARCHAR(500) NOT NULL DEFAULT '',
  CONSTRAINT fk_movimentacao_repositorio
    FOREIGN KEY (repositorio_id)
    REFERENCES repositorios(id_repositorio_recorda)
    ON DELETE CASCADE,
  CONSTRAINT fk_movimentacao_armario
    FOREIGN KEY (armario_id)
    REFERENCES armarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_movimentacao_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_movimentacoes_repositorio_data ON movimentacoes_armario (repositorio_id, data_movimentacao DESC);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_etapa_tipo ON movimentacoes_armario (etapa, tipo_movimentacao);

CREATE TABLE IF NOT EXISTS checklist_modelos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  etapa etapa_fluxo NOT NULL,
  codigo VARCHAR(100) NOT NULL,
  descricao VARCHAR(400) NOT NULL,
  obrigatorio BOOLEAN NOT NULL DEFAULT TRUE,
  ordem INTEGER NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT checklist_modelo_codigo_not_empty CHECK (LENGTH(TRIM(codigo)) > 0),
  CONSTRAINT checklist_modelo_descricao_not_empty CHECK (LENGTH(TRIM(descricao)) > 0),
  CONSTRAINT checklist_modelo_ordem_non_negative CHECK (ordem >= 0),
  CONSTRAINT uk_checklist_modelo_etapa_codigo UNIQUE (etapa, codigo)
);

CREATE INDEX IF NOT EXISTS idx_checklist_modelos_etapa_ativo ON checklist_modelos (etapa, ativo);

CREATE TABLE IF NOT EXISTS checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repositorio_id UUID NOT NULL,
  etapa etapa_fluxo NOT NULL,
  status status_checklist NOT NULL DEFAULT 'ABERTO',
  observacao VARCHAR(1000) NOT NULL DEFAULT '',
  responsavel_id UUID NOT NULL,
  data_abertura TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_conclusao TIMESTAMP WITH TIME ZONE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_checklists_repositorio
    FOREIGN KEY (repositorio_id)
    REFERENCES repositorios(id_repositorio_recorda)
    ON DELETE CASCADE,
  CONSTRAINT fk_checklists_usuario
    FOREIGN KEY (responsavel_id)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT checklists_status_consistencia CHECK (
    (status = 'ABERTO' AND data_conclusao IS NULL AND ativo = TRUE) OR
    (status = 'CONCLUIDO' AND data_conclusao IS NOT NULL AND ativo = FALSE)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_checklists_ativos_por_etapa
  ON checklists (repositorio_id, etapa)
  WHERE ativo = TRUE;

CREATE INDEX IF NOT EXISTS idx_checklists_repositorio_etapa ON checklists (repositorio_id, etapa);
CREATE INDEX IF NOT EXISTS idx_checklists_status ON checklists (status);

CREATE TABLE IF NOT EXISTS checklist_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_id UUID NOT NULL,
  modelo_id UUID NOT NULL,
  resultado resultado_item_checklist NOT NULL,
  observacao VARCHAR(1000) NOT NULL DEFAULT '',
  responsavel_id UUID NOT NULL,
  data_hora TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_checklist_item_checklist
    FOREIGN KEY (checklist_id)
    REFERENCES checklists(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_checklist_item_modelo
    FOREIGN KEY (modelo_id)
    REFERENCES checklist_modelos(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_checklist_item_usuario
    FOREIGN KEY (responsavel_id)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT uk_checklist_item_modelo UNIQUE (checklist_id, modelo_id),
  CONSTRAINT checklist_item_observacao_nonconforme CHECK (
    resultado = 'CONFORME' OR LENGTH(TRIM(observacao)) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_checklist_itens_checklist ON checklist_itens (checklist_id);

CREATE TABLE IF NOT EXISTS producao_repositorio (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repositorio_id UUID NOT NULL,
  etapa etapa_fluxo NOT NULL,
  checklist_id UUID NOT NULL,
  usuario_id UUID NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  marcadores JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_producao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_producao_repositorio
    FOREIGN KEY (repositorio_id)
    REFERENCES repositorios(id_repositorio_recorda)
    ON DELETE CASCADE,
  CONSTRAINT fk_producao_checklist
    FOREIGN KEY (checklist_id)
    REFERENCES checklists(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_producao_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT producao_quantidade_positive CHECK (quantidade > 0)
);

CREATE INDEX IF NOT EXISTS idx_producao_repositorio_etapa_data ON producao_repositorio (repositorio_id, etapa, data_producao DESC);

CREATE TABLE IF NOT EXISTS excecoes_repositorio (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repositorio_id UUID NOT NULL,
  etapa etapa_fluxo NOT NULL,
  tipo_excecao tipo_excecao_repositorio NOT NULL,
  status_tratativa status_tratativa_excecao NOT NULL DEFAULT 'ABERTA',
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  responsavel_id UUID NOT NULL,
  data_registro TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_resolucao TIMESTAMP WITH TIME ZONE,
  CONSTRAINT fk_excecao_repositorio
    FOREIGN KEY (repositorio_id)
    REFERENCES repositorios(id_repositorio_recorda)
    ON DELETE CASCADE,
  CONSTRAINT fk_excecao_usuario
    FOREIGN KEY (responsavel_id)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT excecao_resolucao_consistencia CHECK (
    (status_tratativa = 'RESOLVIDA' AND data_resolucao IS NOT NULL) OR
    (status_tratativa IN ('ABERTA', 'EM_TRATATIVA') AND data_resolucao IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_excecoes_repositorio ON excecoes_repositorio (repositorio_id, etapa);
CREATE INDEX IF NOT EXISTS idx_excecoes_status ON excecoes_repositorio (status_tratativa);

CREATE TABLE IF NOT EXISTS lotes_controle_qualidade (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo VARCHAR(80) NOT NULL UNIQUE,
  status status_lote_cq NOT NULL DEFAULT 'ABERTO',
  auditor_id UUID NOT NULL,
  data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_fechamento TIMESTAMP WITH TIME ZONE,
  CONSTRAINT fk_lote_cq_auditor
    FOREIGN KEY (auditor_id)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT lote_cq_fechamento_consistencia CHECK (
    (status = 'ABERTO' AND data_fechamento IS NULL) OR
    (status = 'FECHADO' AND data_fechamento IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lote_cq_status ON lotes_controle_qualidade (status);

CREATE TABLE IF NOT EXISTS lotes_controle_qualidade_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lote_id UUID NOT NULL,
  repositorio_id UUID NOT NULL,
  ordem SMALLINT NOT NULL,
  resultado resultado_cq_item NOT NULL DEFAULT 'PENDENTE',
  motivo_codigo VARCHAR(100),
  auditor_id UUID,
  data_auditoria TIMESTAMP WITH TIME ZONE,
  CONSTRAINT fk_lote_item_lote
    FOREIGN KEY (lote_id)
    REFERENCES lotes_controle_qualidade(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_lote_item_repositorio
    FOREIGN KEY (repositorio_id)
    REFERENCES repositorios(id_repositorio_recorda)
    ON DELETE RESTRICT,
  CONSTRAINT fk_lote_item_auditor
    FOREIGN KEY (auditor_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL,
  CONSTRAINT lote_item_ordem_range CHECK (ordem BETWEEN 1 AND 10),
  CONSTRAINT lote_item_motivo_consistencia CHECK (
    (resultado = 'REPROVADO' AND motivo_codigo IS NOT NULL) OR
    (resultado IN ('PENDENTE', 'APROVADO') AND motivo_codigo IS NULL)
  ),
  CONSTRAINT uk_lote_item_repositorio UNIQUE (lote_id, repositorio_id),
  CONSTRAINT uk_lote_item_ordem UNIQUE (lote_id, ordem)
);

CREATE INDEX IF NOT EXISTS idx_lote_itens_resultado ON lotes_controle_qualidade_itens (lote_id, resultado);

CREATE TABLE IF NOT EXISTS relatorios_operacionais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo tipo_relatorio_operacional NOT NULL,
  repositorio_id UUID,
  lote_id UUID,
  arquivo_path VARCHAR(500) NOT NULL,
  hash_arquivo VARCHAR(128) NOT NULL,
  dados_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  gerado_por UUID NOT NULL,
  gerado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_relatorio_repositorio
    FOREIGN KEY (repositorio_id)
    REFERENCES repositorios(id_repositorio_recorda)
    ON DELETE SET NULL,
  CONSTRAINT fk_relatorio_lote
    FOREIGN KEY (lote_id)
    REFERENCES lotes_controle_qualidade(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_relatorio_gerado_por
    FOREIGN KEY (gerado_por)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT,
  CONSTRAINT relatorio_alvo_consistencia CHECK (
    (tipo = 'ENTREGA' AND lote_id IS NOT NULL AND repositorio_id IS NULL) OR
    (tipo IN ('RECEBIMENTO', 'PRODUCAO') AND repositorio_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_relatorios_tipo_data ON relatorios_operacionais (tipo, gerado_em DESC);

CREATE TABLE IF NOT EXISTS historico_etapas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repositorio_id UUID NOT NULL,
  etapa_origem etapa_fluxo,
  etapa_destino etapa_fluxo NOT NULL,
  status_origem status_repositorio,
  status_destino status_repositorio NOT NULL,
  usuario_id UUID,
  data_evento TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT fk_historico_repositorio
    FOREIGN KEY (repositorio_id)
    REFERENCES repositorios(id_repositorio_recorda)
    ON DELETE CASCADE,
  CONSTRAINT fk_historico_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_historico_repositorio_data ON historico_etapas (repositorio_id, data_evento DESC);

-- Regra: checklist só pode ser concluído com todos os itens obrigatórios preenchidos.
CREATE OR REPLACE FUNCTION fn_validar_conclusao_checklist()
RETURNS TRIGGER AS $$
DECLARE
  total_obrigatorios INTEGER;
  total_preenchidos INTEGER;
BEGIN
  IF OLD.status = 'CONCLUIDO' AND NEW.status = 'ABERTO' THEN
    RAISE EXCEPTION 'Checklist concluído não pode ser reaberto';
  END IF;

  IF NEW.status = 'CONCLUIDO' AND OLD.status <> NEW.status THEN
    SELECT COUNT(*) INTO total_obrigatorios
    FROM checklist_modelos
    WHERE etapa = NEW.etapa
      AND obrigatorio = TRUE
      AND ativo = TRUE;

    SELECT COUNT(*) INTO total_preenchidos
    FROM checklist_itens i
    JOIN checklist_modelos m ON m.id = i.modelo_id
    WHERE i.checklist_id = NEW.id
      AND m.etapa = NEW.etapa
      AND m.obrigatorio = TRUE
      AND m.ativo = TRUE;

    IF total_obrigatorios = 0 THEN
      RAISE EXCEPTION 'Checklist não pode ser concluído sem modelo obrigatório para a etapa %', NEW.etapa;
    END IF;

    IF total_preenchidos < total_obrigatorios THEN
      RAISE EXCEPTION 'Checklist incompleto: % de % itens obrigatórios preenchidos', total_preenchidos, total_obrigatorios;
    END IF;

    NEW.data_conclusao := COALESCE(NEW.data_conclusao, CURRENT_TIMESTAMP);
    NEW.ativo := FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validar_conclusao_checklist ON checklists;
CREATE TRIGGER trigger_validar_conclusao_checklist
  BEFORE UPDATE ON checklists
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_conclusao_checklist();

-- Regra: produção só pode ser registrada se houver checklist ativo da mesma etapa.
CREATE OR REPLACE FUNCTION fn_validar_producao_com_checklist_ativo()
RETURNS TRIGGER AS $$
DECLARE
  checklist_valido INTEGER;
BEGIN
  SELECT COUNT(*) INTO checklist_valido
  FROM checklists
  WHERE id = NEW.checklist_id
    AND repositorio_id = NEW.repositorio_id
    AND etapa = NEW.etapa
    AND status = 'ABERTO'
    AND ativo = TRUE;

  IF checklist_valido = 0 THEN
    RAISE EXCEPTION 'Produção exige checklist ativo da mesma etapa e repositório';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validar_producao_com_checklist_ativo ON producao_repositorio;
CREATE TRIGGER trigger_validar_producao_com_checklist_ativo
  BEFORE INSERT ON producao_repositorio
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_producao_com_checklist_ativo();

-- Regra: nenhuma etapa avança sem checklist concluído da etapa atual e devolução ao armário.
CREATE OR REPLACE FUNCTION fn_validar_avanco_etapa_repositorio()
RETURNS TRIGGER AS $$
DECLARE
  checklist_concluido BOOLEAN;
  ultima_movimentacao tipo_movimentacao_armario;
BEGIN
  IF NEW.etapa_atual <> OLD.etapa_atual THEN
    SELECT EXISTS (
      SELECT 1
      FROM checklists
      WHERE repositorio_id = OLD.id_repositorio_recorda
        AND etapa = OLD.etapa_atual
        AND status = 'CONCLUIDO'
    ) INTO checklist_concluido;

    IF NOT checklist_concluido THEN
      RAISE EXCEPTION 'Não é permitido avançar etapa sem checklist concluído da etapa %', OLD.etapa_atual;
    END IF;

    SELECT m.tipo_movimentacao
    INTO ultima_movimentacao
    FROM movimentacoes_armario m
    WHERE m.repositorio_id = OLD.id_repositorio_recorda
      AND m.etapa = OLD.etapa_atual
    ORDER BY m.data_movimentacao DESC
    LIMIT 1;

    IF ultima_movimentacao IS DISTINCT FROM 'DEVOLUCAO' THEN
      RAISE EXCEPTION 'Não é permitido avançar etapa sem devolução do repositório ao armário';
    END IF;

    NEW.historico_de_etapas :=
      COALESCE(OLD.historico_de_etapas, '[]'::jsonb) ||
      jsonb_build_array(
        jsonb_build_object(
          'etapa_origem', OLD.etapa_atual,
          'etapa_destino', NEW.etapa_atual,
          'status_origem', OLD.status_atual,
          'status_destino', NEW.status_atual,
          'data_evento', CURRENT_TIMESTAMP
        )
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validar_avanco_etapa_repositorio ON repositorios;
CREATE TRIGGER trigger_validar_avanco_etapa_repositorio
  BEFORE UPDATE ON repositorios
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_avanco_etapa_repositorio();

-- Regra: controle de qualidade fecha somente lotes com 10 repositórios auditados.
CREATE OR REPLACE FUNCTION fn_validar_fechamento_lote_cq()
RETURNS TRIGGER AS $$
DECLARE
  total_itens INTEGER;
  total_pendentes INTEGER;
BEGIN
  IF NEW.status = 'FECHADO' AND OLD.status <> NEW.status THEN
    SELECT COUNT(*) INTO total_itens
    FROM lotes_controle_qualidade_itens
    WHERE lote_id = NEW.id;

    IF total_itens <> 10 THEN
      RAISE EXCEPTION 'Lote de CQ deve conter exatamente 10 repositórios. Total atual: %', total_itens;
    END IF;

    SELECT COUNT(*) INTO total_pendentes
    FROM lotes_controle_qualidade_itens
    WHERE lote_id = NEW.id
      AND resultado = 'PENDENTE';

    IF total_pendentes > 0 THEN
      RAISE EXCEPTION 'Não é possível fechar lote de CQ com itens pendentes';
    END IF;

    NEW.data_fechamento := COALESCE(NEW.data_fechamento, CURRENT_TIMESTAMP);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validar_fechamento_lote_cq ON lotes_controle_qualidade;
CREATE TRIGGER trigger_validar_fechamento_lote_cq
  BEFORE UPDATE ON lotes_controle_qualidade
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_fechamento_lote_cq();

-- Regra: ao fechar CQ, atualiza status final do repositório e histórico.
CREATE OR REPLACE FUNCTION fn_aplicar_resultado_cq_em_repositorios()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
BEGIN
  IF NEW.status = 'FECHADO' AND OLD.status <> NEW.status THEN
    FOR item IN
      SELECT repositorio_id, resultado
      FROM lotes_controle_qualidade_itens
      WHERE lote_id = NEW.id
    LOOP
      IF item.resultado = 'APROVADO' THEN
        UPDATE repositorios
        SET status_atual = 'ENTREGUE',
            etapa_atual = 'ENTREGA'
        WHERE id_repositorio_recorda = item.repositorio_id;

        INSERT INTO historico_etapas (
          repositorio_id,
          etapa_origem,
          etapa_destino,
          status_origem,
          status_destino,
          usuario_id,
          detalhes
        )
        VALUES (
          item.repositorio_id,
          'CONTROLE_QUALIDADE',
          'ENTREGA',
          'EM_CQ',
          'ENTREGUE',
          NEW.auditor_id,
          jsonb_build_object('origem', 'lote_cq', 'lote_id', NEW.id)
        );
      ELSIF item.resultado = 'REPROVADO' THEN
        UPDATE repositorios
        SET status_atual = 'CQ_REPROVADO',
            etapa_atual = 'CONFERENCIA'
        WHERE id_repositorio_recorda = item.repositorio_id;

        INSERT INTO historico_etapas (
          repositorio_id,
          etapa_origem,
          etapa_destino,
          status_origem,
          status_destino,
          usuario_id,
          detalhes
        )
        VALUES (
          item.repositorio_id,
          'CONTROLE_QUALIDADE',
          'CONFERENCIA',
          'EM_CQ',
          'CQ_REPROVADO',
          NEW.auditor_id,
          jsonb_build_object('origem', 'lote_cq', 'lote_id', NEW.id)
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_aplicar_resultado_cq_em_repositorios ON lotes_controle_qualidade;
CREATE TRIGGER trigger_aplicar_resultado_cq_em_repositorios
  AFTER UPDATE ON lotes_controle_qualidade
  FOR EACH ROW
  EXECUTE FUNCTION fn_aplicar_resultado_cq_em_repositorios();

-- Triggers de timestamp.
DROP TRIGGER IF EXISTS update_armarios_timestamp ON armarios;
CREATE TRIGGER update_armarios_timestamp
  BEFORE UPDATE ON armarios
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_repositorios_timestamp ON repositorios;
CREATE TRIGGER update_repositorios_timestamp
  BEFORE UPDATE ON repositorios
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_checklist_modelos_timestamp ON checklist_modelos;
CREATE TRIGGER update_checklist_modelos_timestamp
  BEFORE UPDATE ON checklist_modelos
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_checklists_timestamp ON checklists;
CREATE TRIGGER update_checklists_timestamp
  BEFORE UPDATE ON checklists
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- Auditoria de tabelas operacionais.
DROP TRIGGER IF EXISTS audit_armarios ON armarios;
CREATE TRIGGER audit_armarios
  AFTER INSERT OR UPDATE OR DELETE ON armarios
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_repositorios ON repositorios;
CREATE TRIGGER audit_repositorios
  AFTER INSERT OR UPDATE OR DELETE ON repositorios
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_movimentacoes_armario ON movimentacoes_armario;
CREATE TRIGGER audit_movimentacoes_armario
  AFTER INSERT OR UPDATE OR DELETE ON movimentacoes_armario
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_checklists ON checklists;
CREATE TRIGGER audit_checklists
  AFTER INSERT OR UPDATE OR DELETE ON checklists
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_checklist_itens ON checklist_itens;
CREATE TRIGGER audit_checklist_itens
  AFTER INSERT OR UPDATE OR DELETE ON checklist_itens
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_producao_repositorio ON producao_repositorio;
CREATE TRIGGER audit_producao_repositorio
  AFTER INSERT OR UPDATE OR DELETE ON producao_repositorio
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_excecoes_repositorio ON excecoes_repositorio;
CREATE TRIGGER audit_excecoes_repositorio
  AFTER INSERT OR UPDATE OR DELETE ON excecoes_repositorio
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_lotes_controle_qualidade ON lotes_controle_qualidade;
CREATE TRIGGER audit_lotes_controle_qualidade
  AFTER INSERT OR UPDATE OR DELETE ON lotes_controle_qualidade
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_lotes_controle_qualidade_itens ON lotes_controle_qualidade_itens;
CREATE TRIGGER audit_lotes_controle_qualidade_itens
  AFTER INSERT OR UPDATE OR DELETE ON lotes_controle_qualidade_itens
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_relatorios_operacionais ON relatorios_operacionais;
CREATE TRIGGER audit_relatorios_operacionais
  AFTER INSERT OR UPDATE OR DELETE ON relatorios_operacionais
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_historico_etapas ON historico_etapas;
CREATE TRIGGER audit_historico_etapas
  AFTER INSERT OR UPDATE OR DELETE ON historico_etapas
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Modelos obrigatórios de checklist por etapa operacional.
INSERT INTO checklist_modelos (etapa, codigo, descricao, obrigatorio, ordem, ativo)
VALUES
  ('RECEBIMENTO', 'IDENTIFICACAO_GED', 'Identificação oficial do processo por ID GED validada', TRUE, 1, TRUE),
  ('RECEBIMENTO', 'CONFERENCIA_ORGAO_PROJETO', 'Conferência de órgão e projeto realizada', TRUE, 2, TRUE),
  ('RECEBIMENTO', 'CONFERENCIA_INTEGRIDADE', 'Conferência física inicial de integridade concluída', TRUE, 3, TRUE),
  ('RECEBIMENTO', 'REGISTRO_ARMARIO_INICIAL', 'Armário inicial registrado para o repositório', TRUE, 4, TRUE),
  ('RECEBIMENTO', 'COMPROVANTE_RECEBIMENTO', 'Comprovante de recebimento emitido e vinculado', TRUE, 5, TRUE),

  ('PREPARACAO', 'RETIRADA_ARMARIO', 'Retirada do armário registrada para preparação', TRUE, 1, TRUE),
  ('PREPARACAO', 'HIGIENIZACAO', 'Higienização documental concluída', TRUE, 2, TRUE),
  ('PREPARACAO', 'ORDENACAO_DOCUMENTAL', 'Ordenação documental validada', TRUE, 3, TRUE),
  ('PREPARACAO', 'SINALIZACAO_FRAGILIDADES', 'Fragilidades e exceções sinalizadas', TRUE, 4, TRUE),
  ('PREPARACAO', 'DEVOLUCAO_ARMARIO', 'Devolução ao armário de digitalização registrada', TRUE, 5, TRUE),

  ('DIGITALIZACAO', 'RETIRADA_ARMARIO', 'Retirada do armário registrada para digitalização', TRUE, 1, TRUE),
  ('DIGITALIZACAO', 'CALIBRACAO_EQUIPAMENTO', 'Calibração e perfil técnico do scanner conferidos', TRUE, 2, TRUE),
  ('DIGITALIZACAO', 'MARCACAO_FORMATOS', 'Marcação de P/B, colorido e A3 registrada', TRUE, 3, TRUE),
  ('DIGITALIZACAO', 'ENVIO_SEADESK', 'Envio via Seadesk confirmado', TRUE, 4, TRUE),
  ('DIGITALIZACAO', 'DEVOLUCAO_ARMARIO', 'Devolução ao armário de conferência registrada', TRUE, 5, TRUE),

  ('CONFERENCIA', 'RETIRADA_ARMARIO', 'Retirada do armário registrada para conferência', TRUE, 1, TRUE),
  ('CONFERENCIA', 'VALIDACAO_GED', 'Validação no GED de paginação, ordem e indexação concluída', TRUE, 2, TRUE),
  ('CONFERENCIA', 'TRATATIVA_EXCECOES', 'Tratativa de mídias e coloridos concluída', TRUE, 3, TRUE),
  ('CONFERENCIA', 'CHECKLIST_CRITICO', 'Checklist crítico de conferência concluído', TRUE, 4, TRUE),
  ('CONFERENCIA', 'DEVOLUCAO_ARMARIO', 'Devolução ao armário de montagem registrada', TRUE, 5, TRUE),

  ('MONTAGEM', 'RETIRADA_ARMARIO', 'Retirada do armário registrada para montagem', TRUE, 1, TRUE),
  ('MONTAGEM', 'RECOMPOSICAO_FISICA', 'Checklist de recomposição física concluído', TRUE, 2, TRUE),
  ('MONTAGEM', 'PREPARACAO_DEVOLUCAO', 'Preparação para devolução final concluída', TRUE, 3, TRUE),
  ('MONTAGEM', 'DEVOLUCAO_ARMARIO', 'Devolução ao armário de CQ registrada', TRUE, 4, TRUE),

  ('CONTROLE_QUALIDADE', 'SELECAO_LOTE_10', 'Lote de 10 repositórios selecionado', TRUE, 1, TRUE),
  ('CONTROLE_QUALIDADE', 'AUDITORIA_CRUZADA', 'Auditoria físico x GED x recebimento concluída', TRUE, 2, TRUE),
  ('CONTROLE_QUALIDADE', 'RESULTADO_REGISTRADO', 'Aprovação/reprovação registrada por repositório', TRUE, 3, TRUE),
  ('CONTROLE_QUALIDADE', 'RELATORIO_ENTREGA_GERADO', 'Relatório de entrega PDF gerado', TRUE, 4, TRUE)
ON CONFLICT (etapa, codigo) DO NOTHING;

INSERT INTO schema_migrations (version)
SELECT '033_fluxo_operacional_repositorios'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '033_fluxo_operacional_repositorios'
);
