import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';

interface CriarEtapaBody {
  nome: string;
  descricao?: string;
  unidade: string;
  ordem: number;
}

export function createEtapasRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    // GET /etapas - Listar etapas com paginação
    server.get('/etapas', {
      schema: {
        tags: ['etapas'],
        summary: 'Listar etapas com paginação',
        security: [{ bearerAuth: [] }],
        querystring: { type: 'object', properties: { ativa: { type: 'string', enum: ['true', 'false'] }, limite: { type: 'number', default: 50 }, pagina: { type: 'number', default: 1 } } },
        response: { 500: { type: 'object', properties: { error: { type: 'string' } } } },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { ativa, limite = 50, pagina = 1 } = request.query as { 
          ativa?: string;
          limite?: number;
          pagina?: number;
        };

        const offset = (Number(pagina) - 1) * Number(limite);

        let baseQuery = `FROM etapas WHERE 1=1`;
        const params: (boolean | number)[] = [];
        let paramIndex = 1;

        if (ativa !== undefined) {
          baseQuery += ` AND ativa = $${paramIndex}`;
          params.push(ativa === 'true');
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
          SELECT id, nome, descricao, unidade, ordem, ativa, criado_em
          ${baseQuery}
          ORDER BY ordem, nome
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(Number(limite), offset);

        const result = await server.database.query(dataQuery, params);

        return reply.send({ 
          etapas: result.rows,
          total,
          pagina: Number(pagina),
          totalPaginas: Math.ceil(total / Number(limite))
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao buscar etapas';
        return reply.status(500).send({ error: message });
      }
    });

    // POST /etapas - Criar etapa (apenas admin)
    server.post<{ Body: CriarEtapaBody }>('/etapas', {
      schema: {
        tags: ['etapas'],
        summary: 'Criar nova etapa',
        security: [{ bearerAuth: [] }],
        body: { type: 'object', required: ['nome'], properties: { nome: { type: 'string' }, descricao: { type: 'string' }, unidade: { type: 'string' }, ordem: { type: 'number' } } },
        response: { 400: { type: 'object', properties: { error: { type: 'string' } } }, 409: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } },
      },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { nome, descricao, unidade, ordem } = request.body;

        if (!nome) {
          return reply.status(400).send({ error: 'Nome é obrigatório' });
        }

        // Verificar se nome já existe
        const existsResult = await server.database.query(
          `SELECT id FROM etapas WHERE LOWER(nome) = LOWER($1)`,
          [nome]
        );

        if (existsResult.rows.length > 0) {
          return reply.status(409).send({ error: 'Já existe uma etapa com este nome' });
        }

        const insertResult = await server.database.query(
          `INSERT INTO etapas (nome, descricao, unidade, ordem, ativa)
           VALUES ($1, $2, $3, $4, true) RETURNING *`,
          [nome, descricao || null, unidade || 'PROCESSO', ordem || 1]
        );

        return reply.status(201).send(insertResult.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao criar etapa';
        return reply.status(500).send({ error: message });
      }
    });

    // PUT /etapas/:id - Atualizar etapa (apenas admin)
    server.put<{ Params: { id: string }; Body: CriarEtapaBody }>('/etapas/:id', {
      schema: {
        tags: ['etapas'],
        summary: 'Atualizar etapa existente',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        body: { type: 'object', required: ['nome'], properties: { nome: { type: 'string' }, descricao: { type: 'string' }, unidade: { type: 'string' }, ordem: { type: 'number' } } },
        response: { 400: { type: 'object', properties: { error: { type: 'string' } } }, 404: { type: 'object', properties: { error: { type: 'string' } } }, 409: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } },
      },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params;
        const { nome, descricao, unidade, ordem } = request.body;

        if (!nome) {
          return reply.status(400).send({ error: 'Nome é obrigatório' });
        }

        // Verificar se etapa existe
        const existsResult = await server.database.query<{ id: string; ordem: number }>(
          `SELECT id, ordem FROM etapas WHERE id = $1`,
          [id]
        );

        if (existsResult.rows.length === 0) {
          return reply.status(404).send({ error: 'Etapa não encontrada' });
        }

        // Verificar se nome já existe em outra etapa
        const nomeResult = await server.database.query(
          `SELECT id FROM etapas WHERE LOWER(nome) = LOWER($1) AND id != $2`,
          [nome, id]
        );

        if (nomeResult.rows.length > 0) {
          return reply.status(409).send({ error: 'Já existe outra etapa com este nome' });
        }

        const novaOrdem = ordem || existsResult.rows[0]?.ordem || 1;
        const ordemAtual = existsResult.rows[0]?.ordem ?? 0;

        // Se a ordem mudou, fazer swap atômico para evitar violação de unique
        if (novaOrdem !== ordemAtual) {
          await server.database.query('BEGIN');
          try {
            const conflito = await server.database.query<{ id: string }>(
              `SELECT id FROM etapas WHERE ordem = $1 AND id != $2 AND ativa = TRUE`,
              [novaOrdem, id]
            );
            if (conflito.rows.length > 0) {
              await server.database.query(`UPDATE etapas SET ordem = -1 WHERE id = $1`, [id]);
              await server.database.query(`UPDATE etapas SET ordem = $1 WHERE id = $2`, [ordemAtual, conflito.rows[0]?.id]);
              await server.database.query(`UPDATE etapas SET nome = $1, descricao = $2, unidade = $3, ordem = $4 WHERE id = $5`, [nome, descricao || null, unidade || 'PROCESSO', novaOrdem, id]);
            } else {
              await server.database.query(`UPDATE etapas SET nome = $1, descricao = $2, unidade = $3, ordem = $4 WHERE id = $5`, [nome, descricao || null, unidade || 'PROCESSO', novaOrdem, id]);
            }
            await server.database.query('COMMIT');
          } catch (innerError) {
            await server.database.query('ROLLBACK');
            throw innerError;
          }
        } else {
          await server.database.query(
            `UPDATE etapas SET nome = $1, descricao = $2, unidade = $3 WHERE id = $4`,
            [nome, descricao || null, unidade || 'PROCESSO', id]
          );
        }

        const updateResult = await server.database.query(`SELECT * FROM etapas WHERE id = $1`, [id]);
        return reply.send(updateResult.rows[0]);
      } catch (error) {
        server.log.error(error, 'Erro ao atualizar etapa');
        const message = error instanceof Error ? error.message : 'Erro ao atualizar etapa';
        if (message.includes('idx_etapas_ordem')) {
          return reply.status(409).send({ error: 'Já existe outra etapa ativa com esta ordem' });
        }
        if (message.includes('invalid input value for enum')) {
          return reply.status(400).send({ error: 'Unidade de medida inválida. Use: PROCESSO, VOLUME, PAGINA ou DOCUMENTO' });
        }
        return reply.status(500).send({ error: message });
      }
    });

    // PATCH /etapas/:id/toggle-ativa - Ativar/desativar etapa (apenas admin)
    server.patch<{ Params: { id: string } }>('/etapas/:id/toggle-ativa', {
      schema: {
        tags: ['etapas'],
        summary: 'Ativar/desativar etapa',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: { 404: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } },
      },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params;

        const result = await server.database.query(
          `UPDATE etapas SET ativa = NOT ativa WHERE id = $1 RETURNING *`,
          [id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Etapa não encontrada' });
        }

        return reply.send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao alterar status';
        return reply.status(500).send({ error: message });
      }
    });

    // PATCH /etapas/:id/reordenar - Reordenar etapa (swap com vizinha)
    server.patch<{ Params: { id: string }; Body: { direcao: 'up' | 'down' } }>('/etapas/:id/reordenar', {
      schema: {
        tags: ['etapas'],
        summary: 'Reordenar etapa (swap com vizinha)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        body: { type: 'object', required: ['direcao'], properties: { direcao: { type: 'string', enum: ['up', 'down'] } } },
        response: { 400: { type: 'object', properties: { error: { type: 'string' } } }, 404: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } },
      },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params;
        const { direcao } = request.body;

        if (!direcao || (direcao !== 'up' && direcao !== 'down')) {
          return reply.status(400).send({ error: 'Direção deve ser "up" ou "down"' });
        }

        const etapaResult = await server.database.query(
          `SELECT id, ordem FROM etapas WHERE id = $1`,
          [id]
        );
        if (etapaResult.rows.length === 0) {
          return reply.status(404).send({ error: 'Etapa não encontrada' });
        }

        const etapa = etapaResult.rows[0] as { id: string; ordem: number };

        // Encontrar a etapa vizinha na direção desejada
        const vizinhaResult = await server.database.query(
          direcao === 'up'
            ? `SELECT id, ordem FROM etapas WHERE ordem < $1 ORDER BY ordem DESC LIMIT 1`
            : `SELECT id, ordem FROM etapas WHERE ordem > $1 ORDER BY ordem ASC LIMIT 1`,
          [etapa.ordem]
        );

        if (vizinhaResult.rows.length === 0) {
          return reply.status(400).send({ error: 'Não é possível mover nesta direção' });
        }

        const vizinha = vizinhaResult.rows[0] as { id: string; ordem: number };

        // Swap atômico usando valor temporário para evitar violação de unique
        await server.database.query('BEGIN');
        try {
          await server.database.query(`UPDATE etapas SET ordem = -1 WHERE id = $1`, [etapa.id]);
          await server.database.query(`UPDATE etapas SET ordem = $1 WHERE id = $2`, [etapa.ordem, vizinha.id]);
          await server.database.query(`UPDATE etapas SET ordem = $1 WHERE id = $2`, [vizinha.ordem, etapa.id]);
          await server.database.query('COMMIT');
        } catch (innerError) {
          await server.database.query('ROLLBACK');
          throw innerError;
        }

        return reply.send({ message: 'Ordem atualizada com sucesso' });
      } catch (error) {
        server.log.error(error, 'Erro ao reordenar etapa');
        const message = error instanceof Error ? error.message : 'Erro ao reordenar etapa';
        return reply.status(500).send({ error: message });
      }
    });

    // GET /etapas/:id - Buscar etapa por ID
    server.get<{ Params: { id: string } }>('/etapas/:id', {
      schema: {
        tags: ['etapas'],
        summary: 'Buscar etapa por ID',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        response: { 404: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } },
      },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params;

        const result = await server.database.query(
          `SELECT * FROM etapas WHERE id = $1`,
          [id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Etapa não encontrada' });
        }

        return reply.send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao buscar etapa';
        return reply.status(500).send({ error: message });
      }
    });
  };
}


