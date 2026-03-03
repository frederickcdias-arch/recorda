import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { sendDatabaseError } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import {
  criarModeloChecklistSchema,
  atualizarModeloChecklistSchema,
  abrirChecklistSchema,
  registrarItemChecklistSchema,
  concluirChecklistSchema,
  registrarProducaoSchema,
  relatorioRecebimentoSchema,
} from '../schemas/operacional.js';
import {
  type EtapaFluxo,
  type StatusRepositorio,
  type ResultadoItemChecklist,
  type TipoExcecao,
  type StatusTratativa,
  type TipoRelatorioOperacional,
  getCurrentUser,
  loadRepositorio,
  saveOperationalReport,
  createPDFService,
} from './operacional-helpers.js';

export function createOperacionalChecklistsRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    const pdfService = createPDFService();

    const gerarRelatorioRecebimento = async (repositorioIds: string[], userId: string) => {
      // Buscar info dos repositórios
      const repoResult = await server.database.query<{
        id_repositorio_recorda: string;
        id_repositorio_ged: string;
        orgao: string;
        projeto: string;
      }>(
        `SELECT r.id_repositorio_recorda, r.id_repositorio_ged, r.orgao, r.projeto
         FROM repositorios r
         WHERE r.id_repositorio_recorda = ANY($1)`,
        [repositorioIds]
      );
      if (repoResult.rows.length === 0) {
        throw new Error('Nenhum repositório encontrado para relatório de recebimento');
      }

      const repoMap = new Map(repoResult.rows.map((r) => [r.id_repositorio_recorda, r]));
      const projeto = repoResult.rows[0]?.projeto ?? '-';

      // Buscar responsável do checklist mais recente entre os repositórios
      const checklistResult = await server.database.query<{
        responsavel_nome: string;
        data_conclusao: string | null;
      }>(
        `SELECT u.nome as responsavel_nome, c.data_conclusao::text
         FROM checklists c
         JOIN usuarios u ON u.id = c.responsavel_id
         WHERE c.repositorio_id = ANY($1)
           AND c.etapa = 'RECEBIMENTO'
           AND c.status = 'CONCLUIDO'
         ORDER BY c.data_conclusao DESC NULLS LAST
         LIMIT 1`,
        [repositorioIds]
      );
      const responsavel = checklistResult.rows[0]?.responsavel_nome ?? '-';
      const dataConclusao = checklistResult.rows[0]?.data_conclusao ?? null;

      // Buscar processos de todos os repositórios com info do repo
      const processosResult = await server.database.query<{
        id: string;
        repositorio_id: string;
        protocolo: string;
        interessado: string;
        setor_nome: string | null;
        classificacao_nome: string | null;
        volume_atual: number;
        volume_total: number;
        numero_caixas: number;
        caixa_nova: boolean;
      }>(
        `SELECT rp.id, rp.repositorio_id, rp.protocolo, rp.interessado,
                sr.nome AS setor_nome, cr.nome AS classificacao_nome,
                rp.volume_atual, rp.volume_total, rp.numero_caixas, rp.caixa_nova
         FROM recebimento_processos rp
         LEFT JOIN setores_recebimento sr ON sr.id = rp.setor_id
         LEFT JOIN classificacoes_recebimento cr ON cr.id = rp.classificacao_id
         WHERE rp.repositorio_id = ANY($1)
         ORDER BY rp.criado_em`,
        [repositorioIds]
      );

      // Buscar apensos de todos os processos encontrados
      const processoIds = processosResult.rows.map((r) => r.id);
      const apensosResult = processoIds.length > 0
        ? await server.database.query<{
            processo_principal_id: string;
            protocolo: string;
            interessado: string;
            volume_atual: number;
            volume_total: number;
          }>(
            `SELECT ra.processo_principal_id, ra.protocolo, ra.interessado,
                    ra.volume_atual, ra.volume_total
             FROM recebimento_apensos ra
             WHERE ra.processo_principal_id = ANY($1)
             ORDER BY ra.criado_em`,
            [processoIds]
          )
        : { rows: [] };

      // Group apensos by parent process
      const apensosByProcesso = new Map<string, typeof apensosResult.rows>();
      for (const ap of apensosResult.rows) {
        const list = apensosByProcesso.get(ap.processo_principal_id) ?? [];
        list.push(ap);
        apensosByProcesso.set(ap.processo_principal_id, list);
      }

      // Build flat list: processo followed by its apensos
      const processos: Array<{
        repositorio: string;
        orgao: string;
        protocolo: string;
        interessado: string;
        setor: string;
        classificacao: string;
        volume: string;
        numeroCaixas: number;
        caixaNova: boolean;
        isApenso?: boolean;
        obs: string;
      }> = [];

      for (const row of processosResult.rows) {
        const repo = repoMap.get(row.repositorio_id);
        processos.push({
          repositorio: repo?.id_repositorio_ged ?? '-',
          orgao: repo?.orgao ?? '-',
          protocolo: row.protocolo,
          interessado: row.interessado,
          setor: row.setor_nome ?? '',
          classificacao: row.classificacao_nome ?? '',
          volume: row.volume_total > 0 ? `${row.volume_atual} de ${row.volume_total}` : String(row.volume_atual),
          numeroCaixas: Number(row.numero_caixas ?? 1),
          caixaNova: Boolean(row.caixa_nova),
          obs: '',
        });

        // Insert apensos right after their parent
        const apensos = apensosByProcesso.get(row.id) ?? [];
        for (const ap of apensos) {
          processos.push({
            repositorio: repo?.id_repositorio_ged ?? '-',
            orgao: repo?.orgao ?? '-',
            protocolo: ap.protocolo,
            interessado: ap.interessado ?? '',
            setor: '',
            classificacao: '',
            volume: ap.volume_total > 0 ? `${ap.volume_atual} de ${ap.volume_total}` : String(ap.volume_atual),
            numeroCaixas: 0,
            caixaNova: false,
            isApenso: true,
            obs: `Apenso ao Proc. ${row.protocolo}`,
          });
        }
      }

      // Buscar configuração da empresa para logo no PDF
      const empresaResult = await server.database.query(
        `SELECT nome, logo_url, exibir_logo_relatorio FROM configuracao_empresa LIMIT 1`
      );
      const empresaRow = empresaResult.rows[0] as Record<string, unknown> | undefined;
      const empresaConfig = empresaRow ? {
        nome: (empresaRow.nome as string) || '',
        logoUrl: (empresaRow.logo_url as string) || '',
        exibirLogoRelatorio: empresaRow.exibir_logo_relatorio !== false,
      } : null;

      const geradoEm = new Date().toISOString();
      const snapshot = { projeto, responsavel, dataConclusao, processos, geradoEm };
      const pdfBuffer = await pdfService.gerarRelatorioRecebimento({
        projeto,
        responsavel,
        dataConclusao,
        processos,
        geradoEm,
      }, empresaConfig);

      return saveOperationalReport({
        server,
        userId,
        tipo: 'RECEBIMENTO',
        snapshot,
        pdfBuffer,
        repositorioId: repositorioIds[0]!,
      });
    };

    const gerarRelatorioProducao = async (repositorioId: string, userId: string) => {
      const repoResult = await server.database.query<{
        id_repositorio_recorda: string;
        id_repositorio_ged: string;
        orgao: string;
        projeto: string;
        status_atual: string;
        etapa_atual: string;
      }>(
        `SELECT r.id_repositorio_recorda, r.id_repositorio_ged, r.orgao, r.projeto, r.status_atual::text, r.etapa_atual::text
         FROM repositorios r
         WHERE r.id_repositorio_recorda = $1`,
        [repositorioId]
      );
      const repositorio = repoResult.rows[0];
      if (!repositorio) {
        throw new Error('Repositório não encontrado para relatório de produção');
      }

      const registrosResult = await server.database.query<{
        etapa: string;
        usuario_nome: string;
        quantidade: number;
        marcadores: Record<string, unknown>;
        data_producao: string;
        checklist_id: string;
      }>(
        `SELECT p.etapa::text, u.nome as usuario_nome, p.quantidade, p.marcadores, p.data_producao::text, p.checklist_id
         FROM producao_repositorio p
         JOIN usuarios u ON u.id = p.usuario_id
         WHERE p.repositorio_id = $1
         ORDER BY p.data_producao`,
        [repositorioId]
      );
      if (registrosResult.rows.length === 0) {
        throw new Error('Nenhum registro de produção encontrado para este repositório');
      }

      const totalQuantidade = registrosResult.rows.reduce((total, row) => total + Number(row.quantidade ?? 0), 0);
      const snapshot = {
        repositorio,
        registros: registrosResult.rows,
        totais: {
          totalRegistros: registrosResult.rows.length,
          totalQuantidade,
        },
        geradoEm: new Date().toISOString(),
      };

      const pdfBuffer = await pdfService.gerarRelatorioProducao({
        repositorio,
        registros: registrosResult.rows,
        totais: snapshot.totais,
        geradoEm: snapshot.geradoEm,
      });

      return saveOperationalReport({
        server,
        userId,
        tipo: 'PRODUCAO',
        snapshot,
        pdfBuffer,
        repositorioId,
      });
    };

    // GET /operacional/checklist-modelos - Listar modelos de checklist (admin)
    server.get('/operacional/checklist-modelos', {
      schema: { tags: ['operacional'], summary: 'Listar modelos de checklist', security: [{ bearerAuth: [] }], querystring: { type: 'object', properties: { etapa: { type: 'string' }, ativo: { type: 'string' } } } },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const query = request.query as { etapa?: EtapaFluxo; ativo?: string };
        const params: string[] = [];
        let where = 'WHERE 1=1';
        let p = 1;

        if (query.etapa) {
          where += ` AND etapa = $${p++}`;
          params.push(query.etapa);
        }
        if (query.ativo === 'true') {
          where += ` AND ativo = TRUE`;
        } else if (query.ativo === 'false') {
          where += ` AND ativo = FALSE`;
        }

        const result = await server.database.query(
          `SELECT id, codigo, descricao, obrigatorio, ordem, etapa, ativo, criado_em
           FROM checklist_modelos
           ${where}
           ORDER BY etapa, ordem`,
          params
        );
        return reply.send({ itens: result.rows });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar modelos de checklist';
        return sendDatabaseError(reply, error, message);
      }
    });

    // POST /operacional/checklist-modelos - Criar modelo de checklist (admin)
    server.post('/operacional/checklist-modelos', {
      schema: { tags: ['operacional'], summary: 'Criar modelo de checklist', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('administrador'), validateBody(criarModeloChecklistSchema)],
    }, async (request, reply) => {
      try {
        const body = request.body as {
          codigo?: string;
          descricao?: string;
          obrigatorio?: boolean;
          ordem?: number;
          etapa?: EtapaFluxo;
        };

        if (!body.codigo || !body.descricao || !body.etapa) {
          return reply.status(400).send({ error: 'Campos obrigatórios: codigo, descricao, etapa' });
        }

        const result = await server.database.query(
          `INSERT INTO checklist_modelos (codigo, descricao, obrigatorio, ordem, etapa, ativo)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           RETURNING *`,
          [body.codigo.trim(), body.descricao.trim(), body.obrigatorio ?? true, body.ordem ?? 1, body.etapa]
        );

        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao criar modelo de checklist';
        if (message.includes('checklist_modelos_codigo_key') || message.includes('duplicate key')) {
          return reply.status(409).send({ error: 'Código já cadastrado' });
        }
        return reply.status(400).send({ error: message });
      }
    });

    // PUT /operacional/checklist-modelos/:id - Atualizar modelo de checklist (admin)
    server.put('/operacional/checklist-modelos/:id', {
      schema: { tags: ['operacional'], summary: 'Atualizar modelo de checklist', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('administrador'), validateBody(atualizarModeloChecklistSchema)],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as {
          codigo?: string;
          descricao?: string;
          obrigatorio?: boolean;
          ordem?: number;
          etapa?: EtapaFluxo;
        };

        if (!body.codigo || !body.descricao || !body.etapa) {
          return reply.status(400).send({ error: 'Campos obrigatórios: codigo, descricao, etapa' });
        }

        const result = await server.database.query(
          `UPDATE checklist_modelos
           SET codigo = $2, descricao = $3, obrigatorio = $4, ordem = $5, etapa = $6
           WHERE id = $1
           RETURNING *`,
          [id, body.codigo.trim(), body.descricao.trim(), body.obrigatorio ?? true, body.ordem ?? 1, body.etapa]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Modelo não encontrado' });
        }

        return reply.send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao atualizar modelo de checklist';
        return reply.status(400).send({ error: message });
      }
    });

    // PATCH /operacional/checklist-modelos/:id/toggle-ativo - Ativar/desativar modelo (admin)
    server.patch('/operacional/checklist-modelos/:id/toggle-ativo', {
      schema: { tags: ['operacional'], summary: 'Ativar/desativar modelo de checklist', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await server.database.query(
          `UPDATE checklist_modelos SET ativo = NOT ativo WHERE id = $1 RETURNING *`,
          [id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Modelo não encontrado' });
        }

        return reply.send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao alterar status do modelo';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/repositorios/:id/checklists - Abrir checklist de etapa
    server.post('/operacional/repositorios/:id/checklists', {
      schema: { tags: ['operacional'], summary: 'Abrir checklist de etapa para repositório', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(abrirChecklistSchema)],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as { etapa?: EtapaFluxo };
        const user = getCurrentUser(request);
        const etapa = body.etapa;

        if (!etapa) {
          return reply.status(400).send({ error: 'Campo obrigatório: etapa' });
        }

        const repositorio = await loadRepositorio(server, id);
        if (!repositorio) {
          return reply.status(404).send({ error: 'Repositório não encontrado' });
        }

        const result = await server.database.query(
          `INSERT INTO checklists (repositorio_id, etapa, status, responsavel_id)
           VALUES ($1, $2, 'ABERTO', $3)
           RETURNING *`,
          [id, etapa, user.id]
        );

        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao abrir checklist';
        if (message.includes('uk_checklists_ativos_por_etapa')) {
          return reply.status(409).send({ error: 'Já existe checklist ativo para esta etapa e repositório' });
        }
        return sendDatabaseError(reply, error, message);
      }
    });

    // GET /operacional/repositorios/:id/checklists
    server.get('/operacional/repositorios/:id/checklists', {
      schema: { tags: ['operacional'], summary: 'Listar checklists de repositório', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const query = request.query as { etapa?: EtapaFluxo; ativo?: string };

        let where = 'WHERE repositorio_id = $1';
        const params: Array<string> = [id];
        let p = 2;

        if (query.etapa) {
          where += ` AND etapa = $${p++}`;
          params.push(query.etapa);
        }

        if (query.ativo === 'true') {
          where += ` AND ativo = TRUE`;
        } else if (query.ativo === 'false') {
          where += ` AND ativo = FALSE`;
        }

        const result = await server.database.query(
          `SELECT *
           FROM checklists
           ${where}
           ORDER BY data_abertura DESC`,
          params
        );

        return reply.send({ itens: result.rows });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar checklists';
        return sendDatabaseError(reply, error, message);
      }
    });

    // GET /operacional/checklists/:id
    server.get('/operacional/checklists/:id', {
      schema: { tags: ['operacional'], summary: 'Buscar checklist por ID com itens', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };

        const checklistResult = await server.database.query(
          `SELECT c.*
           FROM checklists c
           WHERE c.id = $1`,
          [id]
        );
        const checklist = checklistResult.rows[0];

        if (!checklist) {
          return reply.status(404).send({ error: 'Checklist não encontrado' });
        }

        const modelosResult = await server.database.query(
          `SELECT m.id, m.codigo, m.descricao, m.obrigatorio, m.ordem, i.resultado, i.observacao, i.data_hora
           FROM checklist_modelos m
           LEFT JOIN checklist_itens i
             ON i.modelo_id = m.id
            AND i.checklist_id = $1
           WHERE m.etapa = $2
             AND m.ativo = TRUE
           ORDER BY m.ordem`,
          [id, checklist.etapa as string]
        );

        return reply.send({ checklist, itens: modelosResult.rows });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao buscar checklist';
        return sendDatabaseError(reply, error, message);
      }
    });

    // POST /operacional/checklists/:id/itens
    server.post('/operacional/checklists/:id/itens', {
      schema: { tags: ['operacional'], summary: 'Registrar item de checklist', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(registrarItemChecklistSchema)],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as {
          modeloId?: string;
          resultado?: ResultadoItemChecklist;
          observacao?: string;
        };
        const user = getCurrentUser(request);

        if (!body.modeloId || !body.resultado) {
          return reply.status(400).send({ error: 'Campos obrigatórios: modeloId, resultado' });
        }

        const result = await server.database.query(
          `INSERT INTO checklist_itens (
             checklist_id, modelo_id, resultado, observacao, responsavel_id
           ) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (checklist_id, modelo_id) DO UPDATE SET
             resultado = EXCLUDED.resultado,
             observacao = EXCLUDED.observacao,
             responsavel_id = EXCLUDED.responsavel_id,
             data_hora = CURRENT_TIMESTAMP
           RETURNING *`,
          [id, body.modeloId, body.resultado, body.observacao ?? '', user.id]
        );

        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao registrar item do checklist';
        return sendDatabaseError(reply, error, message);
      }
    });

    // POST /operacional/checklists/:id/concluir
    server.post('/operacional/checklists/:id/concluir', {
      schema: { tags: ['operacional'], summary: 'Concluir checklist (salva itens + conclui em uma chamada)', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(concluirChecklistSchema)],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as {
          observacao?: string;
          itens?: Array<{ modeloId: string; resultado: ResultadoItemChecklist; observacao?: string }>;
        };
        const user = getCurrentUser(request);

        // Save all items in bulk if provided
        if (body.itens && body.itens.length > 0) {
          for (const item of body.itens) {
            await server.database.query(
              `INSERT INTO checklist_itens (
                 checklist_id, modelo_id, resultado, observacao, responsavel_id
               ) VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (checklist_id, modelo_id) DO UPDATE SET
                 resultado = EXCLUDED.resultado,
                 observacao = EXCLUDED.observacao,
                 responsavel_id = EXCLUDED.responsavel_id,
                 data_hora = CURRENT_TIMESTAMP`,
              [id, item.modeloId, item.resultado, item.observacao ?? '', user.id]
            );
          }
        }

        const result = await server.database.query(
          `UPDATE checklists
           SET status = 'CONCLUIDO',
               observacao = $2
           WHERE id = $1
           RETURNING *`,
          [id, body.observacao ?? '']
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Checklist nao encontrado' });
        }

        const checklistConcluido = result.rows[0] as { repositorio_id?: string; etapa?: EtapaFluxo };
        if (checklistConcluido.etapa === 'RECEBIMENTO' && checklistConcluido.repositorio_id) {
          await gerarRelatorioRecebimento([checklistConcluido.repositorio_id], user.id);
        }

        return reply.send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao concluir checklist';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/repositorios/:id/producao
    server.post('/operacional/repositorios/:id/producao', {
      schema: { tags: ['operacional'], summary: 'Registrar produção em repositório', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(registrarProducaoSchema)],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as {
          etapa?: EtapaFluxo;
          checklistId?: string;
          quantidade?: number;
          marcadores?: Record<string, unknown>;
        };
        const user = getCurrentUser(request);

        if (!body.etapa || !body.checklistId) {
          return reply.status(400).send({ error: 'Campos obrigatorios: etapa, checklistId' });
        }

        const result = await server.database.query(
          `INSERT INTO producao_repositorio (
             repositorio_id, etapa, checklist_id, usuario_id, quantidade, marcadores
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           RETURNING *`,
          [id, body.etapa, body.checklistId, user.id, Math.max(Number(body.quantidade ?? 1), 1), JSON.stringify(body.marcadores ?? {})]
        );

        await gerarRelatorioProducao(id, user.id);
        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao registrar producao';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/relatorio-recebimento
    server.post('/operacional/relatorio-recebimento', {
      schema: { tags: ['operacional'], summary: 'Gerar relatório de recebimento (múltiplos repositórios)', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(relatorioRecebimentoSchema)],
    }, async (request, reply) => {
      try {
        const body = request.body as { repositorioIds?: string[] };
        const ids = body.repositorioIds;
        if (!ids || ids.length === 0) {
          return reply.status(400).send({ error: 'repositorioIds é obrigatório' });
        }
        const user = getCurrentUser(request);
        const report = await gerarRelatorioRecebimento(ids, user.id);
        return reply.status(201).send(report);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao gerar relatorio de recebimento';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/repositorios/:id/relatorio-recebimento (compat: single repo)
    server.post('/operacional/repositorios/:id/relatorio-recebimento', {
      schema: { tags: ['operacional'], summary: 'Gerar relatório de recebimento (repositório único, compat)', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = getCurrentUser(request);
        const report = await gerarRelatorioRecebimento([id], user.id);
        return reply.status(201).send(report);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao gerar relatorio de recebimento';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/repositorios/:id/relatorio-producao
    server.post('/operacional/repositorios/:id/relatorio-producao', {
      schema: { tags: ['operacional'], summary: 'Gerar relatório de produção', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = getCurrentUser(request);
        const report = await gerarRelatorioProducao(id, user.id);
        return reply.status(201).send(report);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao gerar relatorio de producao';
        return reply.status(400).send({ error: message });
      }
    });

    // GET /operacional/repositorios/:id/relatorios
    server.get('/operacional/repositorios/:id/relatorios', {
      schema: { tags: ['operacional'], summary: 'Listar relatórios gerados de repositório', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const query = request.query as { tipo?: TipoRelatorioOperacional };
        const params: string[] = [id];
        let where = 'WHERE repositorio_id = $1';
        if (query.tipo) {
          where += ' AND tipo = $2';
          params.push(query.tipo);
        }

        const result = await server.database.query(
          `SELECT id, tipo, repositorio_id, lote_id, arquivo_path, hash_arquivo, gerado_em
           FROM relatorios_operacionais
           ${where}
           ORDER BY gerado_em DESC`,
          params
        );
        return reply.send({ itens: result.rows });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar relatorios';
        return sendDatabaseError(reply, error, message);
      }
    });

    // POST /operacional/repositorios/:id/excecoes
    server.post('/operacional/repositorios/:id/excecoes', {
      schema: { tags: ['operacional'], summary: 'Registrar exceção em repositório', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as {
          etapa?: EtapaFluxo;
          tipoExcecao?: TipoExcecao;
          statusTratativa?: StatusTratativa;
          detalhes?: Record<string, unknown>;
        };
        const user = getCurrentUser(request);

        if (!body.etapa || !body.tipoExcecao) {
          return reply.status(400).send({ error: 'Campos obrigatórios: etapa, tipoExcecao' });
        }

        const result = await server.database.query(
          `INSERT INTO excecoes_repositorio (
             repositorio_id, etapa, tipo_excecao, status_tratativa, detalhes, responsavel_id
           ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
           RETURNING *`,
          [id, body.etapa, body.tipoExcecao, body.statusTratativa ?? 'ABERTA', JSON.stringify(body.detalhes ?? {}), user.id]
        );

        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao registrar exceção';
        return reply.status(400).send({ error: message });
      }
    });

    // PATCH /operacional/repositorios/:id/entregar - Marcar repositório como entregue (etapa final)
    server.patch('/operacional/repositorios/:id/entregar', {
      schema: { tags: ['operacional'], summary: 'Marcar repositório como entregue', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as { observacao?: string };
        const user = getCurrentUser(request);

        await server.database.query('BEGIN');
        const repositorio = await loadRepositorio(server, id);
        if (!repositorio) {
          await server.database.query('ROLLBACK');
          return reply.status(404).send({ error: 'Repositório não encontrado' });
        }

        if (repositorio.etapa_atual !== 'ENTREGA') {
          await server.database.query('ROLLBACK');
          return reply.status(400).send({
            error: 'Repositório precisa estar na etapa ENTREGA para ser marcado como entregue',
            code: 'ETAPA_INVALIDA',
          });
        }

        // Regra: checklist de entrega deve estar concluído
        const checklistCheck = await server.database.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total
           FROM checklists
           WHERE repositorio_id = $1
             AND etapa = 'ENTREGA'
             AND status = 'CONCLUIDO'`,
          [id]
        );
        const checklistsConcluidos = parseInt(checklistCheck.rows[0]?.total ?? '0', 10);
        if (checklistsConcluidos === 0) {
          await server.database.query('ROLLBACK');
          return reply.status(400).send({
            error: 'Checklist da etapa ENTREGA deve ser concluído antes de marcar como entregue',
            code: 'CHECKLIST_PENDENTE',
          });
        }

        const updateResult = await server.database.query(
          `UPDATE repositorios
           SET status_atual = 'ENTREGUE',
               data_entrega = CURRENT_TIMESTAMP
           WHERE id_repositorio_recorda = $1
           RETURNING *`,
          [id]
        );

        await server.database.query(
          `INSERT INTO historico_etapas (
             repositorio_id, etapa_origem, etapa_destino, status_origem, status_destino, usuario_id
           ) VALUES ($1, 'ENTREGA', 'ENTREGA', $2, 'ENTREGUE', $3)`,
          [id, repositorio.status_atual, user.id]
        );

        // Gerar relatório de entrega
        try {
          await saveOperationalReport({
            server,
            userId: user.id,
            tipo: 'ENTREGA',
            snapshot: {
              repositorio: updateResult.rows[0],
              observacao: body.observacao ?? '',
              entregueEm: new Date().toISOString(),
              entreguePoR: user.id,
            },
            pdfBuffer: Buffer.from(''),
            repositorioId: id,
          });
        } catch {
          // Relatório é secundário, não bloqueia a entrega
        }

        await server.database.query('COMMIT');
        return reply.send(updateResult.rows[0]);
      } catch (error) {
        await server.database.query('ROLLBACK');
        const message = error instanceof Error ? error.message : 'Erro ao marcar como entregue';
        return reply.status(400).send({ error: message });
      }
    });

    // PATCH /operacional/repositorios/:id/avancar
    server.patch('/operacional/repositorios/:id/avancar', {
      schema: { tags: ['operacional'], summary: 'Avançar repositório para próxima etapa', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as {
          etapaDestino?: EtapaFluxo;
          statusDestino?: StatusRepositorio;
        };
        const user = getCurrentUser(request);

        if (!body.etapaDestino || !body.statusDestino) {
          return reply.status(400).send({
            error: 'Campos obrigatórios: etapaDestino, statusDestino',
          });
        }

        await server.database.query('BEGIN');
        const repositorio = await loadRepositorio(server, id);
        if (!repositorio) {
          await server.database.query('ROLLBACK');
          return reply.status(404).send({ error: 'Repositório não encontrado' });
        }

        // Regra: Digitalização exige confirmação Seadesk antes de avançar
        if (repositorio.etapa_atual === 'DIGITALIZACAO') {
          const seadeskCheck = await server.database.query<{ confirmado: boolean }>(
            `SELECT seadesk_confirmado_em IS NOT NULL AS confirmado
             FROM repositorios
             WHERE id_repositorio_recorda = $1`,
            [id]
          );
          if (!seadeskCheck.rows[0]?.confirmado) {
            await server.database.query('ROLLBACK');
            return reply.status(400).send({
              error: 'Confirmação de envio Seadesk é obrigatória antes de avançar da Digitalização',
              code: 'SEADESK_PENDENTE',
            });
          }
        }

        // Regra: Recebimento exige documentos (processos) cadastrados
        if (repositorio.etapa_atual === 'RECEBIMENTO') {
          const docsCheck = await server.database.query<{ total: string }>(
            `SELECT COUNT(*)::text AS total
             FROM recebimento_processos
             WHERE repositorio_id = $1`,
            [id]
          );
          const totalDocs = parseInt(docsCheck.rows[0]?.total ?? '0', 10);
          if (totalDocs === 0) {
            await server.database.query('ROLLBACK');
            return reply.status(400).send({
              error: 'É necessário cadastrar ao menos um processo antes de aprovar o recebimento',
              code: 'DOCUMENTOS_PENDENTES',
            });
          }
        }

        // Regra de ouro #3: Sem checklist concluído = sem avançar
        const checklistCheck = await server.database.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total
           FROM checklists
           WHERE repositorio_id = $1
             AND etapa = $2
             AND status = 'CONCLUIDO'`,
          [id, repositorio.etapa_atual]
        );
        const checklistsConcluidos = parseInt(checklistCheck.rows[0]?.total ?? '0', 10);
        if (checklistsConcluidos === 0) {
          await server.database.query('ROLLBACK');
          return reply.status(400).send({
            error: `Checklist da etapa ${repositorio.etapa_atual} deve ser concluído antes de avançar`,
            code: 'CHECKLIST_PENDENTE',
          });
        }

        const updateResult = await server.database.query(
          `UPDATE repositorios
           SET etapa_atual = $2,
               status_atual = $3
           WHERE id_repositorio_recorda = $1
           RETURNING *`,
          [id, body.etapaDestino, body.statusDestino]
        );

        await server.database.query(
          `INSERT INTO historico_etapas (
             repositorio_id, etapa_origem, etapa_destino, status_origem, status_destino, usuario_id
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, repositorio.etapa_atual, body.etapaDestino, repositorio.status_atual, body.statusDestino, user.id]
        );

        await server.database.query('COMMIT');
        return reply.send(updateResult.rows[0]);
      } catch (error) {
        await server.database.query('ROLLBACK');
        const message = error instanceof Error ? error.message : 'Erro ao avançar etapa';
        return reply.status(400).send({ error: message });
      }
    });
  };
}

