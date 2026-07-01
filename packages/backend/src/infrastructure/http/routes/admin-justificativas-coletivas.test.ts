import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import type { DatabaseConnection } from '../../database/connection.js';
import { createServer } from '../server.js';

function makeResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

function createMockDatabase(): DatabaseConnection {
  return {
    pool: {
      async connect() {
        return {
          async query(text: string) {
            const sql = text.trim();

            if (sql.includes('set_config') || /^SET\s+LOCAL/i.test(sql)) {
              return makeResult([{ set_config: '' } as never]) as never;
            }

            if (sql.includes('FROM justificativas_coletivas')) {
              return makeResult([
                {
                  id: '11111111-1111-4111-8111-000000000001',
                  data_inicio: '2026-06-30',
                  data_fim: '2026-06-30',
                  descricao: 'Liberação da equipe por manutenção elétrica.',
                  criado_por: 'test-admin-id',
                  criado_por_nome: 'Admin Teste',
                  criado_em: '2026-06-30T12:00:00.000Z',
                  atualizado_em: '2026-06-30T12:00:00.000Z',
                } as never,
              ]) as never;
            }

            return makeResult([]) as never;
          },
          release() {},
        };
      },
    } as never,
    async query<T extends QueryResultRow>(text: string): Promise<QueryResult<T>> {
      const sql = text.trim();

      if (sql.includes('set_config') || /^SET\s+LOCAL/i.test(sql)) {
        return makeResult([{ set_config: '' } as never]) as unknown as QueryResult<T>;
      }

      if (sql.includes('FROM justificativas_coletivas')) {
        return makeResult([
          {
            id: '11111111-1111-4111-8111-000000000001',
            data_inicio: '2026-06-30',
            data_fim: '2026-06-30',
            descricao: 'Liberação da equipe por manutenção elétrica.',
            criado_por: 'test-admin-id',
            criado_por_nome: 'Admin Teste',
            criado_em: '2026-06-30T12:00:00.000Z',
            atualizado_em: '2026-06-30T12:00:00.000Z',
          } as never,
        ]) as unknown as QueryResult<T>;
      }

      return makeResult([]) as unknown as QueryResult<T>;
    },
    async healthCheck() {
      return true;
    },
    async close() {},
  };
}

async function buildServer(): Promise<FastifyInstance> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-unit-tests-32chars!!';
  return createServer({ database: createMockDatabase(), config: { host: '127.0.0.1', port: 0 } });
}

function adminToken(app: FastifyInstance): string {
  return (app as { jwt: { sign: (payload: unknown) => string } }).jwt.sign({
    id: 'test-admin-id',
    email: 'admin@test.com',
    nome: 'Admin Teste',
    perfil: 'administrador',
    coordenadoriaId: null,
  });
}

describe('GET /admin/justificativas-coletivas', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildServer();
    token = adminToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('permite listagem para administrador autenticado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/justificativas-coletivas',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      itens: [
        {
          id: '11111111-1111-4111-8111-000000000001',
          descricao: 'Liberação da equipe por manutenção elétrica.',
          criadoPorNome: 'Admin Teste',
        },
      ],
    });
  });
});
