/**
 * Testes para a feature de busca contextual por processo dentro do repositório.
 * Verifica que processMatches e processMatchesCount são retornados corretamente
 * no endpoint GET /operacional/repositorios?busca=<termo>.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import { createServer } from '../../../infrastructure/http/server.js';
import type { DatabaseConnection } from '../../../infrastructure/database/connection.js';
import { getTestToken } from '../../../test/helpers.js';

// ── Tipos internos do mock ────────────────────────────────────────────────────

interface RepoRow {
  id_repositorio_recorda: string;
  id_repositorio_ged: string;
  orgao: string;
  projeto: string;
  status_atual: string;
  etapa_atual: string;
  data_criacao: string;
  seadesk_confirmado_em: string | null;
  seadesk_confirmado_por: string | null;
  classificacao_padrao_id: string | null;
}

interface ProcessoRow {
  id: string;
  repositorio_id: string;
  protocolo: string;
  interessado: string | null;
}

// ── Helper do mock ────────────────────────────────────────────────────────────

function makeResult<T extends QueryResultRow>(rows: T[], command = 'SELECT'): QueryResult<T> {
  return { command, rowCount: rows.length, oid: 0, fields: [], rows };
}

function ilike(value: string | null | undefined, pattern: string): boolean {
  if (!value) return false;
  const term = pattern.replace(/%/g, '').toLowerCase();
  return value.toLowerCase().includes(term);
}

interface ProcessMatch {
  nome: string | null;
  numeroProcesso: string;
  campoEncontrado: 'nome' | 'numeroProcesso';
}

function buildProcessMatches(
  repo: RepoRow,
  processos: ProcessoRow[],
  buscaPattern: string
): { matches: ProcessMatch[]; count: number } {
  const matching = processos.filter(
    (p) =>
      p.repositorio_id === repo.id_repositorio_recorda &&
      (ilike(p.protocolo, buscaPattern) || ilike(p.interessado, buscaPattern))
  );

  // Protocol matches first (priority = 0), then nome
  const sorted = [...matching].sort((a, b) => {
    const aP = ilike(a.protocolo, buscaPattern) ? 0 : 1;
    const bP = ilike(b.protocolo, buscaPattern) ? 0 : 1;
    return aP - bP || a.protocolo.localeCompare(b.protocolo);
  });

  const count = sorted.length;
  const limited = sorted.slice(0, 3);

  const matches: ProcessMatch[] = limited.map((p) => ({
    nome: p.interessado,
    numeroProcesso: p.protocolo,
    campoEncontrado: ilike(p.protocolo, buscaPattern) ? 'numeroProcesso' : 'nome',
  }));

  return { matches, count };
}

function createSearchMockDatabase(repos: RepoRow[], processos: ProcessoRow[]): DatabaseConnection {
  return {
    pool: {} as never,
    async query<T extends QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> {
      const t = text.trim();
      const mk = (rows: unknown[], cmd = 'SELECT') =>
        makeResult(rows as T[], cmd) as unknown as QueryResult<T>;

      // Auth middleware
      if (t.includes('set_config') || /^SET\s+LOCAL/i.test(t)) return mk([{ set_config: '' }]);

      // Contadores query
      if (
        t.includes('SELECT r.status_atual, COUNT(*)::text AS qtd') &&
        t.includes('GROUP BY r.status_atual')
      ) {
        return mk([]);
      }

      // COUNT query for total
      if (t.includes('COUNT(*)::text as total') && t.includes('FROM repositorios r')) {
        const buscaPattern = (params ?? []).find(
          (p) => typeof p === 'string' && p.startsWith('%') && p.endsWith('%')
        ) as string | undefined;

        let count = repos.length;
        if (buscaPattern) {
          count = repos.filter((r) => {
            const gedMatch = ilike(r.id_repositorio_ged, buscaPattern);
            const orgaoMatch = ilike(r.orgao, buscaPattern);
            const projMatch = ilike(r.projeto, buscaPattern);
            const procMatch = processos.some(
              (p) =>
                p.repositorio_id === r.id_repositorio_recorda &&
                (ilike(p.protocolo, buscaPattern) || ilike(p.interessado, buscaPattern))
            );
            return gedMatch || orgaoMatch || projMatch || procMatch;
          }).length;
        }

        return mk([{ total: String(count) }]);
      }

      // Main data query (WITH ids AS (...))
      if (t.includes('WITH ids AS (') && t.includes('proc_count AS (')) {
        const buscaPattern = (params ?? []).find(
          (p) => typeof p === 'string' && p.startsWith('%') && p.endsWith('%')
        ) as string | undefined;

        const hasProcMatchesCte = t.includes('proc_matches AS (');

        // Paginate via last two numeric params
        const numParams = (params ?? []).filter((p) => typeof p === 'number');
        const limit =
          typeof numParams[numParams.length - 2] === 'number'
            ? (numParams[numParams.length - 2] as number)
            : 20;
        const offset =
          typeof numParams[numParams.length - 1] === 'number'
            ? (numParams[numParams.length - 1] as number)
            : 0;

        let filteredRepos = repos;
        if (buscaPattern) {
          filteredRepos = repos.filter((r) => {
            const gedMatch = ilike(r.id_repositorio_ged, buscaPattern);
            const orgaoMatch = ilike(r.orgao, buscaPattern);
            const projMatch = ilike(r.projeto, buscaPattern);
            const procMatch = processos.some(
              (p) =>
                p.repositorio_id === r.id_repositorio_recorda &&
                (ilike(p.protocolo, buscaPattern) || ilike(p.interessado, buscaPattern))
            );
            return gedMatch || orgaoMatch || projMatch || procMatch;
          });
        }

        const page = filteredRepos.slice(offset, offset + limit);

        const rows = page.map((r) => {
          const base: Record<string, unknown> = {
            ...r,
            total_processos: processos.filter((p) => p.repositorio_id === r.id_repositorio_recorda)
              .length,
            checklist_concluido: false,
            checklist_aberto: false,
            producao_registrada: false,
            total_relatorios: 0,
            segundos_na_etapa: 0,
          };

          if (hasProcMatchesCte && buscaPattern) {
            const { matches, count } = buildProcessMatches(r, processos, buscaPattern);
            base.process_matches = matches.length > 0 ? matches : null;
            base.process_matches_count = count;
          }

          return base;
        });

        return mk(rows);
      }

      // Default
      const cmd = t.split(/\s+/)[0]?.toUpperCase() ?? 'SELECT';
      return mk([], cmd);
    },
    async healthCheck() {
      return true;
    },
    async close() {},
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REPO_64: RepoRow = {
  id_repositorio_recorda: 'repo-uuid-64',
  id_repositorio_ged: '000064/2026',
  orgao: 'SGPA',
  projeto: 'SEMA',
  status_atual: 'RECEBIDO',
  etapa_atual: 'RECEBIMENTO',
  data_criacao: '2026-01-01T00:00:00Z',
  seadesk_confirmado_em: null,
  seadesk_confirmado_por: null,
  classificacao_padrao_id: null,
};

const REPO_10: RepoRow = {
  id_repositorio_recorda: 'repo-uuid-10',
  id_repositorio_ged: '000010/2026',
  orgao: 'SEFAZ',
  projeto: 'FINANCAS',
  status_atual: 'RECEBIDO',
  etapa_atual: 'RECEBIMENTO',
  data_criacao: '2026-01-02T00:00:00Z',
  seadesk_confirmado_em: null,
  seadesk_confirmado_por: null,
  classificacao_padrao_id: null,
};

const PROCESSO_MARIA: ProcessoRow = {
  id: 'proc-1',
  repositorio_id: 'repo-uuid-64',
  protocolo: '167867/2018',
  interessado: 'Maria da Silva Ferreira',
};

const PROCESSO_JOAO: ProcessoRow = {
  id: 'proc-2',
  repositorio_id: 'repo-uuid-64',
  protocolo: '999001/2020',
  interessado: 'João da Silva',
};

const PROCESSO_CARLOS: ProcessoRow = {
  id: 'proc-3',
  repositorio_id: 'repo-uuid-64',
  protocolo: '999002/2020',
  interessado: 'Carlos da Silva',
};

const PROCESSO_PEDRO: ProcessoRow = {
  id: 'proc-4',
  repositorio_id: 'repo-uuid-64',
  protocolo: '999003/2020',
  interessado: 'Pedro da Silva',
};

const PROCESSO_OUTRO_REPO: ProcessoRow = {
  id: 'proc-5',
  repositorio_id: 'repo-uuid-10',
  protocolo: '200001/2022',
  interessado: 'Fernanda Lima',
};

// ── Suíte de testes ───────────────────────────────────────────────────────────

describe('GET /operacional/repositorios — processMatches', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-unit-tests-32chars!!';
    const database = createSearchMockDatabase(
      [REPO_64, REPO_10],
      [PROCESSO_MARIA, PROCESSO_JOAO, PROCESSO_CARLOS, PROCESSO_PEDRO, PROCESSO_OUTRO_REPO]
    );
    app = await createServer({ database, config: { host: '127.0.0.1', port: 0 } });
    token = await getTestToken(app, 'operador');
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. Busca por nome ─────────────────────────────────────────────────────

  it('1. busca por nome retorna processMatches com nome e numeroProcesso', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/operacional/repositorios?busca=maria',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ itens: Record<string, unknown>[] }>();
    expect(body.itens).toHaveLength(1);

    const item = body.itens[0]!;
    expect(item.id_repositorio_ged).toBe('000064/2026');

    const matches = item.process_matches as ProcessMatch[];
    expect(matches).toBeDefined();
    expect(matches.length).toBeGreaterThan(0);
    const first = matches[0]!;
    expect(first.nome).toBe('Maria da Silva Ferreira');
    expect(first.numeroProcesso).toBe('167867/2018');
    expect(first.campoEncontrado).toBe('nome');
  });

  // ── 2. Busca por número de processo ──────────────────────────────────────

  it('2. busca por número de processo retorna processMatches com campo correto', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/operacional/repositorios?busca=167867',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ itens: Record<string, unknown>[] }>();
    expect(body.itens).toHaveLength(1);

    const matches = body.itens[0]!.process_matches as ProcessMatch[];
    expect(matches).toBeDefined();
    const first = matches[0]!;
    expect(first.numeroProcesso).toBe('167867/2018');
    expect(first.campoEncontrado).toBe('numeroProcesso');
  });

  // ── 3. Busca por termo parcial ────────────────────────────────────────────

  it('3. busca por termo parcial (silva) retorna processo correto', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/operacional/repositorios?busca=silva',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ itens: Record<string, unknown>[] }>();
    // Repositório 64 tem vários processos com "silva"
    expect(body.itens.some((i) => i.id_repositorio_ged === '000064/2026')).toBe(true);
  });

  // ── 4. Múltiplos processos retornam contador ──────────────────────────────

  it('4. múltiplos processos encontrados retornam processMatchesCount correto', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/operacional/repositorios?busca=silva',
      headers: { authorization: `Bearer ${token}` },
    });

    const body = res.json<{ itens: Record<string, unknown>[] }>();
    const item64 = body.itens.find((i) => i.id_repositorio_ged === '000064/2026');
    expect(item64).toBeDefined();

    // MARIA + JOAO + CARLOS + PEDRO têm "silva" (exceto MARIA - "Ferreira" não tem)
    // JOAO, CARLOS, PEDRO têm "da Silva"
    // MARIA tem "Silva" em "da Silva Ferreira" — deve bater
    const count = item64?.process_matches_count as number;
    expect(count).toBeGreaterThanOrEqual(3); // pelo menos JOAO, CARLOS, PEDRO
  });

  // ── 5. processMatches limitado a 3 ───────────────────────────────────────

  it('5. processMatches retorna no máximo 3 itens por repositório', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/operacional/repositorios?busca=silva',
      headers: { authorization: `Bearer ${token}` },
    });

    const body = res.json<{ itens: Record<string, unknown>[] }>();
    const item64 = body.itens.find((i) => i.id_repositorio_ged === '000064/2026');
    const matches = item64?.process_matches as ProcessMatch[] | null;
    expect(matches).toBeDefined();
    expect((matches ?? []).length).toBeLessThanOrEqual(3);
  });

  // ── 6. Sem busca — sem processMatches ────────────────────────────────────

  it('6. sem busca, processMatches não é retornado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/operacional/repositorios',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ itens: Record<string, unknown>[] }>();
    expect(body.itens.length).toBeGreaterThan(0);
    // process_matches não deve existir nas rows quando não há busca
    for (const item of body.itens) {
      expect(item.process_matches).toBeUndefined();
      expect(item.process_matches_count).toBeUndefined();
    }
  });

  // ── 7. Sem busca — contrato não é quebrado ────────────────────────────────

  it('7. sem busca, resposta tem shape correto sem processMatches', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/operacional/repositorios',
      headers: { authorization: `Bearer ${token}` },
    });

    const body = res.json<{
      itens: unknown[];
      total: number;
      pagina: number;
      totalPaginas: number;
    }>();
    expect(body).toHaveProperty('itens');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('pagina');
    expect(body).toHaveProperty('totalPaginas');
    expect(Array.isArray(body.itens)).toBe(true);
  });

  // ── 8. meta.total correto ─────────────────────────────────────────────────

  it('8. meta.total reflete número de repositórios que batem com a busca', async () => {
    const resAll = await app.inject({
      method: 'GET',
      url: '/operacional/repositorios',
      headers: { authorization: `Bearer ${token}` },
    });
    const bodyAll = resAll.json<{ total: number }>();
    expect(bodyAll.total).toBe(2);

    const resBusca = await app.inject({
      method: 'GET',
      url: '/operacional/repositorios?busca=maria',
      headers: { authorization: `Bearer ${token}` },
    });
    const bodyBusca = resBusca.json<{ total: number }>();
    expect(bodyBusca.total).toBe(1);
  });

  // ── 9. Busca por ID GED continua funcionando ──────────────────────────────

  it('9. busca por ID GED retorna o repositório correto', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/operacional/repositorios?busca=000010',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ itens: Record<string, unknown>[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.itens[0]!.id_repositorio_ged).toBe('000010/2026');
  });

  // ── 10. Busca não duplica repositório ────────────────────────────────────

  it('10. busca por processo não duplica o repositório na lista', async () => {
    // JOAO, CARLOS, PEDRO têm "silva" — todos no mesmo repositório 64
    const res = await app.inject({
      method: 'GET',
      url: '/operacional/repositorios?busca=silva',
      headers: { authorization: `Bearer ${token}` },
    });

    const body = res.json<{ itens: Record<string, unknown>[] }>();
    const repo64Items = body.itens.filter((i) => i.id_repositorio_ged === '000064/2026');
    expect(repo64Items).toHaveLength(1); // exatamente 1 entrada
  });
});

// ── Teste de processMatches por servidor dedicado c/ muitos processos ─────────

describe('GET /operacional/repositorios — processMatches limitação a 3', () => {
  let app: FastifyInstance;
  let token: string;

  const manyProcessos: ProcessoRow[] = Array.from({ length: 6 }, (_, i) => ({
    id: `proc-x-${i}`,
    repositorio_id: 'repo-many',
    protocolo: `99900${i}/2020`,
    interessado: `Pessoa Silva ${i}`,
  }));

  const repoMany: RepoRow = {
    id_repositorio_recorda: 'repo-many',
    id_repositorio_ged: '000099/2026',
    orgao: 'SGPA',
    projeto: 'TESTE',
    status_atual: 'RECEBIDO',
    etapa_atual: 'RECEBIMENTO',
    data_criacao: '2026-01-01T00:00:00Z',
    seadesk_confirmado_em: null,
    seadesk_confirmado_por: null,
    classificacao_padrao_id: null,
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-unit-tests-32chars!!';
    const database = createSearchMockDatabase([repoMany], manyProcessos);
    app = await createServer({ database, config: { host: '127.0.0.1', port: 0 } });
    token = await getTestToken(app, 'operador');
  });

  afterAll(async () => {
    await app.close();
  });

  it('8b. processMatches retorna exatamente 3 quando há 6 processos correspondentes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/operacional/repositorios?busca=silva',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ itens: Record<string, unknown>[] }>();
    const item = body.itens[0]!;
    const matches = item.process_matches as ProcessMatch[];
    expect(matches).toBeDefined();
    expect(matches.length).toBe(3);
    expect(item.process_matches_count).toBe(6);
  });
});
