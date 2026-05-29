import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  avancarTestRepositorio,
  buildTestServer,
  cleanupTestData,
  closeTestDatabase,
  getTestToken,
  seedTestChecklistConcluido,
  seedTestRecebimentoProcessos,
  seedTestRepositorio,
} from '../../../test/helpers.js';

describe('PATCH /operacional/repositorios/:id/avancar — sequência operacional', () => {
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

  function prepararRepo(
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

  it('permite RECEBIMENTO → PREPARACAO', async () => {
    const repoId = prepararRepo('RECEBIMENTO', 'RECEBIDO');
    const { statusCode } = await avancarTestRepositorio(
      app,
      token,
      repoId,
      'PREPARACAO',
      'EM_PREPARACAO'
    );
    expect(statusCode).toBe(200);
  });

  it('permite PREPARACAO → DIGITALIZACAO', async () => {
    const repoId = prepararRepo('PREPARACAO', 'EM_PREPARACAO');
    const { statusCode } = await avancarTestRepositorio(
      app,
      token,
      repoId,
      'DIGITALIZACAO',
      'EM_DIGITALIZACAO'
    );
    expect(statusCode).toBe(200);
  });

  it('permite DIGITALIZACAO → CONFERENCIA com Seadesk confirmado', async () => {
    const repoId = prepararRepo('DIGITALIZACAO', 'EM_DIGITALIZACAO', {
      seadesk_confirmado_em: new Date().toISOString(),
    });
    const { statusCode } = await avancarTestRepositorio(
      app,
      token,
      repoId,
      'CONFERENCIA',
      'EM_CONFERENCIA'
    );
    expect(statusCode).toBe(200);
  });

  it('rejeita DIGITALIZACAO → CONFERENCIA sem Seadesk confirmado', async () => {
    const repoId = prepararRepo('DIGITALIZACAO', 'EM_DIGITALIZACAO');
    const { statusCode, body } = await avancarTestRepositorio(
      app,
      token,
      repoId,
      'CONFERENCIA',
      'EM_CONFERENCIA'
    );
    expect(statusCode).toBe(400);
    expect(body.code).toBe('SEADESK_PENDENTE');
  });

  it('permite CONFERENCIA → RECONFERENCIA', async () => {
    const repoId = prepararRepo('CONFERENCIA', 'EM_CONFERENCIA');
    const { statusCode } = await avancarTestRepositorio(
      app,
      token,
      repoId,
      'RECONFERENCIA',
      'EM_CONFERENCIA'
    );
    expect(statusCode).toBe(200);
  });

  it('permite RECONFERENCIA → CONTROLE_QUALIDADE', async () => {
    const repoId = prepararRepo('RECONFERENCIA', 'EM_CONFERENCIA');
    const { statusCode } = await avancarTestRepositorio(
      app,
      token,
      repoId,
      'CONTROLE_QUALIDADE',
      'AGUARDANDO_CQ_LOTE'
    );
    expect(statusCode).toBe(200);
  });

  it('rejeita RECEBIMENTO → CONTROLE_QUALIDADE', async () => {
    const repoId = prepararRepo('RECEBIMENTO', 'RECEBIDO');
    const { statusCode, body } = await avancarTestRepositorio(
      app,
      token,
      repoId,
      'CONTROLE_QUALIDADE',
      'AGUARDANDO_CQ_LOTE'
    );
    expect(statusCode).toBe(422);
    expect(body.code).toBe('ETAPA_SEQUENCIA_INVALIDA');
    expect(body.error).toContain('sequência operacional');
  });

  it('rejeita PREPARACAO → CONFERENCIA', async () => {
    const repoId = prepararRepo('PREPARACAO', 'EM_PREPARACAO');
    const { statusCode, body } = await avancarTestRepositorio(
      app,
      token,
      repoId,
      'CONFERENCIA',
      'EM_CONFERENCIA'
    );
    expect(statusCode).toBe(422);
    expect(body.code).toBe('ETAPA_SEQUENCIA_INVALIDA');
  });

  it('rejeita DIGITALIZACAO → CONTROLE_QUALIDADE', async () => {
    const repoId = prepararRepo('DIGITALIZACAO', 'EM_DIGITALIZACAO', {
      seadesk_confirmado_em: new Date().toISOString(),
    });
    const { statusCode, body } = await avancarTestRepositorio(
      app,
      token,
      repoId,
      'CONTROLE_QUALIDADE',
      'AGUARDANDO_CQ_LOTE'
    );
    expect(statusCode).toBe(422);
    expect(body.code).toBe('ETAPA_SEQUENCIA_INVALIDA');
  });

  it('permite devolução CONTROLE_QUALIDADE → RECONFERENCIA', async () => {
    const repoId = prepararRepo('CONTROLE_QUALIDADE', 'AGUARDANDO_CQ_LOTE');
    const { statusCode } = await avancarTestRepositorio(
      app,
      token,
      repoId,
      'RECONFERENCIA',
      'EM_CONFERENCIA'
    );
    expect(statusCode).toBe(200);
  });
});
