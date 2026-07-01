import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTestServer,
  cleanupTestData,
  closeTestDatabase,
  getTestToken,
  seedTestProducao,
  seedTestRepositorio,
  seedTestRepoEmLoteCQAtivo,
} from '../../../test/helpers.js';

describe('GET /operacional/controle-qualidade/sugestoes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildTestServer();
    token = await getTestToken(app, 'operador');
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData(app);
  });

  // Helper: seed a repository with all 4 completed production etapas
  function seedRepoComTodasEtapas(overrides: Record<string, unknown> = {}): string {
    const repoId = seedTestRepositorio({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'AGUARDANDO_CQ_LOTE',
      ...overrides,
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'PREPARACAO',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'DIGITALIZACAO',
      quantidade: 50,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'CONFERENCIA',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'RECONFERENCIA',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });
    return repoId;
  }

  // ── 1. Repositório com todas etapas concluídas → prontoParaCQ=true ──────────
  it('repositório com todas as etapas concluídas aparece com prontoParaCQ=true', async () => {
    const repoId = seedRepoComTodasEtapas();

    const res = await app.inject({
      method: 'GET',
      url: '/operacional/controle-qualidade/sugestoes',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: Record<string, unknown>[];
      meta: { total: number; page: number; limit: number };
      resumo: { prontos: number; comAlertas: number };
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      repositorioId: repoId,
      prontoParaCQ: true,
      etapaAtualCalculada: 'CONTROLE_QUALIDADE',
    });
    expect(body.meta.total).toBe(1);
  });

  // ── 2. Repositório sem reconferência → não aparece na lista ──────────────────
  it('repositório sem reconferência não aparece nas sugestões', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'RECONFERENCIA',
      status_atual: 'EM_CONFERENCIA',
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'PREPARACAO',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'DIGITALIZACAO',
      quantidade: 50,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'CONFERENCIA',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });
    // No RECONFERENCIA production

    const res = await app.inject({
      method: 'GET',
      url: '/operacional/controle-qualidade/sugestoes',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: unknown[]; meta: { total: number } };
    expect(body.data).toHaveLength(0);
    expect(body.meta.total).toBe(0);
  });

  // ── 3. Repositório já em lote CQ ativo → não aparece ────────────────────────
  it('repositório em lote CQ ativo (ABERTO) não aparece nas sugestões', async () => {
    const repoId = seedRepoComTodasEtapas();
    seedTestRepoEmLoteCQAtivo(repoId);

    const res = await app.inject({
      method: 'GET',
      url: '/operacional/controle-qualidade/sugestoes',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: unknown[]; meta: { total: number } };
    expect(body.data).toHaveLength(0);
    expect(body.meta.total).toBe(0);
  });

  // ── 4. Repositório CQ_APROVADO → não aparece ────────────────────────────────
  it('repositório com status CQ_APROVADO não aparece nas sugestões', async () => {
    seedRepoComTodasEtapas({ status_atual: 'CQ_APROVADO', etapa_atual: 'CONTROLE_QUALIDADE' });

    const res = await app.inject({
      method: 'GET',
      url: '/operacional/controle-qualidade/sugestoes',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  // ── 5. Repositório CQ_REPROVADO → não aparece ───────────────────────────────
  it('repositório com status CQ_REPROVADO não aparece nas sugestões', async () => {
    seedRepoComTodasEtapas({ status_atual: 'CQ_REPROVADO', etapa_atual: 'CONTROLE_QUALIDADE' });

    const res = await app.inject({
      method: 'GET',
      url: '/operacional/controle-qualidade/sugestoes',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  // ── 6. Digitalização sem imagens → prontoParaCQ=false, aparece com alerta ────
  it('repositório com digitalização sem imagens → prontoParaCQ=false e aparece na lista', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'AGUARDANDO_CQ_LOTE',
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'PREPARACAO',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'DIGITALIZACAO',
      quantidade: 0,
      marcadores: { origem: 'SISTEMA' },
    }); // 0 images
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'CONFERENCIA',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'RECONFERENCIA',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/operacional/controle-qualidade/sugestoes',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: Array<Record<string, unknown>>;
      resumo: { prontos: number; comAlertas: number };
    };
    expect(body.data).toHaveLength(1);
    const item = body.data[0] as Record<string, unknown>;
    expect(item).toMatchObject({ prontoParaCQ: false });
    const divergencias = item.divergencias as Array<{ tipo: string; severidade: string }>;
    expect(
      divergencias.some((d) => d.tipo === 'DIGITALIZACAO_SEM_IMAGENS' && d.severidade === 'alta')
    ).toBe(true);
  });

  // ── 7. incluirComAlertas=false → exclui repos com divergência alta ───────────
  it('incluirComAlertas=false exclui repositórios com divergências altas', async () => {
    // Pronto (sem divergências)
    seedRepoComTodasEtapas({
      id_repositorio_recorda: 'repo-pronto',
      id_repositorio_ged: '000001/2026',
    });
    // Com alerta (digitalização sem imagens)
    const repoComAlerta = seedTestRepositorio({
      id_repositorio_ged: '000002/2026',
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'AGUARDANDO_CQ_LOTE',
    });
    seedTestProducao({
      repositorio_id: repoComAlerta,
      etapa: 'PREPARACAO',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: repoComAlerta,
      etapa: 'DIGITALIZACAO',
      quantidade: 0,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: repoComAlerta,
      etapa: 'CONFERENCIA',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: repoComAlerta,
      etapa: 'RECONFERENCIA',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/operacional/controle-qualidade/sugestoes?incluirComAlertas=false',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<Record<string, unknown>>; meta: { total: number } };
    // Only the ready repo should appear
    expect(body.data.every((r) => r.prontoParaCQ === true)).toBe(true);
    // The repo with alerts must not appear
    expect(body.data.some((r) => r.repositorioId === repoComAlerta)).toBe(false);
  });

  // ── 8. Paginação — meta.total correto ────────────────────────────────────────
  it('paginação: meta.total reflete o total real, não o tamanho da página', async () => {
    // Seed 3 ready repos
    for (let i = 1; i <= 3; i++) {
      const repoId = seedTestRepositorio({
        id_repositorio_ged: `00000${i}/2026`,
        etapa_atual: 'CONTROLE_QUALIDADE',
        status_atual: 'AGUARDANDO_CQ_LOTE',
      });
      seedTestProducao({
        repositorio_id: repoId,
        etapa: 'PREPARACAO',
        quantidade: 1,
        marcadores: { origem: 'SISTEMA' },
      });
      seedTestProducao({
        repositorio_id: repoId,
        etapa: 'DIGITALIZACAO',
        quantidade: 10,
        marcadores: { origem: 'SISTEMA' },
      });
      seedTestProducao({
        repositorio_id: repoId,
        etapa: 'CONFERENCIA',
        quantidade: 1,
        marcadores: { origem: 'SISTEMA' },
      });
      seedTestProducao({
        repositorio_id: repoId,
        etapa: 'RECONFERENCIA',
        quantidade: 1,
        marcadores: { origem: 'SISTEMA' },
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: '/operacional/controle-qualidade/sugestoes?page=1&limit=2',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: unknown[];
      meta: { total: number; page: number; limit: number };
    };
    expect(body.data).toHaveLength(2);
    expect(body.meta.total).toBe(3);
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(2);
  });

  // ── 9. resumo.prontos + resumo.comAlertas correto ────────────────────────────
  it('resumo agrega corretamente prontos e comAlertas', async () => {
    // Pronto
    seedRepoComTodasEtapas({ id_repositorio_ged: '000001/2026' });
    // Com alerta (sem imagens)
    const comAlerta = seedTestRepositorio({
      id_repositorio_ged: '000002/2026',
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'AGUARDANDO_CQ_LOTE',
    });
    seedTestProducao({
      repositorio_id: comAlerta,
      etapa: 'PREPARACAO',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: comAlerta,
      etapa: 'DIGITALIZACAO',
      quantidade: 0,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: comAlerta,
      etapa: 'CONFERENCIA',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });
    seedTestProducao({
      repositorio_id: comAlerta,
      etapa: 'RECONFERENCIA',
      quantidade: 1,
      marcadores: { origem: 'SISTEMA' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/operacional/controle-qualidade/sugestoes',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { resumo: { prontos: number; comAlertas: number } };
    expect(body.resumo.prontos).toBe(1);
    expect(body.resumo.comAlertas).toBe(1);
  });

  // ── 10. Produção legada (origem LEGADO) também é candidata ───────────────────
  it('repositório com produção legada em todas as etapas aparece nas sugestões', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'AGUARDANDO_CQ_LOTE',
      projeto: 'LEGADO',
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'PREPARACAO',
      quantidade: 1,
      marcadores: { origem: 'LEGADO', colaborador_nome: 'Joao Silva' },
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'DIGITALIZACAO',
      quantidade: 100,
      marcadores: { origem: 'LEGADO', colaborador_nome: 'Joao Silva' },
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'CONFERENCIA',
      quantidade: 1,
      marcadores: { origem: 'LEGADO', colaborador_nome: 'Joao Silva' },
    });
    seedTestProducao({
      repositorio_id: repoId,
      etapa: 'RECONFERENCIA',
      quantidade: 1,
      marcadores: { origem: 'LEGADO', colaborador_nome: 'Joao Silva' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/operacional/controle-qualidade/sugestoes',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<Record<string, unknown>> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      repositorioId: repoId,
      prontoParaCQ: true,
      origem: 'LEGADA',
    });
    // Responsible from marcadores.colaborador_nome
    const item = body.data[0] as Record<string, unknown>;
    expect((item.ultimaEtapaConcluida as Record<string, unknown>).responsavelNome).toBe(
      'Joao Silva'
    );
  });
});
