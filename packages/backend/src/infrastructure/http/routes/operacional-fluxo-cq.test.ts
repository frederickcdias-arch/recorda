import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  avancarTestRepositorio,
  buildTestServer,
  cleanupTestData,
  closeTestDatabase,
  concluirCqTest,
  getTestHistoricoEtapas,
  getTestRepositorio,
  getTestToken,
  isRepositorioCqPendente,
  retornarCqReconferenciaTest,
  seedTestChecklistConcluido,
  seedTestCqStats,
  seedTestRecebimentoProcessos,
  seedTestRepositorio,
} from '../../../test/helpers.js';

describe('Fluxo operacional completo até conclusão do CQ', () => {
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

  function prepararEtapa(
    etapaAtual: string,
    statusAtual: string,
    extras: Partial<Record<string, unknown>> = {}
  ): string {
    const repoId = seedTestRepositorio({
      etapa_atual: etapaAtual,
      status_atual: statusAtual,
      ...extras,
    });
    seedTestChecklistConcluido(repoId, etapaAtual);
    if (etapaAtual === 'RECEBIMENTO') {
      seedTestRecebimentoProcessos(repoId, 1);
    }
    return repoId;
  }

  it('percorre RECEBIMENTO → CQ, retorna para reconferência, reentra no CQ e conclui', async () => {
    const repoId = prepararEtapa('RECEBIMENTO', 'RECEBIDO');

    const etapas: Array<[string, string]> = [
      ['PREPARACAO', 'EM_PREPARACAO'],
      ['DIGITALIZACAO', 'EM_DIGITALIZACAO'],
      ['CONFERENCIA', 'EM_CONFERENCIA'],
      ['RECONFERENCIA', 'EM_CONFERENCIA'],
      ['CONTROLE_QUALIDADE', 'AGUARDANDO_CQ_LOTE'],
    ];

    for (const [etapaDestino, statusDestino] of etapas) {
      if (etapaDestino === 'CONFERENCIA') {
        const repo = getTestRepositorio(repoId);
        if (repo) {
          repo.seadesk_confirmado_em = new Date().toISOString();
        }
      }
      seedTestChecklistConcluido(repoId, getTestRepositorio(repoId)?.etapa_atual as string);
      const { statusCode } = await avancarTestRepositorio(
        app,
        token,
        repoId,
        etapaDestino,
        statusDestino
      );
      expect(statusCode).toBe(200);
    }

    expect(getTestRepositorio(repoId)).toMatchObject({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'AGUARDANDO_CQ_LOTE',
    });
    expect(isRepositorioCqPendente(repoId)).toBe(true);

    const retorno = await retornarCqReconferenciaTest(app, token, repoId);
    expect(retorno.statusCode).toBe(200);
    expect(getTestRepositorio(repoId)).toMatchObject({
      etapa_atual: 'RECONFERENCIA',
      status_atual: 'EM_CONFERENCIA',
    });

    seedTestChecklistConcluido(repoId, 'RECONFERENCIA');
    const reentradaCq = await avancarTestRepositorio(
      app,
      token,
      repoId,
      'CONTROLE_QUALIDADE',
      'AGUARDANDO_CQ_LOTE'
    );
    expect(reentradaCq.statusCode).toBe(200);

    seedTestCqStats(repoId, { total: 1, pendentes: 0, reprovados: 0 });
    const conclusao = await concluirCqTest(app, token, repoId);
    expect(conclusao.statusCode).toBe(200);
    expect(conclusao.body).toMatchObject({ status: 'CQ_APROVADO', concluido: true });

    expect(getTestRepositorio(repoId)).toMatchObject({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'CQ_APROVADO',
    });
    expect(isRepositorioCqPendente(repoId)).toBe(false);

    const historicoConclusao = getTestHistoricoEtapas().filter(
      (h) => h.status_destino === 'CQ_APROVADO'
    );
    expect(historicoConclusao.length).toBeGreaterThanOrEqual(1);
    expect(historicoConclusao[0]).toMatchObject({
      repositorio_id: repoId,
      etapa_origem: 'CONTROLE_QUALIDADE',
      status_destino: 'CQ_APROVADO',
    });
  });
});
