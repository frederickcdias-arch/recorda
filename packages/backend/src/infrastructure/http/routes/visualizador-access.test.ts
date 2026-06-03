import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestServer,
  cleanupTestData,
  closeTestDatabase,
  fetchDashboardTest,
  getTestToken,
} from '../../../test/helpers.js';

describe('perfil visualizador', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildTestServer();
    token = await getTestToken(app, 'visualizador');
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData(app);
  });

  it('acessa o dashboard em modo leitura', async () => {
    const { statusCode, body } = await fetchDashboardTest(app, token);

    expect(statusCode).toBe(200);
    expect(body).toHaveProperty('stats');
  });

  it('recebe 403 ao tentar criar usuario', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        nome: 'Teste Bloqueado',
        email: 'bloqueado@recorda.local',
        senha: 'SenhaSegura123!',
        perfil: 'operador',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: 'Apenas administradores podem criar usuários',
    });
  });
});
