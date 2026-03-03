import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { criarLoteCQSchema, auditarItemCQSchema } from '../schemas/operacional.js';
import {
  type ResultadoCQ,
  getCurrentUser,
  saveOperationalReport,
  createPDFService,
} from './operacional-helpers.js';

export function createOperacionalCQRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    const pdfService = createPDFService();

    // POST /operacional/lotes-cq - Criar lote de controle de qualidade (apenas administrador)
    server.post('/operacional/lotes-cq', {
      schema: {
        tags: ['operacional-cq'],
        summary: 'Criar lote de CQ',
        description: 'Cria um lote de controle de qualidade.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['repositorioIds'],
          properties: {
            codigo: { type: 'string' },
            repositorioIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 },
          },
        },
      },
      preHandler: [server.authenticate, authorize('administrador'), validateBody(criarLoteCQSchema)],
    }, async (request, reply) => {
      try {
        const body = request.body as {
          codigo?: string;
          repositorioIds: string[];
        };
        const user = getCurrentUser(request);

        const repositorioIds = body.repositorioIds;
        const codigo = body.codigo?.trim() || `CQ-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;

        await server.database.query('BEGIN');

        const loteResult = await server.database.query<{ id: string }>(
          `INSERT INTO lotes_controle_qualidade (codigo, status, auditor_id)
           VALUES ($1, 'ABERTO', $2)
           RETURNING id`,
          [codigo, user.id]
        );
        const loteId = loteResult.rows[0]?.id;
        if (!loteId) {
          throw new Error('Falha ao criar lote de controle de qualidade');
        }

        await server.database.query(
          `INSERT INTO lotes_controle_qualidade_itens (lote_id, repositorio_id, ordem, resultado)
           SELECT $1, unnest($2::uuid[]), generate_series(1, array_length($2::uuid[], 1)), 'PENDENTE'`,
          [loteId, repositorioIds]
        );

        await server.database.query('COMMIT');
        return reply.status(201).send({ id: loteId, codigo, totalItens: repositorioIds.length });
      } catch (error) {
        await server.database.query('ROLLBACK');
        const message = error instanceof Error ? error.message : 'Erro ao criar lote de CQ';
        return reply.status(400).send({ error: message });
      }
    });

    // GET /operacional/lotes-cq - Listar lotes de CQ
    server.get('/operacional/lotes-cq', {
      schema: {
        tags: ['operacional-cq'],
        summary: 'Listar lotes de CQ com paginação',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            pagina: { type: 'number', default: 1 },
            limite: { type: 'number', default: 20 },
            status: { type: 'string' },
          },
        },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const query = request.query as { pagina?: string | number; limite?: string | number; status?: string };
        const pagina = Math.max(Number(query.pagina ?? 1), 1);
        const limite = Math.min(Math.max(Number(query.limite ?? 20), 1), 100);
        const offset = (pagina - 1) * limite;

        const params: (string | number)[] = [];
        let where = '';
        if (query.status) {
          params.push(query.status);
          where = `WHERE l.status = $${params.length}`;
        }

        const totalResult = await server.database.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total FROM lotes_controle_qualidade l ${where}`,
          params
        );
        const total = parseInt(totalResult.rows[0]?.total ?? '0', 10);

        params.push(limite, offset);
        const result = await server.database.query(
          `SELECT l.id, l.codigo, l.status, l.auditor_id, l.data_criacao, l.data_fechamento,
                  u.nome AS auditor_nome,
                  COALESCE(cnt.total_itens, 0) AS total_itens
           FROM lotes_controle_qualidade l
           LEFT JOIN usuarios u ON u.id = l.auditor_id
           LEFT JOIN (
             SELECT lote_id, COUNT(*)::int AS total_itens
             FROM lotes_controle_qualidade_itens
             GROUP BY lote_id
           ) cnt ON cnt.lote_id = l.id
           ${where}
           ORDER BY l.data_criacao DESC
           LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params
        );
        return reply.send({ itens: result.rows, total, pagina, totalPaginas: Math.ceil(total / limite) });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar lotes de CQ';
        return reply.status(500).send({ error: message });
      }
    });

    // GET /operacional/lotes-cq/:id - Detalhar lote de CQ
    server.get('/operacional/lotes-cq/:id', {
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const loteResult = await server.database.query(
          `SELECT l.id, l.codigo, l.status, l.auditor_id, l.data_criacao, l.data_fechamento,
                  u.nome as auditor_nome
           FROM lotes_controle_qualidade l
           LEFT JOIN usuarios u ON u.id = l.auditor_id
           WHERE l.id = $1`,
          [id]
        );

        const lote = loteResult.rows[0];
        if (!lote) {
          return reply.status(404).send({ error: 'Lote não encontrado' });
        }

        const itensResult = await server.database.query(
          `SELECT i.id, i.ordem, i.resultado, i.motivo_codigo, i.data_auditoria, i.repositorio_id,
                  r.id_repositorio_ged, r.orgao, r.projeto, r.status_atual, r.etapa_atual
           FROM lotes_controle_qualidade_itens i
           JOIN repositorios r ON r.id_repositorio_recorda = i.repositorio_id
           WHERE i.lote_id = $1
           ORDER BY i.ordem`,
          [id]
        );

        return reply.send({ lote, itens: itensResult.rows });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao detalhar lote de CQ';
        return reply.status(500).send({ error: message });
      }
    });

    // PATCH /operacional/lotes-cq/:id/itens/:itemId - Registrar resultado de item de CQ (apenas administrador)
    server.patch('/operacional/lotes-cq/:id/itens/:itemId', {
      preHandler: [server.authenticate, authorize('administrador'), validateBody(auditarItemCQSchema)],
    }, async (request, reply) => {
      try {
        const { id, itemId } = request.params as { id: string; itemId: string };
        const body = request.body as {
          resultado: ResultadoCQ;
          motivoCodigo?: string | null;
        };
        const user = getCurrentUser(request);

        const result = await server.database.query(
          `UPDATE lotes_controle_qualidade_itens
           SET resultado = $3,
               motivo_codigo = $4,
               auditor_id = $5,
               data_auditoria = CURRENT_TIMESTAMP
           WHERE id = $1
             AND lote_id = $2
           RETURNING *`,
          [itemId, id, body.resultado, body.motivoCodigo ?? null, user.id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Item de lote não encontrado' });
        }

        return reply.send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao registrar resultado de CQ';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/lotes-cq/:id/fechar - Fechar lote CQ (apenas administrador)
    server.post('/operacional/lotes-cq/:id/fechar', {
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };

        // Verificar se todos os itens foram auditados
        const pendentesResult = await server.database.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total
           FROM lotes_controle_qualidade_itens
           WHERE lote_id = $1 AND resultado = 'PENDENTE'`,
          [id]
        );
        const pendentes = parseInt(pendentesResult.rows[0]?.total ?? '0', 10);
        if (pendentes > 0) {
          return reply.status(400).send({
            error: `Existem ${pendentes} item(ns) pendente(s) de auditoria. Audite todos antes de fechar o lote.`,
            code: 'ITENS_PENDENTES',
          });
        }

        await server.database.query('BEGIN');

        const result = await server.database.query(
          `UPDATE lotes_controle_qualidade
           SET status = 'FECHADO', data_fechamento = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [id]
        );

        if (result.rows.length === 0) {
          await server.database.query('ROLLBACK');
          return reply.status(404).send({ error: 'Lote não encontrado' });
        }

        // Status dos repositórios (APROVADO → ENTREGUE, REPROVADO → CQ_REPROVADO)
        // é atualizado automaticamente pelo trigger fn_aplicar_resultado_cq_em_repositorios

        await server.database.query('COMMIT');
        return reply.send(result.rows[0]);
      } catch (error) {
        await server.database.query('ROLLBACK');
        const message = error instanceof Error ? error.message : 'Erro ao fechar lote de CQ';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/lotes-cq/:id/relatorio-entrega - Gerar relatório de entrega do lote CQ (apenas administrador)
    server.post('/operacional/lotes-cq/:id/relatorio-entrega', {
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = getCurrentUser(request);

        const loteResult = await server.database.query(
          `SELECT l.id, l.codigo, l.status, l.auditor_id, l.data_criacao, l.data_fechamento,
                  u.nome as auditor_nome
           FROM lotes_controle_qualidade l
           LEFT JOIN usuarios u ON u.id = l.auditor_id
           WHERE l.id = $1`,
          [id]
        );
        const lote = loteResult.rows[0];
        if (!lote) {
          return reply.status(404).send({ error: 'Lote não encontrado' });
        }

        const itensResult = await server.database.query(
          `SELECT i.id, i.ordem, i.resultado, i.motivo_codigo, i.data_auditoria, i.repositorio_id,
                  r.id_repositorio_ged, r.orgao, r.projeto, r.status_atual
           FROM lotes_controle_qualidade_itens i
           JOIN repositorios r ON r.id_repositorio_recorda = i.repositorio_id
           WHERE i.lote_id = $1
           ORDER BY i.ordem`,
          [id]
        );

        const aprovados = itensResult.rows.filter((row) => row.resultado === 'APROVADO').length;
        const reprovados = itensResult.rows.filter((row) => row.resultado === 'REPROVADO').length;
        const snapshot = {
          lote,
          itens: itensResult.rows,
          totais: {
            total: itensResult.rows.length,
            aprovados,
            reprovados,
          },
          geradoEm: new Date().toISOString(),
        };

        const pdfBuffer = await pdfService.gerarRelatorioEntrega({
          lote: lote as {
            codigo: string;
            status: string;
            auditor_nome?: string | null;
            data_criacao?: string | null;
            data_fechamento?: string | null;
          },
          itens: itensResult.rows as Array<{
            ordem: number;
            id_repositorio_ged: string;
            orgao: string;
            projeto: string;
            resultado: string;
            motivo_codigo?: string | null;
          }>,
          totais: {
            total: itensResult.rows.length,
            aprovados,
            reprovados,
          },
          geradoEm: new Date().toISOString(),
        });
        const report = await saveOperationalReport({
          server,
          userId: user.id,
          tipo: 'ENTREGA',
          snapshot,
          pdfBuffer,
          loteId: id,
        });

        return reply.status(201).send(report);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao gerar relatório de entrega';
        return reply.status(400).send({ error: message });
      }
    });

    // ─── Per-document CQ evaluation endpoints ───────────────────────────

    // GET /operacional/repositorios/:id/cq-avaliacoes - List document evaluations for a repo
    server.get('/operacional/repositorios/:id/cq-avaliacoes', {
      schema: {
        tags: ['operacional-cq'],
        summary: 'Listar avaliações CQ por documento de um repositório',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };

        // Get all processes + apensos for this repo with their CQ evaluation (if any)
        const result = await server.database.query(
          `SELECT
             p.id AS processo_id,
             p.protocolo,
             p.interessado,
             p.volume_atual::text AS volume,
             p.observacao AS processo_obs,
             p.criado_em AS processo_criado_em,
             FALSE AS is_apenso,
             NULL::uuid AS processo_principal_id,
             a.id AS avaliacao_id,
             COALESCE(a.resultado, 'PENDENTE') AS resultado,
             a.observacao,
             a.avaliador_id,
             u.nome AS avaliador_nome,
             a.data_avaliacao
           FROM recebimento_processos p
           LEFT JOIN cq_avaliacoes a ON a.processo_id = p.id AND a.repositorio_id = $1
           LEFT JOIN usuarios u ON u.id = a.avaliador_id
           WHERE p.repositorio_id = $1
           UNION ALL
           SELECT
             ap.id AS processo_id,
             ap.protocolo,
             ap.interessado,
             ap.volume_atual::text AS volume,
             NULL AS processo_obs,
             ap.criado_em AS processo_criado_em,
             TRUE AS is_apenso,
             ap.processo_principal_id,
             a2.id AS avaliacao_id,
             COALESCE(a2.resultado, 'PENDENTE') AS resultado,
             a2.observacao,
             a2.avaliador_id,
             u2.nome AS avaliador_nome,
             a2.data_avaliacao
           FROM recebimento_apensos ap
           JOIN recebimento_processos pp ON pp.id = ap.processo_principal_id
           LEFT JOIN cq_avaliacoes a2 ON a2.processo_id = ap.id AND a2.repositorio_id = $1
           LEFT JOIN usuarios u2 ON u2.id = a2.avaliador_id
           WHERE pp.repositorio_id = $1
           ORDER BY processo_criado_em ASC`,
          [id]
        );

        const total = result.rows.length;
        const aprovados = result.rows.filter((r) => r.resultado === 'APROVADO').length;
        const reprovados = result.rows.filter((r) => r.resultado === 'REPROVADO').length;
        const pendentes = total - aprovados - reprovados;

        return reply.send({
          itens: result.rows,
          resumo: { total, aprovados, reprovados, pendentes },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar avaliações CQ';
        return reply.status(500).send({ error: message });
      }
    });

    // PUT /operacional/repositorios/:id/cq-avaliacoes/:processoId - Upsert evaluation for a document
    server.put('/operacional/repositorios/:id/cq-avaliacoes/:processoId', {
      schema: {
        tags: ['operacional-cq'],
        summary: 'Avaliar documento no CQ (aprovar/reprovar com observação)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' }, processoId: { type: 'string' } },
          required: ['id', 'processoId'],
        },
        body: {
          type: 'object',
          required: ['resultado'],
          properties: {
            resultado: { type: 'string', enum: ['APROVADO', 'REPROVADO'] },
            observacao: { type: 'string' },
          },
        },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id, processoId } = request.params as { id: string; processoId: string };
        const body = request.body as { resultado: string; observacao?: string };
        const user = getCurrentUser(request);

        // Determine if processoId belongs to an apenso
        const isApensoResult = await server.database.query<{ exists: boolean }>(
          `SELECT EXISTS(SELECT 1 FROM recebimento_apensos WHERE id = $1) AS exists`,
          [processoId]
        );
        const isApenso = isApensoResult.rows[0]?.exists ?? false;

        const result = await server.database.query(
          `INSERT INTO cq_avaliacoes (repositorio_id, processo_id, is_apenso, resultado, observacao, avaliador_id, data_avaliacao)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
           ON CONFLICT (repositorio_id, processo_id)
           DO UPDATE SET resultado = $4, observacao = $5, avaliador_id = $6,
                         data_avaliacao = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
           RETURNING *`,
          [id, processoId, isApenso, body.resultado, body.observacao ?? null, user.id]
        );

        return reply.send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao avaliar documento';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/repositorios/:id/cq-aprovar-todos - Approve all documents at once
    server.post('/operacional/repositorios/:id/cq-aprovar-todos', {
      schema: {
        tags: ['operacional-cq'],
        summary: 'Aprovar todos os documentos de um repositório no CQ',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = getCurrentUser(request);

        const result = await server.database.query(
          `INSERT INTO cq_avaliacoes (repositorio_id, processo_id, is_apenso, resultado, avaliador_id, data_avaliacao)
           SELECT $1, p.id, FALSE, 'APROVADO', $2, CURRENT_TIMESTAMP
           FROM recebimento_processos p
           WHERE p.repositorio_id = $1
           UNION ALL
           SELECT $1, ap.id, TRUE, 'APROVADO', $2, CURRENT_TIMESTAMP
           FROM recebimento_apensos ap
           JOIN recebimento_processos pp ON pp.id = ap.processo_principal_id
           WHERE pp.repositorio_id = $1
           ON CONFLICT (repositorio_id, processo_id)
           DO UPDATE SET resultado = 'APROVADO', avaliador_id = $2,
                         data_avaliacao = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
           RETURNING *`,
          [id, user.id]
        );

        return reply.send({ total: result.rows.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao aprovar todos';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/repositorios/:id/cq-concluir - Conclude CQ for a repo (all approved → CQ_APROVADO, has rejections → CQ_REPROVADO)
    server.post('/operacional/repositorios/:id/cq-concluir', {
      schema: {
        tags: ['operacional-cq'],
        summary: 'Concluir avaliação CQ de um repositório',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = getCurrentUser(request);

        // Check all docs (processos + apensos) are evaluated
        const stats = await server.database.query<{ total: string; pendentes: string; reprovados: string }>(
          `SELECT
             COUNT(doc_id)::text AS total,
             COUNT(doc_id) FILTER (WHERE COALESCE(resultado, 'PENDENTE') = 'PENDENTE')::text AS pendentes,
             COUNT(doc_id) FILTER (WHERE resultado = 'REPROVADO')::text AS reprovados
           FROM (
             SELECT p.id AS doc_id, a.resultado
             FROM recebimento_processos p
             LEFT JOIN cq_avaliacoes a ON a.processo_id = p.id AND a.repositorio_id = $1::uuid
             WHERE p.repositorio_id = $1::uuid
             UNION ALL
             SELECT ap.id AS doc_id, a2.resultado
             FROM recebimento_apensos ap
             JOIN recebimento_processos pp ON pp.id = ap.processo_principal_id
             LEFT JOIN cq_avaliacoes a2 ON a2.processo_id = ap.id AND a2.repositorio_id = $1::uuid
             WHERE pp.repositorio_id = $1::uuid
           ) docs`,
          [id]
        );

        const total = parseInt(stats.rows[0]?.total ?? '0', 10);
        const pendentes = parseInt(stats.rows[0]?.pendentes ?? '0', 10);
        const reprovados = parseInt(stats.rows[0]?.reprovados ?? '0', 10);

        if (total === 0) {
          return reply.status(400).send({ error: 'Repositório não possui processos cadastrados.' });
        }
        if (pendentes > 0) {
          return reply.status(400).send({
            error: `Existem ${pendentes} documento(s) pendente(s) de avaliação.`,
            code: 'DOCS_PENDENTES',
          });
        }

        // Only status_atual changes here (not etapa_atual), so the trigger won't fire
        const novoStatus = reprovados > 0 ? 'CQ_REPROVADO' : 'CQ_APROVADO';
        await server.database.query(
          `UPDATE repositorios SET status_atual = $2 WHERE id_repositorio_recorda = $1`,
          [id, novoStatus]
        );

        await server.database.query(
          `INSERT INTO historico_etapas (repositorio_id, etapa_origem, etapa_destino, status_origem, status_destino, usuario_id, detalhes)
           VALUES ($1, 'CONTROLE_QUALIDADE', 'CONTROLE_QUALIDADE', 'AGUARDANDO_CQ_LOTE', $2, $3,
                   jsonb_build_object('origem', 'cq_avaliacoes', 'total', $4, 'reprovados', $5))`,
          [id, novoStatus, user.id, total, reprovados]
        );

        return reply.send({ status: novoStatus, total, reprovados });
      } catch (error) {
        server.log.error(error, 'cq-concluir failed');
        const message = error instanceof Error ? error.message : 'Erro ao concluir CQ';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/repositorios/:id/cq-devolver - Return repo to CQ for re-evaluation (after corrections)
    server.post('/operacional/repositorios/:id/cq-devolver', {
      schema: {
        tags: ['operacional-cq'],
        summary: 'Devolver repositório para reavaliação CQ (após correções)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = getCurrentUser(request);

        // Reset rejected evaluations to PENDENTE for re-evaluation
        await server.database.query(
          `UPDATE cq_avaliacoes SET resultado = 'PENDENTE', data_avaliacao = NULL, atualizado_em = CURRENT_TIMESTAMP
           WHERE repositorio_id = $1 AND resultado = 'REPROVADO'`,
          [id]
        );

        // Only status_atual changes (not etapa_atual), so the trigger won't fire
        await server.database.query(
          `UPDATE repositorios SET status_atual = 'AGUARDANDO_CQ_LOTE' WHERE id_repositorio_recorda = $1`,
          [id]
        );

        await server.database.query(
          `INSERT INTO historico_etapas (repositorio_id, etapa_origem, etapa_destino, status_origem, status_destino, usuario_id, detalhes)
           VALUES ($1, 'CONTROLE_QUALIDADE', 'CONTROLE_QUALIDADE', 'CQ_REPROVADO', 'AGUARDANDO_CQ_LOTE', $2,
                   jsonb_build_object('origem', 'cq_devolucao'))`,
          [id, user.id]
        );

        return reply.send({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao devolver repositório';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/repositorios/:id/termo-correcao - Generate correction term PDF
    server.post('/operacional/repositorios/:id/termo-correcao', {
      schema: {
        tags: ['operacional-cq'],
        summary: 'Gerar Termo de Correção (documentos reprovados)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = getCurrentUser(request);

        const repoResult = await server.database.query(
          `SELECT id_repositorio_recorda, id_repositorio_ged, orgao, projeto FROM repositorios WHERE id_repositorio_recorda = $1`,
          [id]
        );
        const repo = repoResult.rows[0];
        if (!repo) return reply.status(404).send({ error: 'Repositório não encontrado' });

        const docsResult = await server.database.query(
          `SELECT p.protocolo, p.interessado, p.volume_atual::text AS volume,
                  a.resultado, a.observacao, u.nome AS avaliador_nome
           FROM recebimento_processos p
           JOIN cq_avaliacoes a ON a.processo_id = p.id AND a.repositorio_id = $1
           LEFT JOIN usuarios u ON u.id = a.avaliador_id
           WHERE p.repositorio_id = $1 AND a.resultado = 'REPROVADO'
           ORDER BY p.criado_em ASC`,
          [id]
        );

        if (docsResult.rows.length === 0) {
          return reply.status(400).send({ error: 'Nenhum documento reprovado para gerar termo de correção.' });
        }

        const pdfBuffer = await pdfService.gerarTermoCorrecao({
          repositorio: repo as { id_repositorio_ged: string; orgao: string; projeto: string },
          documentos: docsResult.rows as Array<{
            protocolo: string; interessado: string; volume: string;
            observacao: string | null; avaliador_nome: string | null;
          }>,
          geradoEm: new Date().toISOString(),
        });

        const snapshot = {
          repositorio: repo,
          documentosReprovados: docsResult.rows,
          geradoEm: new Date().toISOString(),
        };

        const report = await saveOperationalReport({
          server,
          userId: user.id,
          tipo: 'CORRECAO',
          snapshot,
          pdfBuffer,
          repositorioId: id,
        });

        return reply.status(201).send(report);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao gerar termo de correção';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/repositorios/:id/termo-devolucao - Generate return term PDF (same pattern as recebimento)
    server.post('/operacional/repositorios/:id/termo-devolucao', {
      schema: {
        tags: ['operacional-cq'],
        summary: 'Gerar Termo de Devolução (repositório aprovado)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = getCurrentUser(request);

        const repoResult = await server.database.query(
          `SELECT id_repositorio_recorda, id_repositorio_ged, orgao, projeto FROM repositorios WHERE id_repositorio_recorda = $1`,
          [id]
        );
        const repo = repoResult.rows[0];
        if (!repo) return reply.status(404).send({ error: 'Repositório não encontrado' });

        const docsResult = await server.database.query(
          `SELECT p.protocolo, p.interessado, p.volume_atual::text AS volume,
                  p.numero_caixas, p.caixa_nova,
                  COALESCE(s.nome, '') AS setor,
                  COALESCE(c.nome, '') AS classificacao,
                  COALESCE(p.observacao, '') AS obs,
                  FALSE AS is_apenso,
                  p.criado_em
           FROM recebimento_processos p
           LEFT JOIN setores_recebimento s ON s.id = p.setor_id
           LEFT JOIN classificacoes_recebimento c ON c.id = p.classificacao_id
           WHERE p.repositorio_id = $1
           UNION ALL
           SELECT ap.protocolo, ap.interessado, ap.volume_atual::text AS volume,
                  1 AS numero_caixas, FALSE AS caixa_nova,
                  '' AS setor, '' AS classificacao, '' AS obs,
                  TRUE AS is_apenso,
                  ap.criado_em
           FROM recebimento_apensos ap
           JOIN recebimento_processos pp ON pp.id = ap.processo_principal_id
           WHERE pp.repositorio_id = $1
           ORDER BY criado_em ASC`,
          [id]
        );

        // Use the same recebimento report format for devolução
        const processos = docsResult.rows.map((row) => ({
          repositorio: repo.id_repositorio_ged,
          orgao: repo.orgao,
          protocolo: row.protocolo,
          interessado: row.interessado,
          setor: row.setor,
          classificacao: row.classificacao,
          volume: row.volume ?? '1',
          numeroCaixas: row.numero_caixas ?? 1,
          caixaNova: row.caixa_nova ?? false,
          isApenso: row.is_apenso ?? false,
          obs: row.obs ?? '',
        }));

        const empresa = await server.database.query(
          `SELECT nome, logo_url AS "logoUrl", exibir_logo_relatorio AS "exibirLogoRelatorio" FROM configuracao_empresa LIMIT 1`
        );

        const pdfBuffer = await pdfService.gerarTermoDevolucao({
          projeto: repo.projeto,
          responsavel: user.id,
          processos,
          geradoEm: new Date().toISOString(),
        }, empresa.rows[0] ?? null);

        const snapshot = {
          repositorio: repo,
          processos,
          geradoEm: new Date().toISOString(),
        };

        const report = await saveOperationalReport({
          server,
          userId: user.id,
          tipo: 'DEVOLUCAO',
          snapshot,
          pdfBuffer,
          repositorioId: id,
        });

        return reply.status(201).send(report);
      } catch (error) {
        server.log.error(error, 'termo-devolucao failed');
        const message = error instanceof Error ? error.message : 'Erro ao gerar termo de devolução';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/termo-devolucao - Generate combined return term PDF for multiple repos
    server.post('/operacional/termo-devolucao', {
      schema: {
        tags: ['operacional-cq'],
        summary: 'Gerar Termo de Devolução (múltiplos repositórios aprovados)',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const body = request.body as { repositorioIds?: string[] };
        const ids = body.repositorioIds;
        if (!ids || ids.length === 0) {
          return reply.status(400).send({ error: 'repositorioIds é obrigatório' });
        }
        const user = getCurrentUser(request);

        const allProcessos: Array<{
          repositorio: string; orgao: string; protocolo: string; interessado: string;
          setor: string; classificacao: string; volume: string; numeroCaixas: number;
          caixaNova: boolean; isApenso: boolean; obs: string;
        }> = [];
        let projeto = '';

        for (const repoId of ids) {
          const repoResult = await server.database.query(
            `SELECT id_repositorio_recorda, id_repositorio_ged, orgao, projeto FROM repositorios WHERE id_repositorio_recorda = $1`,
            [repoId]
          );
          const repo = repoResult.rows[0];
          if (!repo) continue;
          if (!projeto) projeto = repo.projeto;

          const docsResult = await server.database.query(
            `SELECT p.protocolo, p.interessado, p.volume_atual::text AS volume,
                    p.numero_caixas, p.caixa_nova,
                    COALESCE(s.nome, '') AS setor,
                    COALESCE(c.nome, '') AS classificacao,
                    COALESCE(p.observacao, '') AS obs
             FROM recebimento_processos p
             LEFT JOIN setores_recebimento s ON s.id = p.setor_id
             LEFT JOIN classificacoes_recebimento c ON c.id = p.classificacao_id
             WHERE p.repositorio_id = $1
             ORDER BY p.criado_em ASC`,
            [repoId]
          );

          for (const row of docsResult.rows) {
            allProcessos.push({
              repositorio: repo.id_repositorio_ged,
              orgao: repo.orgao,
              protocolo: row.protocolo,
              interessado: row.interessado,
              setor: row.setor,
              classificacao: row.classificacao,
              volume: row.volume ?? '1',
              numeroCaixas: row.numero_caixas ?? 1,
              caixaNova: row.caixa_nova ?? false,
              isApenso: false,
              obs: row.obs ?? '',
            });
          }
        }

        const empresa = await server.database.query(
          `SELECT nome, logo_url AS "logoUrl", exibir_logo_relatorio AS "exibirLogoRelatorio" FROM configuracao_empresa LIMIT 1`
        );

        const pdfBuffer = await pdfService.gerarTermoDevolucao({
          projeto,
          responsavel: user.id,
          processos: allProcessos,
          geradoEm: new Date().toISOString(),
        }, empresa.rows[0] ?? null);

        const snapshot = {
          repositorioIds: ids,
          processos: allProcessos,
          geradoEm: new Date().toISOString(),
        };

        const report = await saveOperationalReport({
          server,
          userId: user.id,
          tipo: 'DEVOLUCAO',
          snapshot,
          pdfBuffer,
          repositorioId: ids[0]!,
        });

        return reply.status(201).send(report);
      } catch (error) {
        server.log.error(error, 'termo-devolucao-multi failed');
        const message = error instanceof Error ? error.message : 'Erro ao gerar termo de devolução';
        return reply.status(400).send({ error: message });
      }
    });

    // GET /operacional/relatorios/:id/download - Download do PDF operacional
    // Supports ?token= query param for iframe preview (copies token to Authorization header)
    server.get('/operacional/relatorios/:id/download', {
      preHandler: [
        async (request) => {
          const { token } = request.query as { token?: string };
          if (token && !request.headers.authorization) {
            request.headers.authorization = `Bearer ${token}`;
          }
        },
        server.authenticate,
        authorize('operador', 'administrador'),
      ],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const reportResult = await server.database.query<{
          id: string;
          tipo: string;
          arquivo_path: string;
          gerado_em: string;
        }>(
          `SELECT id, tipo, arquivo_path, gerado_em
           FROM relatorios_operacionais
           WHERE id = $1`,
          [id]
        );

        const report = reportResult.rows[0];
        if (!report) {
          return reply.status(404).send({ error: 'Relatório não encontrado' });
        }

        const uploadsBase = path.resolve(process.cwd(), 'uploads');
        const fullPath = path.join(uploadsBase, report.arquivo_path);
        const fileBuffer = await fs.readFile(fullPath);
        const filename = `relatorio-${report.tipo.toLowerCase()}-${report.id}.pdf`;

        const { token: qToken } = request.query as { token?: string };
        const disposition = qToken ? 'inline' : `attachment; filename="${filename}"`;

        return reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', disposition)
          .send(fileBuffer);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao baixar relatório';
        return reply.status(400).send({ error: message });
      }
    });
  };
}
