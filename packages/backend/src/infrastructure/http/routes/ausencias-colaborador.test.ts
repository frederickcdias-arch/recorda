import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer, closeTestDatabase, getTestToken } from '../../../test/helpers.js';

describe('Ausências — perfil colaborador (consulta apenas)', () => {
  let app: FastifyInstance;
  let tokenColaborador: string;
  let tokenAdmin: string;

  beforeAll(async () => {
    app = await buildTestServer();
    tokenColaborador = await getTestToken(app, 'colaborador');
    tokenAdmin = await getTestToken(app, 'administrador');
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('bloqueia POST /ausencias para colaborador', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/ausencias',
      headers: { authorization: `Bearer ${tokenColaborador}` },
      payload: {
        tipoAusenciaId: '00000000-0000-4000-8000-000000000001',
        dataInicio: '2026-05-01',
        dataFim: '2026-05-01',
        periodo: 'dia_completo',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: expect.stringContaining('administradores'),
    });
  });

  it('mantém criação de ausência restrita ao admin', async () => {
    const colaboradorResponse = await app.inject({
      method: 'POST',
      url: '/admin/ausencias',
      headers: { authorization: `Bearer ${tokenColaborador}` },
      payload: {
        usuarioId: '00000000-0000-4000-8000-000000000002',
        tipoAusenciaId: '00000000-0000-4000-8000-000000000001',
        dataInicio: '2026-05-01',
        dataFim: '2026-05-01',
        periodo: 'dia_completo',
      },
    });

    expect(colaboradorResponse.statusCode).toBe(403);

    const adminResponse = await app.inject({
      method: 'POST',
      url: '/admin/ausencias',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: {
        usuarioId: '00000000-0000-4000-8000-000000000002',
        tipoAusenciaId: '00000000-0000-4000-8000-000000000001',
        dataInicio: '2026-05-01',
        dataFim: '2026-05-01',
        periodo: 'dia_completo',
      },
    });

    expect(adminResponse.statusCode).not.toBe(403);
  });
});
