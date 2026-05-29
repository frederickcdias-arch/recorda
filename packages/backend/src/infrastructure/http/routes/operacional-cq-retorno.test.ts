import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestServer,
  cleanupTestData,
  closeTestDatabase,
  getTestHistoricoEtapas,
  getTestRepositorio,
  getTestToken,
  retornarCqReconferenciaTest,
  seedTestRepositorio,
} from '../../../test/helpers.js';

describe('POST /operacional/repositorios/:id/cq-retornar-reconferencia', () => {
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

  it('retorna repositório do CQ para RECONFERENCIA com status EM_CONFERENCIA', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'AGUARDANDO_CQ_LOTE',
    });

    const { statusCode, body } = await retornarCqReconferenciaTest(app, token, repoId);

    expect(statusCode).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      etapaAtual: 'RECONFERENCIA',
      statusAtual: 'EM_CONFERENCIA',
    });
    expect(getTestRepositorio(repoId)).toMatchObject({
      etapa_atual: 'RECONFERENCIA',
      status_atual: 'EM_CONFERENCIA',
    });
  });

  it('registra histórico de retorno CQ → RECONFERENCIA', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'CQ_REPROVADO',
    });

    const { statusCode } = await retornarCqReconferenciaTest(app, token, repoId);
    expect(statusCode).toBe(200);

    expect(getTestHistoricoEtapas()).toEqual([
      expect.objectContaining({
        repositorio_id: repoId,
        etapa_origem: 'CONTROLE_QUALIDADE',
        etapa_destino: 'RECONFERENCIA',
        status_origem: 'CQ_REPROVADO',
        status_destino: 'EM_CONFERENCIA',
      }),
    ]);
  });

  it('rejeita retorno fora da etapa CONTROLE_QUALIDADE', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'RECONFERENCIA',
      status_atual: 'EM_CONFERENCIA',
    });

    const { statusCode, body } = await retornarCqReconferenciaTest(app, token, repoId);
    expect(statusCode).toBe(400);
    expect(body.code).toBe('ETAPA_INVALIDA');
  });

  it('marca rota legada cq-retornar-recebimento como descontinuada', async () => {
    const repoId = seedTestRepositorio({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'AGUARDANDO_CQ_LOTE',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/operacional/repositorios/${repoId}/cq-retornar-recebimento`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ code: 'ROTA_DESCONTINUADA' });
  });
});
