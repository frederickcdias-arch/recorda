import type { FastifyInstance } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import { createServer } from '../infrastructure/http/server.js';
import type { DatabaseConnection } from '../infrastructure/database/connection.js';

function makeResult<T extends QueryResultRow>(rows: T[], command = 'SELECT'): QueryResult<T> {
  return { command, rowCount: rows.length, oid: 0, fields: [], rows };
}

interface MockState {
  repositorios: Map<string, Record<string, unknown>>;
  checklists: Map<string, Record<string, unknown>>;
  producoes: Map<string, Record<string, unknown>>;
  counters: { repo: number; checklist: number; producao: number };
}

let mockState: MockState | null = null;
let cachedTestServer: FastifyInstance | null = null;

function createHelperMockDatabase(): DatabaseConnection {
  mockState = {
    repositorios: new Map(),
    checklists: new Map(),
    producoes: new Map(),
    counters: { repo: 0, checklist: 0, producao: 0 },
  };

  const state = mockState;

  return {
    pool: {} as never,
    async query<T extends QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> {
      const t = text.trim();
      const mk = (rows: unknown[], command = 'SELECT') =>
        makeResult(rows as QueryResultRow[], command) as unknown as QueryResult<T>;

      // Auth middleware: SET LOCAL / set_config
      if (t.includes('set_config') || /^SET\s+LOCAL/i.test(t)) {
        return mk([{ set_config: '' }]);
      }

      // ── REPOSITORIOS ──────────────────────────────────────────────
      if (
        t.includes('FROM repositorios') &&
        t.includes('WHERE id_repositorio_ged = $1') &&
        t.includes('AND orgao = $2')
      ) {
        const ged = String(params?.[0] ?? '');
        const orgao = String(params?.[1] ?? '');
        const projeto = String(params?.[2] ?? '');
        const found = [...state.repositorios.values()].find(
          (r) => r.id_repositorio_ged === ged && r.orgao === orgao && r.projeto === projeto
        );
        return mk(found ? [found] : []);
      }

      // Verification: SELECT from repositorios by GED id (no parameterized orgao)
      if (
        t.includes('FROM repositorios') &&
        t.includes('id_repositorio_ged = $1') &&
        !t.includes('AND orgao = $2')
      ) {
        const ged = String(params?.[0] ?? '');
        const orgaoMatch = t.match(/AND\s+orgao\s*=\s*'([^']+)'/);
        const orgaoFilter = orgaoMatch ? orgaoMatch[1] : null;
        let results = [...state.repositorios.values()].filter((r) => r.id_repositorio_ged === ged);
        if (orgaoFilter) results = results.filter((r) => r.orgao === orgaoFilter);
        return mk(results);
      }

      // Verification: JOIN queries against repositorios by GED id
      if (t.includes('r.id_repositorio_ged = $1')) {
        const ged = String(params?.[0] ?? '');
        const repo = [...state.repositorios.values()].find((r) => r.id_repositorio_ged === ged);
        if (!repo) {
          if (t.includes('COUNT(*)')) return mk([{ total: '0', count: '0' }]);
          return mk([]);
        }
        const repoInternalId = String(repo.id_repositorio_recorda);

        // COUNT producao
        if (t.includes('COUNT(*)') && t.includes('producao_repositorio')) {
          const count = [...state.producoes.values()].filter(
            (p) => p.repositorio_id === repoInternalId
          ).length;
          return mk([{ total: String(count), count: String(count) }]);
        }

        // Checklists join
        if (t.includes('checklists')) {
          const rows = [...state.checklists.values()]
            .filter((c) => c.repositorio_id === repoInternalId)
            .map((c) => ({ ...c, ativo: false, data_conclusao: new Date().toISOString() }));
          return mk(rows);
        }

        // Producao join (with or without usuarios)
        if (t.includes('producao_repositorio')) {
          const rows = [...state.producoes.values()]
            .filter((p) => p.repositorio_id === repoInternalId)
            .map((p) => {
              const marcadores =
                typeof p.marcadores === 'string'
                  ? (JSON.parse(p.marcadores as string) as Record<string, unknown>)
                  : ((p.marcadores ?? {}) as Record<string, unknown>);
              return { ...p, marcadores, email: 'colaborador@test.com' };
            });
          return mk(rows);
        }
      }

      // information_schema: table existence check
      if (t.includes('information_schema.tables')) {
        return mk([{ table_name: 'repositorios' }]);
      }

      if (t.startsWith('INSERT INTO repositorios')) {
        const id = `repo-${++state.counters.repo}`;
        const r: Record<string, unknown> = {
          id_repositorio_recorda: id,
          id_repositorio_ged: String(params?.[0]),
          orgao: String(params?.[1]),
          projeto: String(params?.[2]),
          status_atual: String(params?.[3]),
          etapa_atual: String(params?.[4]),
        };
        state.repositorios.set(id, r);
        return mk([r], 'INSERT');
      }

      // ── CHECKLISTS ────────────────────────────────────────────────
      if (t.includes('FROM checklists') && t.includes("status = 'CONCLUIDO'")) {
        const repoId = String(params?.[0] ?? '');
        const etapa = String(params?.[1] ?? '');
        const found = [...state.checklists.values()].find(
          (c) => c.repositorio_id === repoId && c.etapa === etapa && c.status === 'CONCLUIDO'
        );
        return mk(found ? [found] : []);
      }

      if (t.startsWith('INSERT INTO checklists')) {
        const id = `checklist-${++state.counters.checklist}`;
        const c: Record<string, unknown> = {
          id,
          repositorio_id: String(params?.[0]),
          etapa: String(params?.[1]),
          status: 'CONCLUIDO',
          usuario_id: String(params?.[2]),
        };
        state.checklists.set(id, c);
        return mk([c], 'INSERT');
      }

      // ── PRODUCAO ──────────────────────────────────────────────────
      // Legado conflict check
      if (t.includes("COALESCE(marcadores->>'origem', '') = 'LEGADO'")) {
        return mk([]);
      }

      // Duplicate check (same user+repo+date+etapa+marcadores = 'SISTEMA')
      if (
        t.includes('FROM producao_repositorio') &&
        t.includes('usuario_id = $1') &&
        t.includes('repositorio_id = $2') &&
        t.includes("= 'SISTEMA'")
      ) {
        const userId = String(params?.[0] ?? '');
        const repoId = String(params?.[1] ?? '');
        const etapa = String(params?.[3] ?? '');
        const tipo = String(params?.[4] ?? '');
        const funcao = String(params?.[5] ?? '');
        const coordenadoria = String(params?.[6] ?? '');
        const found = [...state.producoes.values()].find((p) => {
          const m =
            typeof p.marcadores === 'string'
              ? (JSON.parse(p.marcadores as string) as Record<string, unknown>)
              : ((p.marcadores ?? {}) as Record<string, unknown>);
          return (
            p.usuario_id === userId &&
            p.repositorio_id === repoId &&
            p.etapa === etapa &&
            (m.origem ?? '') === 'SISTEMA' &&
            (m.tipo ?? '') === tipo &&
            (m.funcao ?? '') === funcao &&
            (m.coordenadoria ?? '') === coordenadoria
          );
        });
        return mk(found ? [{ id: found.id, quantidade: found.quantidade }] : []);
      }

      // Sequence check (etapa anterior)
      if (
        t.includes('FROM producao_repositorio') &&
        t.includes('repositorio_id = $1') &&
        t.includes('etapa = $2')
      ) {
        const repoId = String(params?.[0] ?? '');
        const etapa = String(params?.[1] ?? '');
        const coordenadoria = String(params?.[2] ?? '');
        const found = [...state.producoes.values()].find((p) => {
          const m =
            typeof p.marcadores === 'string'
              ? (JSON.parse(p.marcadores as string) as Record<string, unknown>)
              : ((p.marcadores ?? {}) as Record<string, unknown>);
          return (
            p.repositorio_id === repoId &&
            p.etapa === etapa &&
            (m.coordenadoria ?? '') === coordenadoria
          );
        });
        return mk(found ? [{ id: found.id }] : []);
      }

      // Insert producao
      if (t.startsWith('INSERT INTO producao_repositorio')) {
        const id = `producao-${++state.counters.producao}`;
        const p: Record<string, unknown> = {
          id,
          repositorio_id: String(params?.[0]),
          etapa: String(params?.[1]),
          checklist_id: params?.[2],
          usuario_id: String(params?.[3]),
          quantidade: Number(params?.[4]),
          marcadores: params?.[5],
          data_producao: params?.[6],
        };
        state.producoes.set(id, p);
        return mk([p], 'INSERT');
      }

      // Default: empty result
      const command = t.split(/\s+/)[0]?.toUpperCase() ?? 'SELECT';
      return mk([], command);
    },
    async healthCheck() {
      return true;
    },
    async close() {},
  };
}

export async function buildTestServer(): Promise<FastifyInstance> {
  if (cachedTestServer) return cachedTestServer;

  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-unit-tests-32chars!!';

  const database = createHelperMockDatabase();

  cachedTestServer = await createServer({
    database,
    config: { host: '127.0.0.1', port: 0 },
  });

  return cachedTestServer;
}

export async function getTestToken(
  app: FastifyInstance,
  perfil: 'colaborador' | 'operador' | 'administrador' = 'colaborador'
): Promise<string> {
  const payload = {
    id: `test-${perfil}-id`,
    email: `${perfil}@test.com`,
    nome: `Usuário ${perfil}`,
    perfil,
    coordenadoriaId: null as string | null,
  };
  return (app as unknown as { jwt: { sign: (p: unknown) => string } }).jwt.sign(payload);
}

export async function cleanupTestData(
  _app: FastifyInstance,
  _patterns: string[] = ['TEST_%', 'E2E_%']
): Promise<void> {
  if (mockState) {
    mockState.repositorios.clear();
    mockState.checklists.clear();
    mockState.producoes.clear();
    mockState.counters = { repo: 0, checklist: 0, producao: 0 };
  }
}

export function generateTestRepoId(): string {
  return `TEST_${Date.now()}/2026`;
}

export async function createTestProducao(
  app: FastifyInstance,
  token: string,
  payload: {
    repositorio?: string;
    etapa?: string;
    coordenadoria?: string;
    quantidade?: number;
    tipo?: string;
    data?: string;
  } = {}
): Promise<{ statusCode: number; body: unknown; payload: Record<string, unknown> }> {
  const defaultPayload = {
    repositorio: generateTestRepoId(),
    etapa: 'RECEBIMENTO',
    coordenadoria: 'CINF',
    quantidade: 1,
    data: new Date().toISOString().split('T')[0],
    ...payload,
  };

  const response = await app.inject({
    method: 'POST',
    url: '/producao/lancar-direto',
    headers: { authorization: `Bearer ${token}` },
    payload: defaultPayload,
  });

  return {
    statusCode: response.statusCode,
    body: response.json(),
    payload: defaultPayload,
  };
}

export async function closeTestDatabase(): Promise<void> {
  if (cachedTestServer) {
    await cachedTestServer.close();
    cachedTestServer = null;
  }
  mockState = null;
}

export async function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
