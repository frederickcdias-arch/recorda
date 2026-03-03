import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';

export function createMetasRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    // GET /producao/metas - Listar metas
    server.get('/producao/metas', {
      schema: { tags: ['metas'], summary: 'Listar metas de produção por etapa', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (_request, reply) => {
      try {
        const result = await server.database.query(`
          SELECT m.*, e.nome as etapa_nome
          FROM metas_producao m
          JOIN etapas e ON e.id = m.etapa_id
          ORDER BY e.ordem
        `);
        return reply.send({ metas: result.rows });
      } catch (error) {
        // Tabela pode não existir ainda
        return reply.send({ metas: [] });
      }
    });

    // POST /producao/metas - Criar meta
    server.post('/producao/metas', {
      schema: {
        tags: ['metas'], summary: 'Criar meta de produção', security: [{ bearerAuth: [] }],
        body: { type: 'object', required: ['etapaId', 'metaDiaria', 'metaMensal'], properties: { etapaId: { type: 'string' }, metaDiaria: { type: 'number' }, metaMensal: { type: 'number' } } },
        response: { 201: { type: 'object', additionalProperties: true }, 500: { type: 'object', properties: { error: { type: 'string' } } } },
      },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { etapaId, metaDiaria, metaMensal } = request.body as {
          etapaId: string;
          metaDiaria: number;
          metaMensal: number;
        };

        const result = await server.database.query(
          `INSERT INTO metas_producao (etapa_id, meta_diaria, meta_mensal, ativa)
           VALUES ($1, $2, $3, true) RETURNING *`,
          [etapaId, metaDiaria, metaMensal]
        );

        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao criar meta';
        return reply.status(500).send({ error: message });
      }
    });

    // GET /producao/desempenho - Indicadores de desempenho
    server.get('/producao/desempenho', {
      schema: {
        tags: ['metas'], summary: 'Indicadores de desempenho por colaborador', security: [{ bearerAuth: [] }],
        querystring: { type: 'object', properties: { periodo: { type: 'string', enum: ['dia', 'semana', 'mes'], default: 'mes' } } },
        response: { 500: { type: 'object', properties: { error: { type: 'string' } } } },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { periodo = 'mes' } = request.query as { periodo?: string };

        let dateFilter = '';
        if (periodo === 'dia') {
          dateFilter = `AND rp.data_producao = CURRENT_DATE`;
        } else if (periodo === 'semana') {
          dateFilter = `AND rp.data_producao >= CURRENT_DATE - INTERVAL '7 days'`;
        } else {
          dateFilter = `AND rp.data_producao >= DATE_TRUNC('month', CURRENT_DATE)`;
        }

        // Buscar meta configurada (soma de todas as metas por etapa) ou fallback para 1000
        let metaTotal = 1000;
        try {
          const metaResult = await server.database.query<{ total: string }>(
            `SELECT COALESCE(SUM(meta_mensal), 0)::text AS total FROM metas_producao`
          );
          const metaFromDb = parseInt(metaResult.rows[0]?.total ?? '0', 10);
          if (metaFromDb > 0) {
            metaTotal = metaFromDb;
          }
        } catch {
          // Tabela pode não existir ainda — usar fallback
        }

        const result = await server.database.query(`
          SELECT 
            u.nome as colaborador_nome,
            COALESCE(SUM(rp.quantidade), 0) as total_producao,
            $1::integer as meta,
            ROUND(COALESCE(SUM(rp.quantidade), 0) * 100.0 / NULLIF($1::integer, 0)) as percentual
          FROM usuarios u
          LEFT JOIN producao_repositorio rp ON rp.usuario_id = u.id ${dateFilter}
          WHERE u.ativo = true
          GROUP BY u.id, u.nome
          ORDER BY total_producao DESC
        `, [metaTotal]);

        return reply.send({ desempenho: result.rows });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao buscar desempenho';
        return reply.status(500).send({ error: message });
      }
    });

    // GET /producao/mapeamentos - Listar templates de mapeamento
    server.get('/producao/mapeamentos', {
      schema: { tags: ['metas'], summary: 'Listar templates de mapeamento de importação', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (_request, reply) => {
      try {
        const result = await server.database.query(`
          SELECT * FROM mapeamentos_importacao ORDER BY criado_em DESC
        `);
        return reply.send({ mapeamentos: result.rows });
      } catch (error) {
        return reply.send({ mapeamentos: [] });
      }
    });

    // POST /producao/mapeamentos - Criar template de mapeamento
    server.post('/producao/mapeamentos', {
      schema: {
        tags: ['metas'], summary: 'Criar template de mapeamento', security: [{ bearerAuth: [] }],
        body: { type: 'object', required: ['nome', 'mapeamento'], properties: { nome: { type: 'string' }, mapeamento: { type: 'object', additionalProperties: { type: 'string' } } } },
        response: { 201: { type: 'object', additionalProperties: true }, 500: { type: 'object', properties: { error: { type: 'string' } } } },
      },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { nome, mapeamento } = request.body as {
          nome: string;
          mapeamento: Record<string, string>;
        };

        const result = await server.database.query(
          `INSERT INTO mapeamentos_importacao (nome, mapeamento, criado_em)
           VALUES ($1, $2, NOW()) RETURNING *`,
          [nome, JSON.stringify(mapeamento)]
        );

        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao criar mapeamento';
        return reply.status(500).send({ error: message });
      }
    });

  };
}

