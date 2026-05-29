import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestServer,
  cleanupTestData,
  closeTestDatabase,
  concluirCqTest,
  getTestHistoricoEtapas,
  getTestRepositorio,
  getTestToken,
  isRepositorioCqPendente,
  seedTestCqStats,
  seedTestRepositorio,
} from '../../../test/helpers.js';

describe('POST /operacional/repositorios/:id/cq-concluir', () => {
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

  it('define CQ_APROVADO como status final quando todos os documentos foram aprovados', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'AGUARDANDO_CQ_LOTE',
    });
    seedTestCqStats(repoId, { total: 2, pendentes: 0, reprovados: 0 });

    const { statusCode, body } = await concluirCqTest(app, token, repoId);

    expect(statusCode).toBe(200);
    expect(body).toMatchObject({
      status: 'CQ_APROVADO',
      total: 2,
      reprovados: 0,
      concluido: true,
    });
    expect(getTestRepositorio(repoId)).toMatchObject({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'CQ_APROVADO',
    });
    expect(isRepositorioCqPendente(repoId)).toBe(false);
  });

  it('registra histórico de conclusão com status_origem real', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'AGUARDANDO_CQ_LOTE',
    });
    seedTestCqStats(repoId, { total: 1, pendentes: 0, reprovados: 0 });

    const { statusCode } = await concluirCqTest(app, token, repoId);
    expect(statusCode).toBe(200);

    expect(getTestHistoricoEtapas()).toEqual([
      expect.objectContaining({
        repositorio_id: repoId,
        etapa_origem: 'CONTROLE_QUALIDADE',
        etapa_destino: 'CONTROLE_QUALIDADE',
        status_origem: 'AGUARDANDO_CQ_LOTE',
        status_destino: 'CQ_APROVADO',
        detalhes: expect.objectContaining({ origem: 'cq_concluir', total: 1, reprovados: 0 }),
      }),
    ]);
  });

  it('define CQ_REPROVADO quando há documentos reprovados', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'AGUARDANDO_CQ_LOTE',
    });
    seedTestCqStats(repoId, { total: 3, pendentes: 0, reprovados: 1 });

    const { statusCode, body } = await concluirCqTest(app, token, repoId);

    expect(statusCode).toBe(200);
    expect(body.status).toBe('CQ_REPROVADO');
    expect(getTestRepositorio(repoId)?.status_atual).toBe('CQ_REPROVADO');
  });

  it('rejeita conclusão com documentos pendentes', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'AGUARDANDO_CQ_LOTE',
    });
    seedTestCqStats(repoId, { total: 2, pendentes: 1, reprovados: 0 });

    const { statusCode, body } = await concluirCqTest(app, token, repoId);

    expect(statusCode).toBe(400);
    expect(body.code).toBe('DOCS_PENDENTES');
  });

  it('rejeita conclusão fora da etapa CONTROLE_QUALIDADE', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'RECONFERENCIA',
      status_atual: 'EM_CONFERENCIA',
    });
    seedTestCqStats(repoId, { total: 1, pendentes: 0, reprovados: 0 });

    const { statusCode, body } = await concluirCqTest(app, token, repoId);

    expect(statusCode).toBe(400);
    expect(body.code).toBe('ETAPA_INVALIDA');
  });

  it('rejeita reconclusão quando CQ já foi concluído', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'CQ_APROVADO',
    });
    seedTestCqStats(repoId, { total: 1, pendentes: 0, reprovados: 0 });

    const { statusCode, body } = await concluirCqTest(app, token, repoId);

    expect(statusCode).toBe(400);
    expect(body.code).toBe('CQ_JA_CONCLUIDO');
  });
});
