-- Migration: 082_seed_conhecimento_inicial
-- Description: Popula base inicial de conhecimento operacional (documentos, glossario e leis/normas)

DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT u.id
    INTO v_admin_id
    FROM usuarios u
   WHERE u.ativo = TRUE
   ORDER BY CASE WHEN u.perfil = 'administrador' THEN 0 ELSE 1 END, u.criado_em
   LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Nao foi encontrado usuario ativo para created_by/publicado_por na seed de conhecimento';
  END IF;

  -- 1) Documentos (upsert por codigo)
  WITH docs(codigo, titulo, categoria, descricao, nivel_acesso, conteudo) AS (
    VALUES
      ('KB-REC-001', 'Manual de Recebimento e Triagem', 'MANUAIS'::kb_categoria, 'Padrao para recebimento inicial, triagem e validacao minima.', 'OPERADOR_ADMIN'::kb_nivel_acesso, '# Objetivo\nPadronizar o recebimento e triagem de repositorios.\n\n## Entrada\n- Repositorio GED\n- Unidade\n- Projeto\n\n## Passos\n1. Validar identificacao e contexto (GED+unidade+projeto).\n2. Confirmar campos obrigatorios.\n3. Registrar inconsistencias como excecao.\n\n## Criterio de aceite\nRepositorio registrado sem pendencias criticas.'),
      ('KB-PRE-001', 'Procedimento de Preparacao Fisica', 'PROCEDIMENTOS_ETAPA'::kb_categoria, 'Higienizacao, ordenacao e preparo de volumes para digitalizacao.', 'OPERADOR_ADMIN'::kb_nivel_acesso, '# Objetivo\nPreparar documentos para digitalizacao com rastreabilidade.\n\n## Passos\n1. Conferir integridade fisica.\n2. Organizar sequencia logica.\n3. Sinalizar ausencias e danos.\n\n## Evidencias\nChecklist de preparacao concluido.'),
      ('KB-DIG-001', 'Padrao de Digitalizacao', 'PROCEDIMENTOS_ETAPA'::kb_categoria, 'Parametros operacionais de captura e qualidade minima de imagem.', 'OPERADOR_ADMIN'::kb_nivel_acesso, '# Objetivo\nGarantir legibilidade e consistencia da digitalizacao.\n\n## Passos\n1. Configurar perfil de captura.\n2. Executar digitalizacao por lote.\n3. Validar amostra de qualidade.\n\n## Criterio de aceite\nImagem legivel e pagina completa.'),
      ('KB-CON-001', 'Conferencia Pos-Digitalizacao', 'PROCEDIMENTOS_ETAPA'::kb_categoria, 'Conferencia de completude, legibilidade e sequencia documental.', 'OPERADOR_ADMIN'::kb_nivel_acesso, '# Objetivo\nDetectar falhas antes da montagem e CQ.\n\n## Passos\n1. Conferir pagina a pagina por amostragem.\n2. Validar indexacao minima.\n3. Abrir retrabalho quando necessario.'),
      ('KB-MON-001', 'Montagem e Encadeamento de Processos', 'PROCEDIMENTOS_ETAPA'::kb_categoria, 'Regras para vinculo correto de processos principais, apensos e avulsos.', 'OPERADOR_ADMIN'::kb_nivel_acesso, '# Objetivo\nGarantir encadeamento correto das pecas digitais.\n\n## Passos\n1. Validar processo principal.\n2. Vincular apensos/volumes.\n3. Registrar justificativa de excecoes.'),
      ('KB-CQ-001', 'Criterios de Controle de Qualidade', 'CHECKLISTS_EXPLICADOS'::kb_categoria, 'Criterios de aprovacao, reprovacao e retorno para etapa anterior.', 'OPERADOR_ADMIN'::kb_nivel_acesso, '# Objetivo\nPadronizar decisao de CQ com criterios objetivos.\n\n## Regras\n- Aprovar quando todos os criterios forem atendidos.\n- Reprovar com motivo tipificado.\n- Retornar para etapa de origem quando houver falha estrutural.'),
      ('KB-ENT-001', 'Protocolo de Entrega e Evidencias', 'PROCEDIMENTOS_ETAPA'::kb_categoria, 'Checklist de saida, aceite e evidencias para encerramento.', 'OPERADOR_ADMIN'::kb_nivel_acesso, '# Objetivo\nFinalizar entrega com rastreabilidade completa.\n\n## Passos\n1. Validar lote final.\n2. Emitir relatorio de entrega.\n3. Armazenar evidencias de aceite.'),
      ('KB-ALL-001', 'Matriz de Decisao Operacional', 'CHECKLISTS_EXPLICADOS'::kb_categoria, 'Quando aprovar, devolver, abrir excecao ou escalar.', 'OPERADOR_ADMIN'::kb_nivel_acesso, '# Objetivo\nReduzir ambiguidade nas decisoes operacionais.\n\n## Matriz\n- Falha leve: corrigir na etapa atual.\n- Falha media: abrir retrabalho.\n- Falha critica: escalar para lideranca.'),
      ('KB-ALL-002', 'Tratativa de Excecoes e Retrabalho', 'ATUALIZACOES_PROCESSO'::kb_categoria, 'Fluxo padrao para excecoes, retrabalho e reincidencia.', 'OPERADOR_ADMIN'::kb_nivel_acesso, '# Objetivo\nTratar excecoes sem perda de rastreabilidade.\n\n## Passos\n1. Classificar tipo de excecao.\n2. Registrar causa raiz.\n3. Definir acao corretiva e prazo.'),
      ('KB-ALL-003', 'Politica de Duplicidade de Repositorio', 'NORMAS_LEIS'::kb_categoria, 'Duplicidade somente quando ID GED + unidade + projeto coincidirem.', 'OPERADOR_ADMIN'::kb_nivel_acesso, '# Regra\nRepositorio e duplicado apenas quando os tres campos coincidirem:\n- idRepositorioGed\n- orgao/unidade\n- projeto\n\n## Exemplos\n- Mesmo GED em unidade diferente: permitido.\n- Mesmo GED e unidade, projeto diferente: permitido.\n- Mesmo GED, mesma unidade e mesmo projeto: bloqueado.')
  )
  INSERT INTO kb_documentos (codigo, titulo, categoria, descricao, nivel_acesso, criado_por)
  SELECT d.codigo, d.titulo, d.categoria, d.descricao, d.nivel_acesso, v_admin_id
    FROM docs d
  ON CONFLICT (codigo) DO UPDATE
    SET titulo = EXCLUDED.titulo,
        categoria = EXCLUDED.categoria,
        descricao = EXCLUDED.descricao,
        nivel_acesso = EXCLUDED.nivel_acesso,
        status = 'ATIVO';

  -- 2) Versao inicial (v1) para documentos seed que ainda nao possuem v1
  WITH docs(codigo, conteudo) AS (
    VALUES
      ('KB-REC-001', '# Objetivo\nPadronizar o recebimento e triagem de repositorios.\n\n## Entrada\n- Repositorio GED\n- Unidade\n- Projeto\n\n## Passos\n1. Validar identificacao e contexto (GED+unidade+projeto).\n2. Confirmar campos obrigatorios.\n3. Registrar inconsistencias como excecao.\n\n## Criterio de aceite\nRepositorio registrado sem pendencias criticas.'),
      ('KB-PRE-001', '# Objetivo\nPreparar documentos para digitalizacao com rastreabilidade.\n\n## Passos\n1. Conferir integridade fisica.\n2. Organizar sequencia logica.\n3. Sinalizar ausencias e danos.\n\n## Evidencias\nChecklist de preparacao concluido.'),
      ('KB-DIG-001', '# Objetivo\nGarantir legibilidade e consistencia da digitalizacao.\n\n## Passos\n1. Configurar perfil de captura.\n2. Executar digitalizacao por lote.\n3. Validar amostra de qualidade.\n\n## Criterio de aceite\nImagem legivel e pagina completa.'),
      ('KB-CON-001', '# Objetivo\nDetectar falhas antes da montagem e CQ.\n\n## Passos\n1. Conferir pagina a pagina por amostragem.\n2. Validar indexacao minima.\n3. Abrir retrabalho quando necessario.'),
      ('KB-MON-001', '# Objetivo\nGarantir encadeamento correto das pecas digitais.\n\n## Passos\n1. Validar processo principal.\n2. Vincular apensos/volumes.\n3. Registrar justificativa de excecoes.'),
      ('KB-CQ-001', '# Objetivo\nPadronizar decisao de CQ com criterios objetivos.\n\n## Regras\n- Aprovar quando todos os criterios forem atendidos.\n- Reprovar com motivo tipificado.\n- Retornar para etapa de origem quando houver falha estrutural.'),
      ('KB-ENT-001', '# Objetivo\nFinalizar entrega com rastreabilidade completa.\n\n## Passos\n1. Validar lote final.\n2. Emitir relatorio de entrega.\n3. Armazenar evidencias de aceite.'),
      ('KB-ALL-001', '# Objetivo\nReduzir ambiguidade nas decisoes operacionais.\n\n## Matriz\n- Falha leve: corrigir na etapa atual.\n- Falha media: abrir retrabalho.\n- Falha critica: escalar para lideranca.'),
      ('KB-ALL-002', '# Objetivo\nTratar excecoes sem perda de rastreabilidade.\n\n## Passos\n1. Classificar tipo de excecao.\n2. Registrar causa raiz.\n3. Definir acao corretiva e prazo.'),
      ('KB-ALL-003', '# Regra\nRepositorio e duplicado apenas quando os tres campos coincidirem:\n- idRepositorioGed\n- orgao/unidade\n- projeto\n\n## Exemplos\n- Mesmo GED em unidade diferente: permitido.\n- Mesmo GED e unidade, projeto diferente: permitido.\n- Mesmo GED, mesma unidade e mesmo projeto: bloqueado.')
  )
  INSERT INTO kb_documento_versoes (documento_id, versao, conteudo, resumo_alteracao, publicado_por)
  SELECT kd.id, 1, d.conteudo, 'Versao inicial seed', v_admin_id
    FROM docs d
    JOIN kb_documentos kd ON kd.codigo = d.codigo
   WHERE NOT EXISTS (
     SELECT 1 FROM kb_documento_versoes kv
      WHERE kv.documento_id = kd.id AND kv.versao = 1
   );

  -- 3) Reaplica vinculos de etapa para codigos seed
  DELETE FROM kb_documento_etapas
   WHERE documento_id IN (
     SELECT id FROM kb_documentos
      WHERE codigo IN ('KB-REC-001','KB-PRE-001','KB-DIG-001','KB-CON-001','KB-MON-001','KB-CQ-001','KB-ENT-001','KB-ALL-001','KB-ALL-002','KB-ALL-003')
   );

  INSERT INTO kb_documento_etapas (documento_id, etapa)
  SELECT kd.id, t.etapa::etapa_fluxo
    FROM kb_documentos kd
    JOIN (VALUES
      ('KB-REC-001','RECEBIMENTO'),
      ('KB-PRE-001','PREPARACAO'),
      ('KB-DIG-001','DIGITALIZACAO'),
      ('KB-CON-001','CONFERENCIA'),
      ('KB-MON-001','MONTAGEM'),
      ('KB-CQ-001','CONTROLE_QUALIDADE'),
      ('KB-ENT-001','ENTREGA'),
      ('KB-ALL-001','RECEBIMENTO'),
      ('KB-ALL-001','PREPARACAO'),
      ('KB-ALL-001','DIGITALIZACAO'),
      ('KB-ALL-001','CONFERENCIA'),
      ('KB-ALL-001','MONTAGEM'),
      ('KB-ALL-001','CONTROLE_QUALIDADE'),
      ('KB-ALL-001','ENTREGA'),
      ('KB-ALL-002','RECEBIMENTO'),
      ('KB-ALL-002','PREPARACAO'),
      ('KB-ALL-002','DIGITALIZACAO'),
      ('KB-ALL-002','CONFERENCIA'),
      ('KB-ALL-002','MONTAGEM'),
      ('KB-ALL-002','CONTROLE_QUALIDADE'),
      ('KB-ALL-002','ENTREGA'),
      ('KB-ALL-003','RECEBIMENTO')
    ) AS t(codigo, etapa) ON t.codigo = kd.codigo
  ON CONFLICT (documento_id, etapa) DO NOTHING;

  -- 4) Atualiza versao_atual_id para a versao mais recente de cada documento seed
  UPDATE kb_documentos kd
     SET versao_atual_id = kv.id
    FROM (
      SELECT DISTINCT ON (documento_id) id, documento_id
        FROM kb_documento_versoes
       ORDER BY documento_id, versao DESC, publicado_em DESC
    ) kv
   WHERE kd.id = kv.documento_id
     AND kd.codigo IN ('KB-REC-001','KB-PRE-001','KB-DIG-001','KB-CON-001','KB-MON-001','KB-CQ-001','KB-ENT-001','KB-ALL-001','KB-ALL-002','KB-ALL-003');

  -- 5) Glossario (upsert por termo)
  INSERT INTO kb_glossario (termo, definicao, ordem, criado_por)
  VALUES
    ('Repositorio', 'Unidade logica de controle no fluxo operacional.', 1, v_admin_id),
    ('ID GED', 'Identificador principal do repositorio no padrao GED.', 2, v_admin_id),
    ('Processo principal', 'Processo base ao qual documentos e apensos sao vinculados.', 3, v_admin_id),
    ('Apenso', 'Documento/processo vinculado a um processo principal.', 4, v_admin_id),
    ('Avulso', 'Documento sem vinculo inicial, tratado em fluxo dedicado.', 5, v_admin_id),
    ('Lote CQ', 'Conjunto de itens submetidos a controle de qualidade.', 6, v_admin_id),
    ('Marcador', 'Metadado complementar registrado na producao/importacao.', 7, v_admin_id),
    ('Etapa atual', 'Posicao atual do repositorio no fluxo operacional.', 8, v_admin_id),
    ('Excecao', 'Ocorrencia fora do fluxo padrao que exige tratativa registrada.', 9, v_admin_id),
    ('Retrabalho', 'Reexecucao de atividade por falha de qualidade ou consistencia.', 10, v_admin_id),
    ('Idempotencia', 'Garantia de nao duplicar efeito em reprocessamentos equivalentes.', 11, v_admin_id),
    ('Fonte de importacao', 'Origem de dados externa usada para importar producao/legado.', 12, v_admin_id),
    ('Checklist', 'Lista de validacoes obrigatorias por etapa.', 13, v_admin_id),
    ('Protocolo de entrega', 'Registro formal de conclusao e envio de lote/repositorio.', 14, v_admin_id),
    ('Evidencia', 'Prova objetiva da execucao correta de uma atividade.', 15, v_admin_id)
  ON CONFLICT (LOWER(termo)) DO UPDATE
    SET definicao = EXCLUDED.definicao,
        ordem = EXCLUDED.ordem,
        ativo = TRUE;

  -- 6) Leis e normas (upsert por nome)
  INSERT INTO kb_leis_normas (nome, descricao, referencia, url, ordem, criado_por)
  VALUES
    ('Lei Geral de Protecao de Dados (LGPD)', 'Define requisitos para tratamento de dados pessoais em toda operacao.', 'Lei 13.709/2018', 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm', 1, v_admin_id),
    ('Politica interna de classificacao documental', 'Estabelece classes documentais e criterios de tratamento.', 'Norma interna', NULL, 2, v_admin_id),
    ('Norma de retencao e descarte documental', 'Define prazos de guarda e regras de descarte seguro.', 'Tabela de temporalidade', NULL, 3, v_admin_id),
    ('Procedimento de auditoria operacional', 'Padroniza evidencias e controles para auditoria interna/externa.', 'Procedimento interno', NULL, 4, v_admin_id),
    ('Norma de rastreabilidade de alteracoes', 'Exige trilha de auditoria para mudancas em documentos e etapas.', 'Politica de governanca', NULL, 5, v_admin_id),
    ('Guia de seguranca da informacao', 'Regras de acesso, confidencialidade e integridade da informacao.', 'Manual corporativo', NULL, 6, v_admin_id)
  ON CONFLICT (LOWER(nome)) DO UPDATE
    SET descricao = EXCLUDED.descricao,
        referencia = EXCLUDED.referencia,
        url = EXCLUDED.url,
        ordem = EXCLUDED.ordem,
        ativo = TRUE;
END $$;

INSERT INTO schema_migrations (version) VALUES ('082_seed_conhecimento_inicial')
ON CONFLICT (version) DO NOTHING;
