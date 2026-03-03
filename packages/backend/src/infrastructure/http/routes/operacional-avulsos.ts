import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { sendDatabaseError } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import {
  ocrPreviewSchema,
  criarProcessoAvulsoSchema,
  criarProcessosBatchSchema,
  vincularProcessosSchema,
} from '../schemas/operacional.js';
import {
  type OrigemDocumentoRecebimento,
  getCurrentUser,
  extractOCRPreview,
  loadRepositorio,
} from './operacional-helpers.js';

/**
 * Avulsos routes: OCR preview, CRUD avulsos, batch add, vincular/desvincular.
 */
export function createOperacionalAvulsosRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    const ocrService = server.ocrService;

    // POST /operacional/recebimento-avulsos/ocr-preview — OCR sem repositório
    server.post('/operacional/recebimento-avulsos/ocr-preview', {
      schema: { tags: ['operacional'], summary: 'OCR preview sem repositório', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(ocrPreviewSchema)],
    }, async (request, reply) => {
      try {
        const { imagemBase64 } = request.body as { imagemBase64: string };

        const validacao = await ocrService.validarImagem(imagemBase64);
        if (!validacao.valida) {
          return reply.status(400).send({ error: validacao.erro ?? 'Imagem inválida' });
        }

        const resultado = await ocrService.extrairTexto(imagemBase64);
        const preview = extractOCRPreview(resultado.texto, resultado.confianca);
        return reply.send(preview);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao processar OCR';
        return reply.status(400).send({ error: message });
      }
    });

    // GET /operacional/recebimento-avulsos
    server.get('/operacional/recebimento-avulsos', {
      schema: { tags: ['operacional'], summary: 'Listar processos avulsos com paginação', security: [{ bearerAuth: [] }], querystring: { type: 'object', properties: { busca: { type: 'string' }, pagina: { type: 'number', default: 1 }, limite: { type: 'number', default: 50 } } } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const query = request.query as { busca?: string; pagina?: string | number; limite?: string | number };
        const busca = query.busca?.trim() ?? '';
        const limite = Math.min(Math.max(Number(query.limite ?? 50), 1), 100);
        const pagina = Math.max(Number(query.pagina ?? 1), 1);
        const offset = (pagina - 1) * limite;

        let where = `WHERE rp.repositorio_id IS NULL`;
        const params: unknown[] = [];

        if (busca) {
          params.push(`%${busca}%`);
          where += ` AND (rp.protocolo ILIKE $${params.length} OR rp.interessado ILIKE $${params.length})`;
        }

        const totalResult = await server.database.query<{ total: string }>(
          `SELECT COUNT(*)::text as total
           FROM recebimento_processos rp
           ${where}`,
          params
        );
        const total = parseInt(totalResult.rows[0]?.total ?? '0', 10);

        params.push(limite, offset);
        const pLimite = params.length - 1;
        const pOffset = params.length;
        const result = await server.database.query(
          `SELECT rp.id, rp.protocolo, rp.interessado,
                 rp.setor_id, sr.nome AS setor_nome,
                 rp.classificacao_id, cr.nome AS classificacao_nome,
                 rp.volume_atual, rp.volume_total, rp.numero_caixas, rp.caixa_nova,
                 rp.origem, rp.ocr_confianca, rp.observacao, rp.criado_em
          FROM recebimento_processos rp
          LEFT JOIN setores_recebimento sr ON sr.id = rp.setor_id
          LEFT JOIN classificacoes_recebimento cr ON cr.id = rp.classificacao_id
          ${where}
          ORDER BY rp.criado_em DESC
          LIMIT $${pLimite} OFFSET $${pOffset}`,
          params
        );

        // Fetch apensos for each avulso process
        const processos = [];
        for (const proc of result.rows as Array<Record<string, unknown> & { id: string }>) {
          const apResult = await server.database.query(
            `SELECT id, protocolo, interessado,
                    volume_atual, volume_total, origem, criado_em
             FROM recebimento_apensos
             WHERE processo_principal_id = $1
             ORDER BY criado_em ASC`,
            [proc.id]
          );
          processos.push({ ...proc, apensos: apResult.rows });
        }

        return reply.send({
          processos,
          total,
          pagina,
          totalPaginas: Math.ceil(total / limite),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar processos avulsos';
        return sendDatabaseError(reply, error, message);
      }
    });

    // POST /operacional/recebimento-avulsos — criar processo sem repositório
    server.post('/operacional/recebimento-avulsos', {
      schema: { tags: ['operacional'], summary: 'Criar processo avulso (sem repositório)', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(criarProcessoAvulsoSchema)],
    }, async (request, reply) => {
      try {
        const user = getCurrentUser(request);
        const body = request.body as {
          protocolo: string;
          interessado: string;
          setorId?: string | null;
          classificacaoId?: string | null;
          volumeAtual?: number;
          volumeTotal?: number;
          numeroCaixas?: number;
          caixaNova?: boolean;
          observacao?: string;
          origem?: OrigemDocumentoRecebimento;
          ocrConfianca?: number | null;
        };

        const result = await server.database.query(
          `INSERT INTO recebimento_processos (
             repositorio_id, protocolo, interessado,
             setor_id, classificacao_id,
             volume_atual, volume_total, numero_caixas, caixa_nova,
             observacao, origem, ocr_confianca, criado_por
           )
           VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING *`,
          [
            body.protocolo.trim(),
            body.interessado.trim(),
            body.setorId ?? null,
            body.classificacaoId ?? null,
            Math.max(Number(body.volumeAtual ?? 1), 1),
            Math.max(Number(body.volumeTotal ?? 0), 0),
            Math.max(Number(body.numeroCaixas ?? 1), 1),
            Boolean(body.caixaNova),
            body.observacao?.trim() ?? '',
            body.origem ?? 'MANUAL',
            body.ocrConfianca ?? null,
            user.id,
          ]
        );

        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao criar processo avulso';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/repositorios/:id/recebimento-processos/batch — adicionar vários de uma vez
    server.post('/operacional/repositorios/:id/recebimento-processos/batch', {
      schema: { tags: ['operacional'], summary: 'Adicionar processos em lote a repositório', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(criarProcessosBatchSchema)],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = getCurrentUser(request);
        const body = request.body as {
          processos: Array<{
            protocolo: string;
            interessado: string;
            setorId?: string | null;
            classificacaoId?: string | null;
            volumeAtual?: number;
            volumeTotal?: number;
            numeroCaixas?: number;
            caixaNova?: boolean;
            origem?: OrigemDocumentoRecebimento;
            ocrConfianca?: number | null;
          }>;
        };

        const repositorio = await loadRepositorio(server, id);
        if (!repositorio) {
          return reply.status(404).send({ error: 'Repositório não encontrado' });
        }

        const criados = [];
        for (const proc of body.processos) {
          const result = await server.database.query(
            `INSERT INTO recebimento_processos (
               repositorio_id, protocolo, interessado,
               setor_id, classificacao_id,
               volume_atual, volume_total, numero_caixas, caixa_nova,
               origem, ocr_confianca, criado_por
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING *`,
            [
              id,
              proc.protocolo.trim(),
              proc.interessado.trim(),
              proc.setorId ?? null,
              proc.classificacaoId ?? null,
              Math.max(Number(proc.volumeAtual ?? 1), 1),
              Math.max(Number(proc.volumeTotal ?? 0), 0),
              Math.max(Number(proc.numeroCaixas ?? 1), 1),
              Boolean(proc.caixaNova),
              proc.origem ?? 'MANUAL',
              proc.ocrConfianca ?? null,
              user.id,
            ]
          );
          criados.push(result.rows[0]);
        }

        return reply.status(201).send({ processos: criados, total: criados.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao adicionar processos em lote';
        return reply.status(400).send({ error: message });
      }
    });

    // PATCH /operacional/recebimento-processos/vincular — vincular avulsos a um repositório
    server.patch('/operacional/recebimento-processos/vincular', {
      schema: { tags: ['operacional'], summary: 'Vincular processos avulsos a repositório', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(vincularProcessosSchema)],
    }, async (request, reply) => {
      try {
        const body = request.body as {
          processoIds: string[];
          repositorioId: string;
        };

        const repositorio = await loadRepositorio(server, body.repositorioId);
        if (!repositorio) {
          return reply.status(404).send({ error: 'Repositório não encontrado' });
        }

        // Verificar que todos os processos existem e estão sem repositório
        const checkResult = await server.database.query(
          `SELECT id, repositorio_id FROM recebimento_processos WHERE id = ANY($1)`,
          [body.processoIds]
        );

        const encontrados = checkResult.rows as Array<{ id: string; repositorio_id: string | null }>;
        if (encontrados.length !== body.processoIds.length) {
          const encontradosIds = new Set(encontrados.map(r => r.id));
          const naoEncontrados = body.processoIds.filter(id => !encontradosIds.has(id));
          return reply.status(400).send({
            error: `Processos não encontrados: ${naoEncontrados.join(', ')}`,
          });
        }

        const jaVinculados = encontrados.filter(r => r.repositorio_id !== null);
        if (jaVinculados.length > 0) {
          return reply.status(400).send({
            error: `${jaVinculados.length} processo(s) já estão vinculados a um repositório. Desvincule primeiro.`,
          });
        }

        const result = await server.database.query(
          `UPDATE recebimento_processos
           SET repositorio_id = $1, atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ANY($2) AND repositorio_id IS NULL
           RETURNING id`,
          [body.repositorioId, body.processoIds]
        );

        return reply.send({
          vinculados: (result.rows as Array<{ id: string }>).length,
          repositorioId: body.repositorioId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao vincular processos';
        return reply.status(400).send({ error: message });
      }
    });

    // PATCH /operacional/recebimento-processos/desvincular — remover vínculo com repositório
    server.patch('/operacional/recebimento-processos/desvincular', {
      schema: { tags: ['operacional'], summary: 'Desvincular processos de repositório', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const body = request.body as { processoIds: string[] };
        if (!body.processoIds?.length) {
          return reply.status(400).send({ error: 'processoIds é obrigatório' });
        }

        const result = await server.database.query(
          `UPDATE recebimento_processos
           SET repositorio_id = NULL, atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ANY($1) AND repositorio_id IS NOT NULL
           RETURNING id`,
          [body.processoIds]
        );

        return reply.send({ desvinculados: (result.rows as Array<{ id: string }>).length });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao desvincular processos';
        return reply.status(400).send({ error: message });
      }
    });

  };
}

