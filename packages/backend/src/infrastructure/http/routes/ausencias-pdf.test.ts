import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import { PDFDocument } from 'pdf-lib';
import type { DatabaseConnection } from '../../database/connection.js';
import { createServer } from '../server.js';

const { PNG_1X1 } = vi.hoisted(() => ({
  PNG_1X1: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+8WQAAAAASUVORK5CYII=',
    'base64'
  ),
}));

vi.mock('../../services/file-storage.js', () => ({
  serveAusenciaAnexo: vi.fn().mockResolvedValue({
    buffer: PNG_1X1,
    mimeType: 'image/png',
    filename: 'anexo.png',
  }),
}));

function makeResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

function createMockDatabase(): DatabaseConnection {
  const ausenciaRow = {
    id: '11111111-1111-4111-8111-000000000001',
    usuario_id: '22222222-2222-4222-8222-000000000001',
    colaborador_nome: 'Ana Teste',
    tipo_ausencia_id: '33333333-3333-4333-8333-000000000001',
    tipo_ausencia_nome: 'Atestado',
    tipo_ausencia_cor: '#3B82F6',
    data_inicio: '2026-06-01',
    data_fim: '2026-06-02',
    periodo: 'dia_completo',
    horas_ausencia: null,
    status: 'aprovado',
    justificativa: 'Consulta médica',
    observacoes: 'Anexo presente',
    documento_anexo: 'uploads/ausencias/anexo.png',
    aprovado_em: '2026-06-02T10:00:00.000Z',
    motivo_rejeicao: null,
    criado_em: '2026-06-01T09:00:00.000Z',
    dias_ausencia: 2,
  };

  return {
    pool: {} as never,
    async query<T extends QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> {
      const sql = text.trim();

      if (sql.includes('set_config') || /^SET\s+LOCAL/i.test(sql)) {
        return makeResult([{ set_config: '' } as never]) as unknown as QueryResult<T>;
      }

      if (sql.includes('FROM ausencias a')) {
        const hasPeriodoFiltro =
          Array.isArray(params) &&
          params.length >= 2 &&
          params[0] === '2026-06-02' &&
          params[1] === '2026-06-02';

        if (hasPeriodoFiltro) {
          const usaSobreposicao =
            sql.includes('a.data_fim >= $1::date') &&
            sql.includes('a.data_inicio <= $2::date');
          return makeResult(usaSobreposicao ? [ausenciaRow as never] : []) as unknown as QueryResult<T>;
        }

        return makeResult([ausenciaRow as never]) as unknown as QueryResult<T>;
      }

      if (sql.includes('SELECT DISTINCT u.id, u.nome')) {
        return makeResult([{ id: ausenciaRow.usuario_id, nome: ausenciaRow.colaborador_nome } as never]) as unknown as QueryResult<T>;
      }

      if (sql.includes('SELECT id, nome, cor FROM tipos_ausencia')) {
        return makeResult([
          {
            id: ausenciaRow.tipo_ausencia_id,
            nome: ausenciaRow.tipo_ausencia_nome,
            cor: ausenciaRow.tipo_ausencia_cor,
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

describe('PDF — /relatorios/ausencias/exportar/pdf', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildServer();
    token = adminToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('retorna PDF com anexos do período', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/relatorios/ausencias/exportar/pdf',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');

    const payload = Buffer.isBuffer(res.rawPayload)
      ? res.rawPayload
      : Buffer.from(res.rawPayload ?? []);
    const pdf = await PDFDocument.load(payload);

    expect(pdf.getPageCount()).toBe(1);

    const rawText = payload.toString('latin1');
    expect(rawText).not.toContain('RESUMO GERAL');
    expect(rawText).not.toContain('TOTAL POR TIPO');
    expect(rawText).not.toContain('FILTROS APLICADOS');
    expect(rawText).not.toContain('Precisa Sistematização & Tecnologia');
    expect(rawText).not.toContain('Página 1 de 4');
  });
  it('inclui anexos de ausencias que cruzam o periodo filtrado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/relatorios/ausencias/exportar/pdf?dataInicio=2026-06-02&dataFim=2026-06-02',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);

    const payload = Buffer.isBuffer(res.rawPayload)
      ? res.rawPayload
      : Buffer.from(res.rawPayload ?? []);
    const pdf = await PDFDocument.load(payload);

    expect(pdf.getPageCount()).toBe(1);
  });
});
