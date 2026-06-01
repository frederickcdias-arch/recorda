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
  recebimentoProcessos: Map<string, number>;
  cqStats: Map<string, { total: number; pendentes: number; reprovados: number }>;
  historicoEtapas: Array<Record<string, unknown>>;
  /** Repositório IDs currently in an ABERTO (active) CQ batch */
  lotesCQAtivos: Set<string>;
  counters: { repo: number; checklist: number; producao: number };
}

let mockState: MockState | null = null;
let cachedTestServer: FastifyInstance | null = null;

function createHelperMockDatabase(): DatabaseConnection {
  mockState = {
    repositorios: new Map(),
    checklists: new Map(),
    producoes: new Map(),
    recebimentoProcessos: new Map(),
    cqStats: new Map(),
    historicoEtapas: [],
    lotesCQAtivos: new Set<string>(),
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
        // Sequence check (etapa anterior) — must precede generic producao join below
        if (
          t.includes('FROM producao_repositorio pr') &&
          t.includes('JOIN repositorios r') &&
          t.includes('etapa = ANY($2)')
        ) {
          const ged = String(params?.[0] ?? '');
          const etapas = Array.isArray(params?.[1]) ? (params?.[1] as string[]) : [];
          const repoInternalIds = new Set(
            [...state.repositorios.values()]
              .filter((r) => r.id_repositorio_ged === ged)
              .map((r) => String(r.id_repositorio_recorda))
          );
          const found = [...state.producoes.values()].find(
            (p) => repoInternalIds.has(String(p.repositorio_id)) && etapas.includes(String(p.etapa))
          );
          return mk(found ? [{ id: found.id }] : []);
        }

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
          seadesk_confirmado_em: null,
          seadesk_confirmado_por: null,
        };
        state.repositorios.set(id, r);
        return mk([r], 'INSERT');
      }

      if (
        t.includes('FROM repositorios') &&
        t.includes('WHERE id_repositorio_recorda = $1') &&
        t.includes('etapa_atual')
      ) {
        const id = String(params?.[0] ?? '');
        const repo = state.repositorios.get(id);
        return mk(repo ? [repo] : []);
      }

      if (
        t.includes('SELECT etapa_atual::text, status_atual::text') &&
        t.includes('FROM repositorios')
      ) {
        const id = String(params?.[0] ?? '');
        const repo = state.repositorios.get(id);
        return mk(
          repo
            ? [
                {
                  etapa_atual: String(repo.etapa_atual),
                  status_atual: String(repo.status_atual),
                },
              ]
            : []
        );
      }

      if (t.includes('UPDATE repositorios') && t.includes("etapa_atual = 'RECONFERENCIA'")) {
        const id = String(params?.[0] ?? '');
        const repo = state.repositorios.get(id);
        if (repo) {
          repo.etapa_atual = 'RECONFERENCIA';
          repo.status_atual = 'EM_CONFERENCIA';
          state.repositorios.set(id, repo);
        }
        return mk([], 'UPDATE');
      }

      if (t.includes('UPDATE cq_avaliacoes') && t.includes("resultado = 'PENDENTE'")) {
        return mk([], 'UPDATE');
      }

      if (t.includes('INSERT INTO historico_etapas') && t.includes('cq_retornar_reconferencia')) {
        state.historicoEtapas.push({
          repositorio_id: String(params?.[0] ?? ''),
          etapa_origem: 'CONTROLE_QUALIDADE',
          etapa_destino: 'RECONFERENCIA',
          status_origem: String(params?.[2] ?? ''),
          status_destino: 'EM_CONFERENCIA',
          usuario_id: String(params?.[1] ?? ''),
        });
        return mk([], 'INSERT');
      }

      if (t.includes('INSERT INTO historico_etapas') && t.includes('cq_concluir')) {
        state.historicoEtapas.push({
          repositorio_id: String(params?.[0] ?? ''),
          etapa_origem: 'CONTROLE_QUALIDADE',
          etapa_destino: 'CONTROLE_QUALIDADE',
          status_origem: String(params?.[2] ?? ''),
          status_destino: String(params?.[1] ?? ''),
          usuario_id: String(params?.[3] ?? ''),
          detalhes: {
            origem: 'cq_concluir',
            total: params?.[4],
            reprovados: params?.[5],
          },
        });
        return mk([], 'INSERT');
      }

      if (
        t.includes('COUNT(doc_id) FILTER (WHERE COALESCE(resultado') &&
        t.includes('cq_avaliacoes')
      ) {
        const repoId = String(params?.[0] ?? '');
        const stats = state.cqStats.get(repoId) ?? {
          total: state.recebimentoProcessos.get(repoId) ?? 0,
          pendentes: 0,
          reprovados: 0,
        };
        return mk([
          {
            total: String(stats.total),
            pendentes: String(stats.pendentes),
            reprovados: String(stats.reprovados),
          },
        ]);
      }

      if (
        t.includes('UPDATE repositorios') &&
        t.includes('SET status_atual = $2') &&
        !t.includes('etapa_atual')
      ) {
        const id = String(params?.[0] ?? '');
        const repo = state.repositorios.get(id);
        if (repo) {
          repo.status_atual = String(params?.[1]);
          state.repositorios.set(id, repo);
        }
        return mk([], 'UPDATE');
      }

      if (t.includes('seadesk_confirmado_em IS NOT NULL AS confirmado')) {
        const id = String(params?.[0] ?? '');
        const repo = state.repositorios.get(id);
        return mk([{ confirmado: Boolean(repo?.seadesk_confirmado_em) }]);
      }

      if (t.includes('SET seadesk_confirmado_em = CURRENT_TIMESTAMP')) {
        const id = String(params?.[0] ?? '');
        const repo = state.repositorios.get(id);
        if (!repo) return mk([]);
        repo.seadesk_confirmado_em = new Date().toISOString();
        repo.seadesk_confirmado_por = String(params?.[1] ?? '');
        state.repositorios.set(id, repo);
        return mk(
          [
            {
              id_repositorio_recorda: id,
              seadesk_confirmado_em: repo.seadesk_confirmado_em,
              seadesk_confirmado_por: repo.seadesk_confirmado_por,
            },
          ],
          'UPDATE'
        );
      }

      if (t.includes('UPDATE repositorios') && t.includes('SET etapa_atual = $2')) {
        const id = String(params?.[0] ?? '');
        const repo = state.repositorios.get(id);
        if (!repo) return mk([], 'UPDATE');
        repo.etapa_atual = String(params?.[1]);
        repo.status_atual = String(params?.[2]);
        state.repositorios.set(id, repo);
        return mk([repo], 'UPDATE');
      }

      if (t.includes('FROM recebimento_processos') && t.includes('COUNT(*)')) {
        const repoId = String(params?.[0] ?? '');
        const total = state.recebimentoProcessos.get(repoId) ?? 0;
        return mk([{ total: String(total) }]);
      }

      if (
        t.includes('FROM repositorios') &&
        t.includes("INTERVAL '48 hours'") &&
        !t.includes('JOIN')
      ) {
        const cutoffMs = Date.now() - 48 * 60 * 60 * 1000;
        const count = [...state.repositorios.values()].filter((repo) => {
          const status = String(repo.status_atual ?? '');
          if (status === 'ENTREGUE' || status === 'CQ_APROVADO') return false;
          const atualizadoEm = repo.atualizado_em
            ? new Date(String(repo.atualizado_em)).getTime()
            : Date.now();
          return atualizadoEm < cutoffMs;
        }).length;
        return mk([{ total: String(count) }]);
      }

      if (
        t.includes('FROM checklists') &&
        t.includes('COUNT(*)') &&
        t.includes("status = 'CONCLUIDO'")
      ) {
        const repoId = String(params?.[0] ?? '');
        const etapa = String(params?.[1] ?? '');
        const total = [...state.checklists.values()].filter(
          (c) => c.repositorio_id === repoId && c.etapa === etapa && c.status === 'CONCLUIDO'
        ).length;
        return mk([{ total: String(total) }]);
      }

      if (t.includes('INSERT INTO historico_etapas')) {
        return mk([], 'INSERT');
      }

      if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') {
        return mk([]);
      }

      // ── CHECKLISTS ────────────────────────────────────────────────
      if (
        t.includes('FROM checklists') &&
        t.includes("status = 'CONCLUIDO'") &&
        !t.includes('COUNT(*)')
      ) {
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

      // Duplicate check — box etapas (PREPARACAO, CONFERENCIA, RECONFERENCIA)
      // Query: repositorio_id = $1, etapa = $2, origem != 'LEGADO' (any user)
      if (
        t.includes('FROM producao_repositorio') &&
        !t.includes('usuario_id = $1') &&
        t.includes('repositorio_id = $1') &&
        t.includes("!= 'LEGADO'")
      ) {
        const repoId = String(params?.[0] ?? '');
        const etapa = String(params?.[1] ?? '');
        const found = [...state.producoes.values()].find((p) => {
          const m =
            typeof p.marcadores === 'string'
              ? (JSON.parse(p.marcadores as string) as Record<string, unknown>)
              : ((p.marcadores ?? {}) as Record<string, unknown>);
          return (
            p.repositorio_id === repoId && p.etapa === etapa && (m.origem ?? 'SISTEMA') !== 'LEGADO'
          );
        });
        return mk(found ? [{ id: found.id }] : []);
      }

      // Duplicate check — other etapas (RECEBIMENTO, DIGITALIZACAO, etc.)
      // Query: usuario_id = $1, repositorio_id = $2, etapa = $4, origem != 'LEGADO'
      if (
        t.includes('FROM producao_repositorio') &&
        t.includes('usuario_id = $1') &&
        t.includes('repositorio_id = $2') &&
        t.includes("!= 'LEGADO'")
      ) {
        const userId = String(params?.[0] ?? '');
        const repoId = String(params?.[1] ?? '');
        const etapa = String(params?.[3] ?? '');
        const found = [...state.producoes.values()].find((p) => {
          const m =
            typeof p.marcadores === 'string'
              ? (JSON.parse(p.marcadores as string) as Record<string, unknown>)
              : ((p.marcadores ?? {}) as Record<string, unknown>);
          return (
            p.usuario_id === userId &&
            p.repositorio_id === repoId &&
            p.etapa === etapa &&
            (m.origem ?? 'SISTEMA') !== 'LEGADO'
          );
        });
        return mk(found ? [{ id: found.id, quantidade: found.quantidade }] : []);
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

      // ── PAINEL DE ETAPA ───────────────────────────────────────
      // Normal mode — count
      if (t.includes('@painel-etapa-count')) {
        const etapa = String(params?.[0] ?? '');
        let rows = [...state.producoes.values()].filter((p) => String(p.etapa) === etapa);
        const usuarioIdMatchCount = t.match(/pr\.usuario_id\s*=\s*\$(\d+)/);
        if (usuarioIdMatchCount?.[1]) {
          const uid = String(params?.[parseInt(usuarioIdMatchCount[1]) - 1] ?? '');
          rows = rows.filter((p) => String(p.usuario_id) === uid);
        }
        if (t.includes("AND COALESCE(pr.marcadores->>'origem', 'SISTEMA') = 'LEGADO'")) {
          rows = rows.filter((p) => {
            const m = (
              typeof p.marcadores === 'string'
                ? JSON.parse(p.marcadores as string)
                : (p.marcadores ?? {})
            ) as Record<string, string>;
            return m.origem === 'LEGADO';
          });
        } else if (t.includes("AND COALESCE(pr.marcadores->>'origem', 'SISTEMA') != 'LEGADO'")) {
          rows = rows.filter((p) => {
            const m = (
              typeof p.marcadores === 'string'
                ? JSON.parse(p.marcadores as string)
                : (p.marcadores ?? {})
            ) as Record<string, string>;
            return (m.origem ?? 'SISTEMA') !== 'LEGADO';
          });
        }
        return mk([{ total: String(rows.length) }]);
      }

      // statusEtapa filter path — all rows, no SQL pagination (pagination done in JS by route)
      if (t.includes('@painel-etapa-data-all')) {
        const etapa = String(params?.[0] ?? '');
        let rows = [...state.producoes.values()].filter((p) => String(p.etapa) === etapa);
        const usuarioIdMatchAll = t.match(/pr\.usuario_id\s*=\s*\$(\d+)/);
        if (usuarioIdMatchAll?.[1]) {
          const uid = String(params?.[parseInt(usuarioIdMatchAll[1]) - 1] ?? '');
          rows = rows.filter((p) => String(p.usuario_id) === uid);
        }
        if (t.includes("AND COALESCE(pr.marcadores->>'origem', 'SISTEMA') = 'LEGADO'")) {
          rows = rows.filter((p) => {
            const m = (
              typeof p.marcadores === 'string'
                ? JSON.parse(p.marcadores as string)
                : (p.marcadores ?? {})
            ) as Record<string, string>;
            return m.origem === 'LEGADO';
          });
        } else if (t.includes("AND COALESCE(pr.marcadores->>'origem', 'SISTEMA') != 'LEGADO'")) {
          rows = rows.filter((p) => {
            const m = (
              typeof p.marcadores === 'string'
                ? JSON.parse(p.marcadores as string)
                : (p.marcadores ?? {})
            ) as Record<string, string>;
            return (m.origem ?? 'SISTEMA') !== 'LEGADO';
          });
        }
        // Return ALL matching rows — no pagination slice (route paginates in JS)
        return mk(
          rows.map((p) => {
            const repo = [...state.repositorios.values()].find(
              (r) => r.id_repositorio_recorda === p.repositorio_id
            );
            const m = (
              typeof p.marcadores === 'string'
                ? JSON.parse(p.marcadores as string)
                : (p.marcadores ?? {})
            ) as Record<string, unknown>;
            const origemRaw = String(m.origem ?? 'SISTEMA');
            const repoId = String(p.repositorio_id);
            const temPreparacao = [...state.producoes.values()].some(
              (px) => String(px.repositorio_id) === repoId && String(px.etapa) === 'PREPARACAO'
            );
            const temDigitalizacao = [...state.producoes.values()].some(
              (px) => String(px.repositorio_id) === repoId && String(px.etapa) === 'DIGITALIZACAO'
            );
            const temConferencia = [...state.producoes.values()].some(
              (px) => String(px.repositorio_id) === repoId && String(px.etapa) === 'CONFERENCIA'
            );
            const temReconferencia = [...state.producoes.values()].some(
              (px) => String(px.repositorio_id) === repoId && String(px.etapa) === 'RECONFERENCIA'
            );
            const totalMesmaEtapa = [...state.producoes.values()].filter(
              (px) => String(px.repositorio_id) === repoId && String(px.etapa) === etapa
            ).length;
            return {
              producaoId: p.id,
              repositorioId: p.repositorio_id,
              repositorioCodigo: repo?.id_repositorio_ged ?? '',
              entidade: repo?.orgao ?? '',
              etapa: String(p.etapa),
              responsavelId: p.usuario_id,
              responsavelNome:
                m.colaborador_nome != null && String(m.colaborador_nome).length > 0
                  ? String(m.colaborador_nome)
                  : p.usuario_id
                    ? 'Test User'
                    : null,
              dataExecucao: p.data_producao,
              quantidade: p.quantidade,
              unidade: String(p.etapa) === 'DIGITALIZACAO' ? 'IMAGENS' : 'REPOSITORIO',
              origem: origemRaw === 'LEGADO' ? 'LEGADA' : 'LANCADA',
              etapaAtualRepositorio: repo?.etapa_atual ?? String(p.etapa),
              statusAtualRepositorio: repo?.status_atual ?? 'EM_PREPARACAO',
              temPreparacao,
              temDigitalizacao,
              temConferencia,
              temReconferencia,
              totalMesmaEtapa,
            };
          })
        );
      }

      // Normal mode — data
      if (t.includes('@painel-etapa-data') && !t.includes('@painel-etapa-data-all')) {
        const etapa = String(params?.[0] ?? '');
        let rows = [...state.producoes.values()].filter((p) => String(p.etapa) === etapa);
        const usuarioIdMatchData = t.match(/pr\.usuario_id\s*=\s*\$(\d+)/);
        if (usuarioIdMatchData?.[1]) {
          const uid = String(params?.[parseInt(usuarioIdMatchData[1]) - 1] ?? '');
          rows = rows.filter((p) => String(p.usuario_id) === uid);
        }
        if (t.includes("AND COALESCE(pr.marcadores->>'origem', 'SISTEMA') = 'LEGADO'")) {
          rows = rows.filter((p) => {
            const m = (
              typeof p.marcadores === 'string'
                ? JSON.parse(p.marcadores as string)
                : (p.marcadores ?? {})
            ) as Record<string, string>;
            return m.origem === 'LEGADO';
          });
        } else if (t.includes("AND COALESCE(pr.marcadores->>'origem', 'SISTEMA') != 'LEGADO'")) {
          rows = rows.filter((p) => {
            const m = (
              typeof p.marcadores === 'string'
                ? JSON.parse(p.marcadores as string)
                : (p.marcadores ?? {})
            ) as Record<string, string>;
            return (m.origem ?? 'SISTEMA') !== 'LEGADO';
          });
        }
        const mockLimit = Number(params?.[params.length - 2] ?? 20);
        const mockOffset = Number(params?.[params.length - 1] ?? 0);
        const paginated = rows.slice(mockOffset, mockOffset + mockLimit);
        return mk(
          paginated.map((p) => {
            const repo = [...state.repositorios.values()].find(
              (r) => r.id_repositorio_recorda === p.repositorio_id
            );
            const m = (
              typeof p.marcadores === 'string'
                ? JSON.parse(p.marcadores as string)
                : (p.marcadores ?? {})
            ) as Record<string, unknown>;
            const origemRaw = String(m.origem ?? 'SISTEMA');
            // Compute etapa flags for this repository
            const repoId = String(p.repositorio_id);
            const temPreparacao = [...state.producoes.values()].some(
              (px) => String(px.repositorio_id) === repoId && String(px.etapa) === 'PREPARACAO'
            );
            const temDigitalizacao = [...state.producoes.values()].some(
              (px) => String(px.repositorio_id) === repoId && String(px.etapa) === 'DIGITALIZACAO'
            );
            const temConferencia = [...state.producoes.values()].some(
              (px) => String(px.repositorio_id) === repoId && String(px.etapa) === 'CONFERENCIA'
            );
            const temReconferencia = [...state.producoes.values()].some(
              (px) => String(px.repositorio_id) === repoId && String(px.etapa) === 'RECONFERENCIA'
            );
            const totalMesmaEtapa = [...state.producoes.values()].filter(
              (px) => String(px.repositorio_id) === repoId && String(px.etapa) === etapa
            ).length;
            return {
              producaoId: p.id,
              repositorioId: p.repositorio_id,
              repositorioCodigo: repo?.id_repositorio_ged ?? '',
              entidade: repo?.orgao ?? '',
              etapa: String(p.etapa),
              responsavelId: p.usuario_id,
              responsavelNome:
                m.colaborador_nome != null && String(m.colaborador_nome).length > 0
                  ? String(m.colaborador_nome)
                  : p.usuario_id
                    ? 'Test User'
                    : null,
              dataExecucao: p.data_producao,
              quantidade: p.quantidade,
              unidade: String(p.etapa) === 'DIGITALIZACAO' ? 'IMAGENS' : 'REPOSITORIO',
              origem: origemRaw === 'LEGADO' ? 'LEGADA' : 'LANCADA',
              etapaAtualRepositorio: repo?.etapa_atual ?? String(p.etapa),
              statusAtualRepositorio: repo?.status_atual ?? 'EM_PREPARACAO',
              temPreparacao,
              temDigitalizacao,
              temConferencia,
              temReconferencia,
              totalMesmaEtapa,
            };
          })
        );
      }

      // Pendentes mode — count
      if (t.includes('@painel-pendentes-count')) {
        const etapa = String(params?.[0] ?? '');
        const reposWithProd = new Set(
          [...state.producoes.values()]
            .filter((p) => String(p.etapa) === etapa)
            .map((p) => String(p.repositorio_id))
        );
        const count = [...state.repositorios.values()].filter(
          (r) =>
            String(r.etapa_atual) === etapa &&
            r.projeto !== 'LEGADO' &&
            r.projeto !== 'IMPORTACAO_PRODUCAO' &&
            !reposWithProd.has(String(r.id_repositorio_recorda))
        ).length;
        return mk([{ total: String(count) }]);
      }

      // Pendentes mode — data
      if (t.includes('@painel-pendentes-data')) {
        const etapa = String(params?.[0] ?? '');
        const reposWithProd = new Set(
          [...state.producoes.values()]
            .filter((p) => String(p.etapa) === etapa)
            .map((p) => String(p.repositorio_id))
        );
        const mockLimit = Number(params?.[params.length - 2] ?? 20);
        const mockOffset = Number(params?.[params.length - 1] ?? 0);
        const pendentes = [...state.repositorios.values()]
          .filter(
            (r) =>
              String(r.etapa_atual) === etapa &&
              r.projeto !== 'LEGADO' &&
              r.projeto !== 'IMPORTACAO_PRODUCAO' &&
              !reposWithProd.has(String(r.id_repositorio_recorda))
          )
          .slice(mockOffset, mockOffset + mockLimit)
          .map((r) => ({
            repositorioId: r.id_repositorio_recorda,
            repositorioCodigo: r.id_repositorio_ged,
            entidade: r.orgao,
            etapa,
            statusEtapa: 'PENDENTE',
            responsavelId: null,
            responsavelNome: null,
            dataExecucao: null,
            quantidade: 0,
            unidade: etapa === 'DIGITALIZACAO' ? 'IMAGENS' : 'REPOSITORIO',
            origem: null,
            etapaAtualRepositorio: r.etapa_atual,
            statusAtualRepositorio: r.status_atual,
            etapaAtualCalculada: etapa,
            proximaEtapaSugerida: null,
            divergencias: [],
            temDivergencia: false,
            maiorSeveridade: null,
            producaoRelacionada: [],
          }));
        return mk(pendentes);
      }

      // ── SUGESTÕES CQ ──────────────────────────────────────────────────────
      if (t.includes('@sugestoes-cq-count') || t.includes('@sugestoes-cq-data')) {
        const EXCLUDED_CQ = new Set(['CQ_APROVADO', 'CQ_REPROVADO', 'EM_ENTREGA', 'ENTREGUE']);

        const candidates = [...state.repositorios.values()].filter((r) => {
          const repoId = String(r.id_repositorio_recorda);
          if (EXCLUDED_CQ.has(String(r.status_atual))) return false;
          if (state.lotesCQAtivos.has(repoId)) return false;
          const etapas = new Set(
            [...state.producoes.values()]
              .filter((p) => String(p.repositorio_id) === repoId)
              .map((p) => String(p.etapa))
          );
          return (
            etapas.has('PREPARACAO') &&
            etapas.has('DIGITALIZACAO') &&
            etapas.has('CONFERENCIA') &&
            etapas.has('RECONFERENCIA')
          );
        });

        if (t.includes('@sugestoes-cq-count')) {
          // Resumo variant (prontos / comAlertas)
          if (t.includes('comAlertas') || t.includes('"comAlertas"')) {
            let prontos = 0;
            let comAlertas = 0;
            for (const repo of candidates) {
              const repoId = String(repo.id_repositorio_recorda);
              const totalDig = [...state.producoes.values()]
                .filter(
                  (p) => String(p.repositorio_id) === repoId && String(p.etapa) === 'DIGITALIZACAO'
                )
                .reduce((sum, p) => sum + Number(p.quantidade ?? 0), 0);
              if (totalDig > 0) prontos++;
              else comAlertas++;
            }
            return mk([{ prontos: String(prontos), comAlertas: String(comAlertas) }]);
          }
          // Simple count
          return mk([{ total: String(candidates.length) }]);
        }

        // @sugestoes-cq-data
        const rows = candidates.map((r) => {
          const repoId = String(r.id_repositorio_recorda);
          const prods = [...state.producoes.values()].filter(
            (p) => String(p.repositorio_id) === repoId
          );

          const totalDig = prods
            .filter((p) => String(p.etapa) === 'DIGITALIZACAO')
            .reduce((sum, p) => sum + Number(p.quantidade ?? 0), 0);

          const reconfProds = prods
            .filter((p) => String(p.etapa) === 'RECONFERENCIA')
            .sort((a, b) =>
              String(b.data_producao ?? '').localeCompare(String(a.data_producao ?? ''))
            );
          const lastReconf = reconfProds[0];

          const hasLegado = prods.some((p) => {
            const m =
              typeof p.marcadores === 'string'
                ? (JSON.parse(p.marcadores as string) as Record<string, unknown>)
                : ((p.marcadores ?? {}) as Record<string, unknown>);
            return m.origem === 'LEGADO';
          });
          const hasLancada = prods.some((p) => {
            const m =
              typeof p.marcadores === 'string'
                ? (JSON.parse(p.marcadores as string) as Record<string, unknown>)
                : ((p.marcadores ?? {}) as Record<string, unknown>);
            return (m.origem ?? 'SISTEMA') !== 'LEGADO';
          });
          const origem: 'LANCADA' | 'LEGADA' | 'MISTA' =
            hasLegado && hasLancada ? 'MISTA' : hasLegado ? 'LEGADA' : 'LANCADA';

          const lastReconfM = lastReconf
            ? typeof lastReconf.marcadores === 'string'
              ? (JSON.parse(lastReconf.marcadores as string) as Record<string, unknown>)
              : ((lastReconf.marcadores ?? {}) as Record<string, unknown>)
            : null;
          const ultimaRespReconferencia =
            lastReconfM?.colaborador_nome != null && String(lastReconfM.colaborador_nome).length > 0
              ? String(lastReconfM.colaborador_nome)
              : lastReconf?.usuario_id
                ? 'Test User'
                : null;

          return {
            repositorioId: r.id_repositorio_recorda,
            repositorioCodigo: r.id_repositorio_ged,
            entidade: r.orgao,
            etapaAtual: r.etapa_atual,
            statusAtual: r.status_atual,
            temPreparacao: true,
            temDigitalizacao: true,
            temConferencia: true,
            temReconferencia: true,
            totalImagensDigitalizacao: totalDig,
            ultimaDataReconferencia: lastReconf?.data_producao ?? null,
            origem,
            ultimaRespReconferencia,
          };
        });

        // Slow path (no LIMIT in the SQL text): return all rows
        if (!t.includes('LIMIT $')) {
          return mk(rows);
        }
        // Fast path: paginate using last 2 params
        const mockLimit = Number(params?.[params.length - 2] ?? 20);
        const mockOffset = Number(params?.[params.length - 1] ?? 0);
        return mk(rows.slice(mockOffset, mockOffset + mockLimit));
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
    mockState.recebimentoProcessos.clear();
    mockState.cqStats.clear();
    mockState.historicoEtapas.splice(0, mockState.historicoEtapas.length);
    mockState.lotesCQAtivos.clear();
    mockState.counters = { repo: 0, checklist: 0, producao: 0 };
  }
}

export function getTestHistoricoEtapas(): Array<Record<string, unknown>> {
  return mockState?.historicoEtapas ?? [];
}

export function getTestRepositorio(id: string): Record<string, unknown> | undefined {
  return mockState?.repositorios.get(id);
}

export function seedTestRepositorio(overrides: Partial<Record<string, unknown>> = {}): string {
  if (!mockState) throw new Error('Mock database not initialized');
  const id = String(overrides.id_repositorio_recorda ?? `repo-${++mockState.counters.repo}`);
  const repo: Record<string, unknown> = {
    id_repositorio_recorda: id,
    id_repositorio_ged: '000001/2026',
    orgao: 'SEPLAG',
    projeto: 'SEMA',
    status_atual: 'RECEBIDO',
    etapa_atual: 'RECEBIMENTO',
    seadesk_confirmado_em: null,
    seadesk_confirmado_por: null,
    atualizado_em: new Date().toISOString(),
    ...overrides,
  };
  mockState.repositorios.set(id, repo);
  return id;
}

export function seedTestRepositorioParado(
  overrides: Partial<Record<string, unknown>> = {},
  hoursAgo = 72
): string {
  return seedTestRepositorio({
    ...overrides,
    atualizado_em: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
  });
}

export async function fetchDashboardTest(
  app: FastifyInstance,
  token: string
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'GET',
    url: '/dashboard',
    headers: { authorization: `Bearer ${token}` },
  });
  return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> };
}

export function seedTestChecklistConcluido(repositorioId: string, etapa: string): void {
  if (!mockState) throw new Error('Mock database not initialized');
  const id = `checklist-${++mockState.counters.checklist}`;
  mockState.checklists.set(id, {
    id,
    repositorio_id: repositorioId,
    etapa,
    status: 'CONCLUIDO',
  });
}

export function seedTestRecebimentoProcessos(repositorioId: string, total = 1): void {
  if (!mockState) throw new Error('Mock database not initialized');
  mockState.recebimentoProcessos.set(repositorioId, total);
}

export function seedTestProducao(overrides: Partial<Record<string, unknown>> = {}): string {
  if (!mockState) throw new Error('Mock database not initialized');
  const id = `producao-${++mockState.counters.producao}`;
  const record: Record<string, unknown> = {
    id,
    repositorio_id: '',
    etapa: 'PREPARACAO',
    checklist_id: null,
    usuario_id: 'test-operador-id',
    quantidade: 1,
    marcadores: { origem: 'SISTEMA' },
    data_producao: new Date().toISOString(),
    ...overrides,
  };
  mockState.producoes.set(id, record);
  return id;
}

export function seedTestCqStats(
  repositorioId: string,
  stats: { total?: number; pendentes?: number; reprovados?: number }
): void {
  if (!mockState) throw new Error('Mock database not initialized');
  const total = stats.total ?? mockState.recebimentoProcessos.get(repositorioId) ?? 1;
  mockState.cqStats.set(repositorioId, {
    total,
    pendentes: stats.pendentes ?? 0,
    reprovados: stats.reprovados ?? 0,
  });
  mockState.recebimentoProcessos.set(repositorioId, total);
}

/**
 * Mark a repositório as already assigned to an active (ABERTO) CQ batch.
 * Repos in an active batch are excluded from CQ suggestions.
 */
export function seedTestRepoEmLoteCQAtivo(repositorioId: string): void {
  if (!mockState) throw new Error('Mock database not initialized');
  mockState.lotesCQAtivos.add(repositorioId);
}

export function isRepositorioCqPendente(repositorioId: string): boolean {
  const repo = getTestRepositorio(repositorioId);
  return repo?.etapa_atual === 'CONTROLE_QUALIDADE' && repo?.status_atual === 'AGUARDANDO_CQ_LOTE';
}

export async function concluirCqTest(
  app: FastifyInstance,
  token: string,
  repositorioId: string
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: `/operacional/repositorios/${repositorioId}/cq-concluir`,
    headers: { authorization: `Bearer ${token}` },
  });
  return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> };
}

export async function avancarTestRepositorio(
  app: FastifyInstance,
  token: string,
  repositorioId: string,
  etapaDestino: string,
  statusDestino: string
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'PATCH',
    url: `/operacional/repositorios/${repositorioId}/avancar`,
    headers: { authorization: `Bearer ${token}` },
    payload: { etapaDestino, statusDestino },
  });
  return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> };
}

export async function retornarCqReconferenciaTest(
  app: FastifyInstance,
  token: string,
  repositorioId: string
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: 'POST',
    url: `/operacional/repositorios/${repositorioId}/cq-retornar-reconferencia`,
    headers: { authorization: `Bearer ${token}` },
  });
  return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> };
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
