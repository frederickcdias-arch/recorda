import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

export function createAuditoriaRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    // GET /auditoria - Listar logs de auditoria
    server.get(
      '/auditoria',
      {
        schema: {
          tags: ['auditoria'],
          summary: 'Listar logs de auditoria com filtros e paginação',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              tabela: { type: 'string', description: 'Filtrar por tabela (aceita CSV)' },
              operacao: { type: 'string', enum: ['INSERT', 'UPDATE', 'DELETE'] },
              dataInicio: { type: 'string', format: 'date' },
              dataFim: { type: 'string', format: 'date' },
              pagina: { type: 'number', default: 1 },
              limite: { type: 'number', default: 50 },
            },
          },
          response: { 500: { type: 'object', properties: { error: { type: 'string' } } } },
        },
        preHandler: [server.authenticate],
      },
      async (request, reply) => {
        try {
          const {
            tabela,
            operacao,
            dataInicio,
            dataFim,
            pagina = 1,
            limite = 50,
          } = request.query as {
            tabela?: string;
            operacao?: string;
            dataInicio?: string;
            dataFim?: string;
            pagina?: number;
            limite?: number;
          };

          const offset = (Number(pagina) - 1) * Number(limite);
          let query = `
          SELECT
            a.id,
            a.tabela,
            a.registro_id,
            a.operacao,
            a.dados_anteriores,
            a.dados_novos,
            a.usuario_id,
            u.nome AS usuario_nome,
            a.ip_origem,
            a.user_agent,
            a.data_operacao AS criado_em
          FROM auditoria a
          LEFT JOIN usuarios u ON u.id = a.usuario_id
          WHERE 1=1
        `;
          const params: (string | number)[] = [];
          let paramIndex = 1;

          if (tabela) {
            const tabelas = tabela
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
            if (tabelas.length === 1) {
              query += ` AND a.tabela = $${paramIndex}`;
              params.push(tabelas[0]!);
            } else {
              query += ` AND a.tabela = ANY($${paramIndex}::text[])`;
              params.push(tabelas as unknown as string);
            }
            paramIndex++;
          }

          if (operacao) {
            query += ` AND a.operacao = $${paramIndex}`;
            params.push(operacao);
            paramIndex++;
          }

          if (dataInicio) {
            query += ` AND a.data_operacao >= $${paramIndex}`;
            params.push(dataInicio);
            paramIndex++;
          }

          if (dataFim) {
            query += ` AND a.data_operacao <= $${paramIndex}::date + interval '1 day'`;
            params.push(dataFim);
            paramIndex++;
          }

          query += ` ORDER BY a.data_operacao DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
          params.push(Number(limite), offset);

          const result = await server.database.query(query, params);

          // Count
          let countQuery = `SELECT COUNT(*) as total FROM auditoria WHERE 1=1`;
          const countParams: string[] = [];
          let countParamIndex = 1;

          if (tabela) {
            const tabelas = tabela
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
            if (tabelas.length === 1) {
              countQuery += ` AND tabela = $${countParamIndex}`;
              countParams.push(tabelas[0]!);
            } else {
              countQuery += ` AND tabela = ANY($${countParamIndex}::text[])`;
              countParams.push(tabelas as unknown as string);
            }
            countParamIndex++;
          }
          if (operacao) {
            countQuery += ` AND operacao = $${countParamIndex}`;
            countParams.push(operacao);
            countParamIndex++;
          }
          if (dataInicio) {
            countQuery += ` AND data_operacao >= $${countParamIndex}`;
            countParams.push(dataInicio);
            countParamIndex++;
          }
          if (dataFim) {
            countQuery += ` AND data_operacao <= $${countParamIndex}::date + interval '1 day'`;
            countParams.push(dataFim);
          }

          const countResult = await server.database.query(countQuery, countParams);
          const total = parseInt((countResult.rows[0] as { total: string })?.total ?? '0', 10);

          return reply.send({
            logs: result.rows,
            total,
            pagina: Number(pagina),
            totalPaginas: Math.ceil(total / Number(limite)),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao buscar logs de auditoria';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /auditoria/estatisticas - Estatísticas de auditoria
    server.get(
      '/auditoria/estatisticas',
      {
        schema: {
          tags: ['auditoria'],
          summary: 'Estatísticas de auditoria agrupadas por operação, tabela e dia',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              dataInicio: { type: 'string', format: 'date' },
              dataFim: { type: 'string', format: 'date' },
            },
          },
          response: { 500: { type: 'object', properties: { error: { type: 'string' } } } },
        },
        preHandler: [server.authenticate],
      },
      async (request, reply) => {
        try {
          const { dataInicio, dataFim } = request.query as {
            dataInicio?: string;
            dataFim?: string;
          };

          let whereClause = '';
          const params: string[] = [];

          if (dataInicio && dataFim) {
            whereClause = `WHERE data_operacao BETWEEN $1 AND $2::date + interval '1 day'`;
            params.push(dataInicio, dataFim);
          }

          // Por operação
          const porOperacaoResult = await server.database.query(
            `SELECT operacao, COUNT(*) as total FROM auditoria ${whereClause} GROUP BY operacao`,
            params
          );

          // Por tabela
          const porTabelaResult = await server.database.query(
            `SELECT tabela, COUNT(*) as total FROM auditoria ${whereClause} GROUP BY tabela ORDER BY total DESC LIMIT 10`,
            params
          );

          // Por dia
          const porDiaResult = await server.database.query(
            `SELECT DATE(data_operacao) as data, COUNT(*) as total FROM auditoria ${whereClause} GROUP BY DATE(data_operacao) ORDER BY data DESC LIMIT 30`,
            params
          );

          return reply.send({
            porOperacao: porOperacaoResult.rows,
            porTabela: porTabelaResult.rows,
            porDia: porDiaResult.rows,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar estatísticas';
          return reply.status(500).send({ error: message });
        }
      }
    );
  };
}
