import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { sendDatabaseError } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import {
  nomeObrigatorioSchema,
  criarRepositorioSchema,
  ocrPreviewSchema,
} from '../schemas/operacional.js';
import {
  type EtapaFluxo,
  type StatusRepositorio,
  getCurrentUser,
  extractOCRPreview,
  loadRepositorio,
} from './operacional-helpers.js';

/**
 * Normaliza id_repositorio_ged para formato padrão: 000000/YYYY
 * Exemplos:
 *   "16/2025"       -> "000016/2025"
 *   "000500 / 2025" -> "000500/2025"
 *   "500/2025"      -> "000500/2025"
 *   "216"           -> "000216/{anoReferencia}" (usa ano da data de referência)
 */
export function normalizeIdRepositorioGed(raw: string, anoReferencia?: number): string {
  const limpo = raw.replace(/\s/g, '').trim();
  if (!limpo) return '';

  let numero: string;
  let ano: string;

  if (limpo.includes('/')) {
    const parts = limpo.split('/');
    numero = parts[0] ?? '';
    ano = parts[1] ?? '';
  } else {
    numero = limpo;
    ano = String(anoReferencia ?? new Date().getFullYear());
  }

  // Pad número para 6 dígitos
  const numeroPadded = numero.replace(/^0+/, '').padStart(6, '0');
  // Garantir ano com 4 dígitos
  const anoFinal = ano.length === 2 ? `20${ano}` : ano;

  return `${numeroPadded}/${anoFinal}`;
}

export function createOperacionalRepositoriosRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    const ocrService = server.ocrService;
    const PROJETO_IMPORTACAO_PRODUCAO = 'IMPORTACAO_PRODUCAO';

    // POST /operacional/repositorios - Criar repositório
    server.post('/operacional/repositorios', {
      schema: {
        tags: ['operacional'],
        summary: 'Criar repositório',
        description: 'Cria um novo repositório operacional na etapa de Recebimento.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['idRepositorioGed', 'orgao', 'projeto', 'classificacaoId'],
          properties: {
            idRepositorioGed: { type: 'string', description: 'ID do repositório no GED (ex: 000016/2025)' },
            orgao: { type: 'string' },
            projeto: { type: 'string' },
            classificacaoId: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(criarRepositorioSchema)],
    }, async (request, reply) => {
      try {
        const body = request.body as {
          idRepositorioGed: string;
          orgao: string;
          projeto: string;
          classificacaoId: string;
        };

        const result = await server.database.query(
          `INSERT INTO repositorios (
             id_repositorio_ged,
             orgao,
             projeto,
             classificacao_padrao_id,
             status_atual,
             etapa_atual
           )
           VALUES ($1, $2, $3, $4, 'RECEBIDO', 'RECEBIMENTO')
           RETURNING *`,
          [
            normalizeIdRepositorioGed(body.idRepositorioGed.trim()),
            body.orgao.trim(),
            body.projeto.trim(),
            body.classificacaoId,
          ]
        );

        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        server.log.error({ error }, 'Erro ao criar repositorio operacional');

        const pgError = error as {
          code?: string;
          constraint?: string;
          column?: string;
          message?: string;
        };

        if (
          pgError.code === '23505' ||
          pgError.constraint === 'repositorios_id_repositorio_ged_key' ||
          pgError.constraint === 'uk_repositorios_ged_orgao_projeto'
        ) {
          return reply.status(409).send({ error: 'repositorio ja cadastrado para esta unidade e projeto' });
        }

        if (
          pgError.code === '23502' &&
          (pgError.column === 'localizacao_fisica_armario_id' ||
            (pgError.message ?? '').includes('localizacao_fisica_armario_id'))
        ) {
          return reply.status(500).send({
            error:
              'Schema do banco desatualizado (localizacao_fisica_armario_id NOT NULL). Rode as migrations pendentes.',
          });
        }

        if (pgError.code === '23514' || pgError.code === '22P02' || pgError.code === '23502') {
          return reply.status(400).send({ error: pgError.message ?? 'Dados invalidos para criar repositorio' });
        }

        return reply.status(500).send({ error: pgError.message ?? 'Erro ao criar repositorio' });
      }
    });

    server.get('/operacional/orgaos-recebimento', {
      schema: {
        tags: ['operacional'],
        summary: 'Listar unidades para criacao de repositorio',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (_request, reply) => {
      try {
        const result = await server.database.query(
          `WITH unidades_config AS (
             SELECT id::text AS id, TRIM(nome) AS nome
             FROM unidades_recebimento
             WHERE ativo = TRUE AND TRIM(nome) <> ''
           ),
           unidades_historico AS (
             SELECT DISTINCT md5(LOWER(TRIM(orgao))) AS id, TRIM(orgao) AS nome
             FROM repositorios
             WHERE orgao IS NOT NULL
               AND TRIM(orgao) <> ''
               AND projeto NOT IN ('LEGADO', $1)
           ),
           unidades_uniao AS (
             SELECT id, nome FROM unidades_config
             UNION ALL
             SELECT id, nome FROM unidades_historico
           ),
           unidades_dedup AS (
             SELECT MIN(id) AS id, nome
             FROM unidades_uniao
             GROUP BY LOWER(TRIM(nome))
           )
           SELECT id, nome
           FROM unidades_dedup
           ORDER BY LOWER(nome) ASC`,
          [PROJETO_IMPORTACAO_PRODUCAO]
        );
        return reply.send({ itens: result.rows });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar unidades';
        if (message.includes('unidades_recebimento')) {
          const fallbackResult = await server.database.query(
            `SELECT DISTINCT md5(LOWER(TRIM(orgao))) AS id, TRIM(orgao) AS nome
             FROM repositorios
             WHERE orgao IS NOT NULL
               AND TRIM(orgao) <> ''
               AND projeto NOT IN ('LEGADO', $1)
             ORDER BY nome ASC`,
            [PROJETO_IMPORTACAO_PRODUCAO]
          );
          return reply.send({ itens: fallbackResult.rows });
        }
        return sendDatabaseError(reply, error, message);
      }
    });

    server.post('/operacional/orgaos-recebimento', {
      schema: {
        tags: ['operacional'],
        summary: 'Criar unidade de recebimento',
        security: [{ bearerAuth: [] }],
        body: { type: 'object', required: ['nome'], properties: { nome: { type: 'string' } } },
        response: {
          201: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(nomeObrigatorioSchema)],
    }, async (request, reply) => {
      try {
        const user = getCurrentUser(request);
        const { nome } = request.body as { nome: string };
        const result = await server.database.query(
          `INSERT INTO unidades_recebimento (nome, criado_por)
           VALUES ($1, $2)
           ON CONFLICT (LOWER(TRIM(nome))) WHERE ativo = TRUE
           DO UPDATE SET nome = EXCLUDED.nome
           RETURNING id, nome`,
          [nome, user.id]
        );
        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao criar unidade';
        return reply.status(400).send({ error: message });
      }
    });

    // GET /operacional/repositorios - Listar repositorios operacionais
    server.get('/operacional/repositorios', {
      schema: {
        tags: ['operacional'],
        summary: 'Listar repositórios',
        description: 'Lista repositórios operacionais com filtros e paginação.',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Filtrar por status' },
            etapa: { type: 'string', description: 'Filtrar por etapa' },
            orgao: { type: 'string', description: 'Filtrar por unidade (exato, case-insensitive)' },
            projeto: { type: 'string', description: 'Filtrar por projeto (exato, case-insensitive)' },
            busca: { type: 'string', description: 'Busca por ID GED, órgão ou projeto' },
            dataInicio: { type: 'string', format: 'date', description: 'Filtrar por data de criação a partir desta data (inclusive)' },
            dataFim: { type: 'string', format: 'date', description: 'Filtrar por data de criação até esta data (inclusive)' },
            pagina: { type: 'integer', default: 1 },
            limite: { type: 'integer', default: 20 },
          },
        },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const query = request.query as {
          status?: StatusRepositorio;
          etapa?: EtapaFluxo;
          orgao?: string;
          projeto?: string;
          busca?: string;
          dataInicio?: string;
          dataFim?: string;
          pagina?: string | number;
          limite?: string | number;
        };

        const pagina = Number(query.pagina ?? 1);
        const limite = Math.min(Math.max(Number(query.limite ?? 20), 1), 100);
        const offset = (pagina - 1) * limite;

        let where = 'WHERE r.projeto NOT IN ($1, $2)';
        const params: (string | number)[] = ['LEGADO', PROJETO_IMPORTACAO_PRODUCAO];
        let p = 3;

        if (query.status) {
          where += ` AND r.status_atual = $${p++}`;
          params.push(query.status);
        }
        if (query.etapa) {
          where += ` AND r.etapa_atual = $${p++}`;
          params.push(query.etapa);
        }
        if (query.orgao) {
          where += ` AND LOWER(TRIM(r.orgao)) = LOWER(TRIM($${p++}))`;
          params.push(query.orgao);
        }
        if (query.projeto) {
          where += ` AND LOWER(TRIM(r.projeto)) = LOWER(TRIM($${p++}))`;
          params.push(query.projeto);
        }
        if (query.dataInicio) {
          where += ` AND r.data_criacao >= $${p++}::date`;
          params.push(query.dataInicio);
        }
        if (query.dataFim) {
          where += ` AND r.data_criacao < ($${p++}::date + INTERVAL '1 day')`;
          params.push(query.dataFim);
        }
        if (query.busca) {
          where += ` AND (
            r.id_repositorio_ged ILIKE $${p}
            OR r.orgao ILIKE $${p}
            OR r.projeto ILIKE $${p}
            OR EXISTS (
              SELECT 1
              FROM recebimento_processos rp
              WHERE rp.repositorio_id = r.id_repositorio_recorda
                AND (rp.protocolo ILIKE $${p} OR rp.interessado ILIKE $${p})
            )
            OR EXISTS (
              SELECT 1
              FROM recebimento_apensos ra
              JOIN recebimento_processos rp ON rp.id = ra.processo_principal_id
              WHERE rp.repositorio_id = r.id_repositorio_recorda
                AND (ra.protocolo ILIKE $${p} OR ra.interessado ILIKE $${p})
            )
          )`;
          params.push(`%${query.busca}%`);
          p++;
        }

        const totalResult = await server.database.query<{ total: string }>(
          `SELECT COUNT(*)::text as total
           FROM repositorios r
           ${where}`,
          params
        );
        const total = parseInt(totalResult.rows[0]?.total ?? '0', 10);

        params.push(limite, offset);
        const result = await server.database.query(
          `WITH ids AS (
             SELECT r.id_repositorio_recorda, r.etapa_atual
             FROM repositorios r
             ${where}
             ORDER BY r.data_criacao DESC
             LIMIT $${p++} OFFSET $${p}
           ),
           proc_count AS (
             SELECT rp.repositorio_id, COUNT(*)::int AS total_processos
             FROM recebimento_processos rp
             WHERE rp.repositorio_id IN (SELECT id_repositorio_recorda FROM ids)
             GROUP BY rp.repositorio_id
           ),
           checklist_flags AS (
             SELECT c.repositorio_id,
                    BOOL_OR(c.status = 'CONCLUIDO' AND c.etapa = ids.etapa_atual) AS checklist_concluido,
                    BOOL_OR(c.status = 'ABERTO'    AND c.etapa = ids.etapa_atual) AS checklist_aberto
             FROM checklists c
             JOIN ids ON ids.id_repositorio_recorda = c.repositorio_id
             GROUP BY c.repositorio_id
           ),
           prod_flags AS (
             SELECT pr.repositorio_id,
                    TRUE AS producao_registrada
             FROM producao_repositorio pr
             JOIN ids ON ids.id_repositorio_recorda = pr.repositorio_id
               AND pr.etapa = ids.etapa_atual
             GROUP BY pr.repositorio_id
           ),
           rel_count AS (
             SELECT ro.repositorio_id, COUNT(*)::int AS total_relatorios
             FROM relatorios_operacionais ro
             WHERE ro.repositorio_id IN (SELECT id_repositorio_recorda FROM ids)
             GROUP BY ro.repositorio_id
           ),
           hist_max AS (
             SELECT he.repositorio_id, MAX(he.data_evento) AS ultima_entrada
             FROM historico_etapas he
             JOIN ids ON ids.id_repositorio_recorda = he.repositorio_id
               AND he.etapa_destino = ids.etapa_atual
             GROUP BY he.repositorio_id
           )
           SELECT r.*,
                  COALESCE(pc.total_processos, 0)     AS total_processos,
                  COALESCE(cf.checklist_concluido, FALSE) AS checklist_concluido,
                  COALESCE(cf.checklist_aberto,    FALSE) AS checklist_aberto,
                  COALESCE(pf.producao_registrada, FALSE) AS producao_registrada,
                  COALESCE(rc.total_relatorios, 0)    AS total_relatorios,
                  EXTRACT(EPOCH FROM (NOW() - COALESCE(hm.ultima_entrada, r.data_criacao)))::int AS segundos_na_etapa
           FROM repositorios r
           JOIN ids ON ids.id_repositorio_recorda = r.id_repositorio_recorda
           LEFT JOIN proc_count  pc ON pc.repositorio_id  = r.id_repositorio_recorda
           LEFT JOIN checklist_flags cf ON cf.repositorio_id = r.id_repositorio_recorda
           LEFT JOIN prod_flags   pf ON pf.repositorio_id  = r.id_repositorio_recorda
           LEFT JOIN rel_count    rc ON rc.repositorio_id  = r.id_repositorio_recorda
           LEFT JOIN hist_max     hm ON hm.repositorio_id  = r.id_repositorio_recorda
           ORDER BY r.data_criacao DESC`,
          params
        );

        // Contadores por status para a etapa filtrada (para summary cards)
        let contadoresWhere = 'WHERE r.projeto NOT IN ($1, $2)';
        const contadoresParams: (string | number)[] = ['LEGADO', PROJETO_IMPORTACAO_PRODUCAO];
        let cp = 3;

        if (query.etapa) {
          contadoresWhere += ` AND r.etapa_atual = $${cp++}`;
          contadoresParams.push(query.etapa);
        }
        if (query.orgao) {
          contadoresWhere += ` AND LOWER(TRIM(r.orgao)) = LOWER(TRIM($${cp++}))`;
          contadoresParams.push(query.orgao);
        }
        if (query.projeto) {
          contadoresWhere += ` AND LOWER(TRIM(r.projeto)) = LOWER(TRIM($${cp++}))`;
          contadoresParams.push(query.projeto);
        }
        if (query.dataInicio) {
          contadoresWhere += ` AND r.data_criacao >= $${cp++}::date`;
          contadoresParams.push(query.dataInicio);
        }
        if (query.dataFim) {
          contadoresWhere += ` AND r.data_criacao < ($${cp++}::date + INTERVAL '1 day')`;
          contadoresParams.push(query.dataFim);
        }
        const contadoresResult = await server.database.query<{ status_atual: string; qtd: string }>(
          `SELECT r.status_atual, COUNT(*)::text AS qtd
           FROM repositorios r
           ${contadoresWhere}
           GROUP BY r.status_atual`,
          contadoresParams
        );
        const contadores: Record<string, number> = {};
        for (const row of contadoresResult.rows) {
          contadores[row.status_atual] = parseInt(row.qtd, 10);
        }

        return reply.send({
          itens: result.rows,
          total,
          pagina,
          totalPaginas: Math.ceil(total / limite),
          contadores,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar repositórios';
        return sendDatabaseError(reply, error, message);
      }
    });

    // DELETE /operacional/repositorios/:id - Excluir repositório (admin-only)
    server.delete('/operacional/repositorios/:id', {
      schema: {
        tags: ['operacional'],
        summary: 'Excluir repositório',
        description: 'Remove um repositório e todos os registros filhos. Apenas administradores.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };

        const repositorio = await loadRepositorio(server, id);
        if (!repositorio) {
          return reply.status(404).send({ error: 'Repositório não encontrado' });
        }


        await server.database.query('BEGIN');
        try {
          // Excluir registros filhos na ordem correta (respeitar RESTRICT FKs)
          await server.database.query(`DELETE FROM recebimento_documentos WHERE repositorio_id = $1`, [id]);
          await server.database.query(`DELETE FROM lotes_controle_qualidade_itens WHERE repositorio_id = $1`, [id]);
          await server.database.query(`DELETE FROM producao_repositorio WHERE repositorio_id = $1`, [id]);
          await server.database.query(`DELETE FROM checklist_itens WHERE checklist_id IN (SELECT id FROM checklists WHERE repositorio_id = $1)`, [id]);
          await server.database.query(`DELETE FROM checklists WHERE repositorio_id = $1`, [id]);
          await server.database.query(`DELETE FROM movimentacoes_armario WHERE repositorio_id = $1`, [id]);
          await server.database.query(`DELETE FROM excecoes_repositorio WHERE repositorio_id = $1`, [id]);
          await server.database.query(`DELETE FROM historico_etapas WHERE repositorio_id = $1`, [id]);
          await server.database.query(`DELETE FROM relatorios_operacionais WHERE repositorio_id = $1`, [id]);
          await server.database.query(`DELETE FROM repositorios WHERE id_repositorio_recorda = $1`, [id]);
          await server.database.query('COMMIT');
        } catch (innerError) {
          await server.database.query('ROLLBACK');
          throw innerError;
        }

        return reply.send({ message: 'Repositório excluído com sucesso' });
      } catch (error) {
        server.log.error(error, 'Erro ao excluir repositório');
        const message = error instanceof Error ? error.message : 'Erro ao excluir repositório';
        if (message.includes('violates foreign key')) {
          return reply.status(409).send({
            error: 'Repositório possui dependências que impedem a exclusão. Verifique se está em um lote de CQ.',
          });
        }
        return sendDatabaseError(reply, error, message);
      }
    });

    // POST /operacional/repositorios/:id/ocr-preview - OCR assistido para recebimento
    server.post('/operacional/repositorios/:id/ocr-preview', {
      schema: { tags: ['operacional'], summary: 'OCR assistido para recebimento', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(ocrPreviewSchema)],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { imagemBase64 } = request.body as { imagemBase64: string };

        const repositorio = await loadRepositorio(server, id);
        if (!repositorio) {
          return reply.status(404).send({ error: 'Repositorio nao encontrado' });
        }

        const validacao = await ocrService.validarImagem(imagemBase64);
        if (!validacao.valida) {
          return reply.status(400).send({ error: validacao.erro ?? 'Imagem invalida' });
        }

        const resultado = await ocrService.extrairTexto(imagemBase64);
        const preview = extractOCRPreview(resultado.texto, resultado.confianca);
        return reply.send(preview);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao processar OCR';
        return reply.status(400).send({ error: message });
      }
    });

    // PATCH /operacional/repositorios/:id/seadesk-confirmar - Confirmar envio Seadesk
    server.patch('/operacional/repositorios/:id/seadesk-confirmar', {
      schema: {
        tags: ['operacional'],
        summary: 'Confirmar envio Seadesk',
        description: 'Registra a confirmação de envio ao Seadesk para um repositório na etapa de Digitalização.',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = getCurrentUser(request);

        const repositorio = await loadRepositorio(server, id);
        if (!repositorio) {
          return reply.status(404).send({ error: 'Repositório não encontrado' });
        }

        if (repositorio.etapa_atual !== 'DIGITALIZACAO') {
          return reply.status(400).send({
            error: 'Confirmação Seadesk só é permitida na etapa de Digitalização',
            code: 'ETAPA_INVALIDA',
          });
        }

        const result = await server.database.query(
          `UPDATE repositorios
           SET seadesk_confirmado_em = CURRENT_TIMESTAMP,
               seadesk_confirmado_por = $2
           WHERE id_repositorio_recorda = $1
           RETURNING id_repositorio_recorda, seadesk_confirmado_em, seadesk_confirmado_por`,
          [id, user.id]
        );

        return reply.send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao confirmar envio Seadesk';
        return reply.status(400).send({ error: message });
      }
    });

  };
}



