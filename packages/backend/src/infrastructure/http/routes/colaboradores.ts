import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';

interface CriarColaboradorBody {
  nome: string;
  matricula: string;
  email?: string;
  coordenadoriaId: string;
}

export function createColaboradoresRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    // GET /colaboradores - Listar colaboradores com paginação
    // GET /coordenadorias - Listar coordenadorias ativas
    server.get(
      '/coordenadorias',
      {
        schema: {
          tags: ['colaboradores'],
          summary: 'Listar coordenadorias ativas',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  nome: { type: 'string' },
                  sigla: { type: 'string' },
                },
              },
            },
            500: { type: 'object', properties: { error: { type: 'string' } } },
          },
        },
        preHandler: [server.authenticate],
      },
      async (_request, reply) => {
        try {
          const result = await server.database.query(
            `SELECT id, nome, sigla
           FROM coordenadorias
           WHERE ativa = true
           ORDER BY sigla, nome`
          );
          return reply.send(result.rows);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar coordenadorias';
          return reply.status(500).send({ error: message });
        }
      }
    );

    server.get(
      '/colaboradores',
      {
        schema: {
          tags: ['colaboradores'],
          summary: 'Listar colaboradores com paginação e filtros',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              nome: { type: 'string' },
              coordenadoriaId: { type: 'string' },
              ativo: { type: 'string', enum: ['true', 'false'] },
              limite: { type: 'number', default: 50 },
              pagina: { type: 'number', default: 1 },
            },
          },
        },
        preHandler: [server.authenticate],
      },
      async (request, reply) => {
        try {
          const {
            nome,
            coordenadoriaId,
            ativo,
            limite = 50,
            pagina = 1,
          } = request.query as {
            nome?: string;
            coordenadoriaId?: string;
            ativo?: string;
            limite?: number;
            pagina?: number;
          };

          const offset = (Number(pagina) - 1) * Number(limite);

          let baseQuery = `
          FROM colaboradores c
          LEFT JOIN coordenadorias co ON co.id = c.coordenadoria_id
          WHERE 1=1
        `;
          const params: (string | boolean | number)[] = [];
          let paramIndex = 1;

          if (nome) {
            baseQuery += ` AND c.nome ILIKE $${paramIndex}`;
            params.push(`%${nome}%`);
            paramIndex++;
          }

          if (coordenadoriaId) {
            baseQuery += ` AND c.coordenadoria_id = $${paramIndex}`;
            params.push(coordenadoriaId);
            paramIndex++;
          }

          if (ativo !== undefined) {
            baseQuery += ` AND c.ativo = $${paramIndex}`;
            params.push(ativo === 'true');
            paramIndex++;
          }

          // Query de contagem
          const countResult = await server.database.query(
            `SELECT COUNT(*) as total ${baseQuery}`,
            params
          );
          const total = parseInt((countResult.rows[0] as { total: string }).total, 10);

          // Query de dados com paginação
          const dataQuery = `
          SELECT c.id, c.nome, c.matricula, c.email, c.ativo, c.coordenadoria_id, c.criado_em,
                 co.nome as coordenadoria_nome, co.sigla as coordenadoria_sigla
          ${baseQuery}
          ORDER BY c.nome
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
          params.push(Number(limite), offset);

          const result = await server.database.query(dataQuery, params);

          return reply.send({
            colaboradores: result.rows,
            total,
            pagina: Number(pagina),
            totalPaginas: Math.ceil(total / Number(limite)),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar colaboradores';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // POST /colaboradores - Criar colaborador (apenas admin)
    server.post<{ Body: CriarColaboradorBody }>(
      '/colaboradores',
      {
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { nome, matricula, email, coordenadoriaId } = request.body;

          if (!nome || !matricula || !coordenadoriaId) {
            return reply
              .status(400)
              .send({ error: 'Nome, matrícula e coordenadoria são obrigatórios' });
          }

          // Verificar se matrícula já existe
          const existsResult = await server.database.query(
            `SELECT id FROM colaboradores WHERE matricula = $1`,
            [matricula]
          );

          if (existsResult.rows.length > 0) {
            return reply.status(409).send({ error: 'Matrícula já cadastrada' });
          }

          // Verificar coordenadoria
          const coordResult = await server.database.query(
            `SELECT id FROM coordenadorias WHERE id = $1 AND ativa = true`,
            [coordenadoriaId]
          );

          if (coordResult.rows.length === 0) {
            return reply.status(400).send({ error: 'Coordenadoria não encontrada ou inativa' });
          }

          const insertResult = await server.database.query(
            `INSERT INTO colaboradores (nome, matricula, email, coordenadoria_id, ativo)
           VALUES ($1, $2, $3, $4, true) RETURNING *`,
            [nome, matricula, email || null, coordenadoriaId]
          );

          return reply.status(201).send(insertResult.rows[0]);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao criar colaborador';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // PUT /colaboradores/:id - Atualizar colaborador (apenas admin)
    server.put<{ Params: { id: string }; Body: CriarColaboradorBody }>(
      '/colaboradores/:id',
      {
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { id } = request.params;
          const { nome, matricula, email, coordenadoriaId } = request.body;

          if (!nome || !matricula || !coordenadoriaId) {
            return reply
              .status(400)
              .send({ error: 'Nome, matrícula e coordenadoria são obrigatórios' });
          }

          // Verificar se colaborador existe
          const existsResult = await server.database.query(
            `SELECT id FROM colaboradores WHERE id = $1`,
            [id]
          );

          if (existsResult.rows.length === 0) {
            return reply.status(404).send({ error: 'Colaborador não encontrado' });
          }

          // Verificar se matrícula já existe em outro colaborador
          const matriculaResult = await server.database.query(
            `SELECT id FROM colaboradores WHERE matricula = $1 AND id != $2`,
            [matricula, id]
          );

          if (matriculaResult.rows.length > 0) {
            return reply
              .status(409)
              .send({ error: 'Matrícula já cadastrada para outro colaborador' });
          }

          const updateResult = await server.database.query(
            `UPDATE colaboradores SET nome = $1, matricula = $2, email = $3, coordenadoria_id = $4
           WHERE id = $5 RETURNING *`,
            [nome, matricula, email || null, coordenadoriaId, id]
          );

          return reply.send(updateResult.rows[0]);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao atualizar colaborador';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // PATCH /colaboradores/:id/toggle-ativo - Ativar/desativar colaborador (apenas admin)
    server.patch<{ Params: { id: string } }>(
      '/colaboradores/:id/toggle-ativo',
      {
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { id } = request.params;

          const result = await server.database.query(
            `UPDATE colaboradores SET ativo = NOT ativo WHERE id = $1 RETURNING *`,
            [id]
          );

          if (result.rows.length === 0) {
            return reply.status(404).send({ error: 'Colaborador não encontrado' });
          }

          return reply.send(result.rows[0]);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao alterar status';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /colaboradores/:id - Buscar colaborador por ID
    server.get<{ Params: { id: string } }>(
      '/colaboradores/:id',
      {
        preHandler: [server.authenticate],
      },
      async (request, reply) => {
        try {
          const { id } = request.params;

          const result = await server.database.query(
            `SELECT c.*, co.nome as coordenadoria_nome, co.sigla as coordenadoria_sigla
           FROM colaboradores c
           JOIN coordenadorias co ON co.id = c.coordenadoria_id
           WHERE c.id = $1`,
            [id]
          );

          if (result.rows.length === 0) {
            return reply.status(404).send({ error: 'Colaborador não encontrado' });
          }

          return reply.send(result.rows[0]);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar colaborador';
          return reply.status(500).send({ error: message });
        }
      }
    );
  };
}
