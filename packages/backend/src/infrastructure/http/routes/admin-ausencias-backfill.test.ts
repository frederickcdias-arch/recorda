import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import type { DatabaseConnection } from '../../database/connection.js';
import { createServer } from '../server.js';

vi.mock('../../services/file-storage.js', async (importActual) => {
  const actual = await importActual<typeof import('../../services/file-storage.js')>();
  return {
    ...actual,
    serveAusenciaAnexo: vi.fn().mockResolvedValue({
      buffer: Buffer.from('pdf-bytes'),
      mimeType: 'application/pdf',
      filename: 'anexo-legacy.pdf',
    }),
  };
});

function makeResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

function createMockDatabase(): DatabaseConnection {
  const state = {
    documentoAnexo: 'uploads/ausencias/anexo-legacy.pdf',
    updatedValue: null as string | null,
  };

  return {
    pool: {
      async connect() {
        return {
          async query(text: string, params?: unknown[]) {
            const sql = text.trim();

            if (sql.includes('set_config') || /^SET\s+LOCAL/i.test(sql)) {
              return makeResult([{ set_config: '' } as never]) as never;
            }

            if (sql.includes('FROM ausencias') && sql.includes('documento_anexo')) {
              return makeResult([
                { id: '11111111-1111-4111-8111-000000000001', documento_anexo: state.documentoAnexo } as never,
              ]) as never;
            }

            if (sql.includes('UPDATE ausencias SET documento_anexo = $1')) {
              state.updatedValue = String(params?.[0] ?? null);
              return makeResult([]) as never;
            }

            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
              return makeResult([]) as never;
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

describe('POST /admin/ausencias/backfill-anexos', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildServer();
    token = adminToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('converte anexos legados para data URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/ausencias/backfill-anexos',
      headers: { authorization: `Bearer ${token}` },
      payload: { confirmar: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      total: number;
      atualizados: number;
      ignorados: number;
      erros: Array<{ id: string; motivo: string }>;
    };
    expect(body.total).toBe(1);
    expect(body.atualizados).toBe(1);
    expect(body.ignorados).toBe(0);
    expect(body.erros).toHaveLength(0);
  });
});
