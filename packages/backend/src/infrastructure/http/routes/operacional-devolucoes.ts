import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { sendDatabaseError } from '../middleware/error-handler.js';
import { OperacionalPDFService } from '../../services/operacional-pdf-service.js';
import { getCurrentUser } from './operacional-helpers.js';

interface CriarDevolucaoBody {
  dataDevolucao: string;
  coordenadoriaDestinoId: string;
  responsavelRetirada: string;
  observacoes?: string;
  itens: Array<{
    repositorio?: string;
    orgao?: string;
    protocolo?: string;
    interessado?: string;
    volume?: string;
    obs?: string;
    recebimentoProcessoId?: string;
  }>;
}

/**
 * Rotas de Devolução Operacional.
 * POST  /operacional/devolucoes          — cria devolução com itens
 * GET   /operacional/devolucoes          — lista/busca devoluções (paginado)
 * GET   /operacional/devolucoes/:id      — detalhes de uma devolução + itens
 * GET   /operacional/devolucoes/:id/pdf  — gera PDF do termo
 */
export function createOperacionalDevolucoesRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    const pdfService = new OperacionalPDFService();

    // ============================================================
    // POST /operacional/devolucoes
    // ============================================================
    server.post(
      '/operacional/devolucoes',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Registrar devolução operacional de processos',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            required: ['dataDevolucao', 'coordenadoriaDestinoId', 'responsavelRetirada', 'itens'],
            properties: {
              dataDevolucao: { type: 'string' },
              coordenadoriaDestinoId: { type: 'string' },
              responsavelRetirada: { type: 'string' },
              observacoes: { type: 'string' },
              itens: { type: 'array', items: { type: 'object' }, minItems: 1 },
            },
          },
          response: {
            201: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } } },
          },
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const body = request.body as CriarDevolucaoBody;

        const { dataDevolucao, coordenadoriaDestinoId, responsavelRetirada, observacoes, itens } =
          body;

        if (!responsavelRetirada?.trim()) {
          return reply.status(400).send({ error: 'Responsável pela retirada é obrigatório' });
        }
        if (!itens || itens.length === 0) {
          return reply.status(400).send({ error: 'É necessário ao menos um item na devolução' });
        }

        try {
          await server.database.query('BEGIN');

          // Criar cabeçalho
          const devolucaoRes = await server.database.query(
            `INSERT INTO devolucoes_operacionais
               (data_devolucao, coordenadoria_destino_id, responsavel_retirada, observacoes, criado_por)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, data_devolucao, coordenadoria_destino_id, responsavel_retirada,
                       observacoes, criado_em`,
            [
              dataDevolucao,
              coordenadoriaDestinoId,
              responsavelRetirada.trim(),
              observacoes?.trim() || null,
              user.id,
            ]
          );

          const devolucao = devolucaoRes.rows[0] as { id: string };

          // Inserir itens
          for (const item of itens) {
            await server.database.query(
              `INSERT INTO devolucao_operacional_itens
                 (devolucao_id, repositorio, orgao, protocolo, interessado, volume, obs, recebimento_processo_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                devolucao.id,
                item.repositorio?.trim() || null,
                item.orgao?.trim() || null,
                item.protocolo?.trim() || null,
                item.interessado?.trim() || null,
                item.volume?.trim() || null,
                item.obs?.trim() || null,
                item.recebimentoProcessoId || null,
              ]
            );
          }

          await server.database.query('COMMIT');
          return reply.status(201).send(devolucaoRes.rows[0]);
        } catch (error) {
          await server.database.query('ROLLBACK');
          const message = error instanceof Error ? error.message : 'Erro ao registrar devolução';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // ============================================================
    // GET /operacional/devolucoes
    // ============================================================
    server.get(
      '/operacional/devolucoes',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Listar devoluções operacionais',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              q: { type: 'string' },
              coordenadoriaId: { type: 'string' },
              dataInicio: { type: 'string' },
              dataFim: { type: 'string' },
              pagina: { type: 'number', default: 1 },
              limite: { type: 'number', default: 20 },
            },
          },
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        const {
          q,
          coordenadoriaId,
          dataInicio,
          dataFim,
          pagina = 1,
          limite = 20,
        } = request.query as {
          q?: string;
          coordenadoriaId?: string;
          dataInicio?: string;
          dataFim?: string;
          pagina?: number;
          limite?: number;
        };

        const offset = (Number(pagina) - 1) * Number(limite);
        const params: (string | number)[] = [];
        let paramIdx = 1;

        let whereClauses = '';

        if (coordenadoriaId) {
          whereClauses += ` AND d.coordenadoria_destino_id = $${paramIdx}`;
          params.push(coordenadoriaId);
          paramIdx++;
        }
        if (dataInicio) {
          whereClauses += ` AND d.data_devolucao >= $${paramIdx}`;
          params.push(dataInicio);
          paramIdx++;
        }
        if (dataFim) {
          whereClauses += ` AND d.data_devolucao <= $${paramIdx}`;
          params.push(dataFim);
          paramIdx++;
        }
        if (q) {
          // Busca em protocolo, repositório, interessado, orgao dos itens
          whereClauses += ` AND EXISTS (
            SELECT 1 FROM devolucao_operacional_itens di
            WHERE di.devolucao_id = d.id
              AND (
                di.protocolo ILIKE $${paramIdx}
                OR di.repositorio ILIKE $${paramIdx}
                OR di.interessado ILIKE $${paramIdx}
                OR di.orgao ILIKE $${paramIdx}
              )
          )`;
          params.push(`%${q}%`);
          paramIdx++;
        }

        try {
          const countResult = await server.database.query(
            `SELECT COUNT(*) AS total
             FROM devolucoes_operacionais d
             WHERE 1=1${whereClauses}`,
            params
          );
          const total = parseInt((countResult.rows[0] as { total: string }).total ?? '0', 10);

          const dataParams = [...params, Number(limite), offset];
          const dataResult = await server.database.query(
            `SELECT d.id, d.data_devolucao, d.responsavel_retirada, d.observacoes, d.criado_em,
                    c.id AS coordenadoria_id, c.nome AS coordenadoria_nome, c.sigla AS coordenadoria_sigla,
                    (SELECT COUNT(*) FROM devolucao_operacional_itens di WHERE di.devolucao_id = d.id) AS total_itens
             FROM devolucoes_operacionais d
             JOIN coordenadorias c ON c.id = d.coordenadoria_destino_id
             WHERE 1=1${whereClauses}
             ORDER BY d.data_devolucao DESC, d.criado_em DESC
             LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
            dataParams
          );

          return reply.send({
            devolucoes: dataResult.rows,
            total,
            pagina: Number(pagina),
            totalPaginas: Math.ceil(total / Number(limite)),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao listar devoluções';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // ============================================================
    // GET /operacional/devolucoes/:id
    // ============================================================
    server.get(
      '/operacional/devolucoes/:id',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Detalhes de uma devolução operacional',
          security: [{ bearerAuth: [] }],
          params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
          const devolucaoRes = await server.database.query(
            `SELECT d.id, d.data_devolucao, d.responsavel_retirada, d.observacoes, d.criado_em,
                    c.id AS coordenadoria_id, c.nome AS coordenadoria_nome, c.sigla AS coordenadoria_sigla
             FROM devolucoes_operacionais d
             JOIN coordenadorias c ON c.id = d.coordenadoria_destino_id
             WHERE d.id = $1`,
            [id]
          );
          if (devolucaoRes.rows.length === 0) {
            return reply.status(404).send({ error: 'Devolução não encontrada' });
          }
          const itensRes = await server.database.query(
            `SELECT id, repositorio, orgao, protocolo, interessado, volume, obs, recebimento_processo_id
             FROM devolucao_operacional_itens
             WHERE devolucao_id = $1
             ORDER BY criado_em ASC`,
            [id]
          );
          return reply.send({ devolucao: devolucaoRes.rows[0], itens: itensRes.rows });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar devolução';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // ============================================================
    // GET /operacional/devolucoes/:id/pdf
    // ============================================================
    server.get(
      '/operacional/devolucoes/:id/pdf',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Gerar PDF do termo de devolução operacional',
          security: [{ bearerAuth: [] }],
          params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
          const devolucaoRes = await server.database.query(
            `SELECT d.id, d.data_devolucao, d.responsavel_retirada, d.observacoes, d.criado_em,
                    c.nome AS coordenadoria_nome, c.sigla AS coordenadoria_sigla
             FROM devolucoes_operacionais d
             JOIN coordenadorias c ON c.id = d.coordenadoria_destino_id
             WHERE d.id = $1`,
            [id]
          );
          if (devolucaoRes.rows.length === 0) {
            return reply.status(404).send({ error: 'Devolução não encontrada' });
          }
          const devolucao = devolucaoRes.rows[0] as {
            id: string;
            data_devolucao: string;
            responsavel_retirada: string;
            observacoes: string | null;
            criado_em: string;
            coordenadoria_nome: string;
            coordenadoria_sigla: string;
          };

          const itensRes = await server.database.query(
            `SELECT repositorio, orgao, protocolo, interessado, volume, obs
             FROM devolucao_operacional_itens
             WHERE devolucao_id = $1
             ORDER BY criado_em ASC`,
            [id]
          );

          // Buscar configuração de empresa para logo
          let empresa = null;
          try {
            const empRes = await server.database.query(
              `SELECT nome, logo_url, logo_data, exibir_logo_relatorio,
                      logo_largura_relatorio, logo_alinhamento_relatorio, logo_deslocamento_y_relatorio
               FROM configuracao_empresa LIMIT 1`
            );
            if (empRes.rows.length > 0) {
              const r = empRes.rows[0] as Record<string, unknown>;
              empresa = {
                nome: r.nome as string,
                logoUrl: r.logo_url as string,
                logoData: r.logo_data as Buffer | null,
                exibirLogoRelatorio: r.exibir_logo_relatorio as boolean,
                logoLarguraRelatorio: r.logo_largura_relatorio as number,
                logoAlinhamentoRelatorio: r.logo_alinhamento_relatorio as string,
                logoDeslocamentoYRelatorio: r.logo_deslocamento_y_relatorio as number,
              };
            }
          } catch {
            // empresa config opcional
          }

          const coordenadoriaDestino =
            `${devolucao.coordenadoria_nome} (${devolucao.coordenadoria_sigla})`.trim();

          const pdfBuffer = await pdfService.gerarTermoDevolucaoOperacional(
            {
              coordenadoriaDestino,
              responsavelRetirada: devolucao.responsavel_retirada,
              dataDevolucao: String(devolucao.data_devolucao),
              observacoes: devolucao.observacoes,
              processos: (itensRes.rows as Record<string, string>[]).map((item) => ({
                repositorio: item.repositorio ?? '',
                orgao: item.orgao ?? '',
                protocolo: item.protocolo ?? '',
                interessado: item.interessado ?? '',
                volume: item.volume ?? '',
                obs: item.obs ?? '',
              })),
              geradoEm: new Date().toISOString(),
            },
            empresa
          );

          const dataFormatada = new Date(devolucao.data_devolucao + 'T12:00:00')
            .toLocaleDateString('pt-BR')
            .replace(/\//g, '-');
          const sigla = devolucao.coordenadoria_sigla.replace(/[^a-zA-Z0-9]/g, '_');
          const filename = `termo_devolucao_${sigla}_${dataFormatada}.pdf`;

          return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(pdfBuffer);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao gerar PDF de devolução';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // ============================================================
    // GET /operacional/recebimento-processos/busca
    // (busca processos de recebimento para vincular na devolução)
    // ============================================================
    server.get(
      '/operacional/recebimento-processos/busca',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Buscar processos de recebimento para vincular em devolução',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              q: { type: 'string' },
              limite: { type: 'number', default: 20 },
            },
          },
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        const { q, limite = 20 } = request.query as { q?: string; limite?: number };

        if (!q || q.trim().length < 2) {
          return reply.send({ itens: [] });
        }

        try {
          const result = await server.database.query(
            `SELECT rp.id, rp.protocolo, rp.interessado,
                    rp.volume_atual, rp.volume_total,
                    COALESCE(r.id_repositorio_ged, '') AS repositorio,
                    COALESCE(r.orgao, '') AS orgao
             FROM recebimento_processos rp
             LEFT JOIN repositorios r ON r.id_repositorio_recorda = rp.repositorio_id
             WHERE rp.protocolo ILIKE $1
                OR rp.interessado ILIKE $1
                OR r.id_repositorio_ged ILIKE $1
                OR r.orgao ILIKE $1
             ORDER BY rp.criado_em DESC
             LIMIT $2`,
            [`%${q.trim()}%`, Number(limite)]
          );

          return reply.send({
            itens: (result.rows as Record<string, unknown>[]).map((row) => ({
              id: row.id,
              protocolo: row.protocolo,
              interessado: row.interessado,
              volume: row.volume_total
                ? `${row.volume_atual} de ${row.volume_total}`
                : String(row.volume_atual),
              repositorio: row.repositorio,
              orgao: row.orgao,
            })),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao buscar processos de recebimento';
          return sendDatabaseError(reply, error, message);
        }
      }
    );
  };
}
