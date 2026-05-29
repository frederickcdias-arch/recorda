import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestServer,
  cleanupTestData,
  closeTestDatabase,
  fetchDashboardTest,
  getTestToken,
  seedTestRepositorioParado,
} from '../../../test/helpers.js';

describe('GET /dashboard — alerta de repositórios parados', () => {
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

  function findAlertaParados(body: Record<string, unknown>) {
    const alertas = body.alertas as Array<{ titulo?: string }> | undefined;
    return alertas?.find((alerta) => alerta.titulo === 'Repositórios Parados');
  }

  it('exclui CQ_APROVADO do alerta de parados', async () => {
    seedTestRepositorioParado({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'CQ_APROVADO',
    });

    const { statusCode, body } = await fetchDashboardTest(app, token);

    expect(statusCode).toBe(200);
    expect(findAlertaParados(body)).toBeUndefined();
  });

  it('mantém CQ_REPROVADO no alerta de parados', async () => {
    seedTestRepositorioParado({
      etapa_atual: 'CONTROLE_QUALIDADE',
      status_atual: 'CQ_REPROVADO',
    });

    const { statusCode, body } = await fetchDashboardTest(app, token);

    expect(statusCode).toBe(200);
    expect(findAlertaParados(body)).toMatchObject({
      titulo: 'Repositórios Parados',
      descricao: expect.stringContaining('1 repositório(s)'),
    });
  });

  it('continua alertando repositórios operacionais parados', async () => {
    seedTestRepositorioParado({
      etapa_atual: 'PREPARACAO',
      status_atual: 'EM_PREPARACAO',
    });

    const { statusCode, body } = await fetchDashboardTest(app, token);

    expect(statusCode).toBe(200);
    expect(findAlertaParados(body)).toBeDefined();
  });
});
