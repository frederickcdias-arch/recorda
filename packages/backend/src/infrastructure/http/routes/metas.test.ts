import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import {
  buildTestServer,
  getTestToken,
  cleanupTestData,
  generateTestRepoId,
} from '../../../test/helpers.js';

describe('POST /producao/lancar-direto', () => {
  let app: FastifyInstance;
  let colaboradorToken: string;
  let operadorToken: string;

  beforeAll(async () => {
    app = await buildTestServer();

    // Obter token de teste
    colaboradorToken = await getTestToken(app, 'colaborador');
    operadorToken = await getTestToken(app, 'operador');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Limpar dados de teste
    await cleanupTestData(app);
  });

  describe('âœ… Casos de Sucesso', () => {
    it('deve criar produÃ§Ã£o com sucesso', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          data: '2026-04-15',
          repositorio: generateTestRepoId(),
          etapa: 'RECEBIMENTO',
          coordenadoria: 'CINF',
          quantidade: 10,
          tipo: 'Imagens',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toHaveProperty('message', 'Produção registrada com sucesso');
      expect(body).toHaveProperty('producao');
      expect(body.producao).toHaveProperty('id');
    });

    it('deve criar repositÃ³rio automaticamente se nÃ£o existir', async () => {
      const repoId = generateTestRepoId();

      const response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          quantidade: 1,
        },
      });

      expect(response.statusCode).toBe(201);

      // Verificar que repositÃ³rio foi criado
      const database = (app as any).database;
      const repo = await database.query(
        `SELECT * FROM repositorios WHERE id_repositorio_ged = $1`,
        [repoId]
      );

      expect(repo.rows.length).toBe(1);
      expect(repo.rows[0].projeto).toBe('IMPORTACAO_PRODUCAO');
      expect(repo.rows[0].status_atual).toBeTruthy();
      expect(repo.rows[0].etapa_atual).toBe('RECEBIMENTO');
    });

    it('deve criar checklist concluÃ­do automaticamente', async () => {
      const repoId = generateTestRepoId();

      await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          quantidade: 1,
        },
      });

      const database = (app as any).database;
      const checklist = await database.query(
        `SELECT c.* FROM checklists c
         JOIN repositorios r ON r.id_repositorio_recorda = c.repositorio_id
         WHERE r.id_repositorio_ged = $1 AND c.etapa = 'RECEBIMENTO'`,
        [repoId]
      );

      expect(checklist.rows.length).toBeGreaterThan(0);
      expect(checklist.rows[0].status).toBe('CONCLUIDO');
      expect(checklist.rows[0].ativo).toBe(false);
      expect(checklist.rows[0].data_conclusao).toBeTruthy();
    });

    it('deve permitir mesma etapa com quantidade diferente', async () => {
      const repoId = generateTestRepoId();

      // Primeiro lanÃ§amento
      const response1 = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          quantidade: 10,
        },
      });
      expect(response1.statusCode).toBe(201);

      // Segundo lanÃ§amento com quantidade diferente
      const response2 = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          quantidade: 15,
        },
      });
      expect(response2.statusCode).toBe(201);

      // Verificar que ambos existem
      const database = (app as any).database;
      const producoes = await database.query(
        `SELECT COUNT(*) as total FROM producao_repositorio p
         JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
         WHERE r.id_repositorio_ged = $1`,
        [repoId]
      );
      expect(Number(producoes.rows[0].total)).toBe(2);
    });

    it('deve permitir mesmo repositÃ³rio em coordenadorias diferentes', async () => {
      const repoId = generateTestRepoId();

      // CINF
      const response1 = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          coordenadoria: 'CINF',
          quantidade: 10,
        },
      });
      expect(response1.statusCode).toBe(201);

      // CEE
      const response2 = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          coordenadoria: 'CEE',
          quantidade: 10,
        },
      });
      expect(response2.statusCode).toBe(201);
    });

    it('deve permitir sequÃªncia correta de etapas', async () => {
      const repoId = generateTestRepoId();

      // 1. RECEBIMENTO
      let response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          coordenadoria: 'CINF',
          quantidade: 1,
        },
      });
      expect(response.statusCode).toBe(201);

      // 2. PREPARACAO
      response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'PREPARACAO',
          coordenadoria: 'CINF',
          quantidade: 1,
        },
      });
      expect(response.statusCode).toBe(201);

      // 3. DIGITALIZACAO
      response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'DIGITALIZACAO',
          coordenadoria: 'CINF',
          quantidade: 1,
        },
      });
      expect(response.statusCode).toBe(201);
    });

    it('deve aceitar quantidade como string e converter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: generateTestRepoId(),
          etapa: 'RECEBIMENTO',
          quantidade: '25', // string
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('deve usar coordenadoria padrÃ£o SGPA quando nÃ£o informada', async () => {
      const repoId = generateTestRepoId();

      const response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          quantidade: 1,
        },
      });

      expect(response.statusCode).toBe(201);

      // Verificar que repositÃ³rio tem orgao = SGPA
      const database = (app as any).database;
      const repo = await database.query(
        `SELECT orgao FROM repositorios WHERE id_repositorio_ged = $1`,
        [repoId]
      );
      expect(repo.rows[0].orgao).toBe('SGPA');
    });
  });

  describe('âŒ Casos de Erro', () => {
    it('deve bloquear duplicata exata', async () => {
      const repoId = generateTestRepoId();
      const payload = {
        repositorio: repoId,
        etapa: 'RECEBIMENTO',
        quantidade: 10,
        tipo: 'Imagens',
      };

      // Primeiro lanÃ§amento
      const response1 = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload,
      });
      expect(response1.statusCode).toBe(201);

      // Tentativa de duplicata
      const response2 = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload,
      });

      expect(response2.statusCode).toBe(409);
      const body = response2.json();
      expect(body).toHaveProperty('error', 'Produção duplicada');
      expect(body.message).toContain('Você já lançou esta produção');
    });

    it('deve permitir o mesmo lançamento quando feito por outro usuário', async () => {
      const repoId = generateTestRepoId();
      const payload = {
        repositorio: repoId,
        etapa: 'RECEBIMENTO',
        coordenadoria: 'CINF',
        quantidade: 10,
        tipo: 'Imagens',
      };

      const response1 = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload,
      });
      expect(response1.statusCode).toBe(201);

      const response2 = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${operadorToken}` },
        payload,
      });

      expect(response2.statusCode).toBe(201);
      const body = response2.json();
      expect(body).toHaveProperty('message', 'Produção registrada com sucesso');
    });

    it('deve bloquear pulo de etapa', async () => {
      const repoId = generateTestRepoId();

      await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          coordenadoria: 'CINF',
          quantidade: 1,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'DIGITALIZACAO',
          coordenadoria: 'CINF',
          quantidade: 1,
        },
      });

      expect(response.statusCode).toBe(422);
      const body = response.json();
      expect(body).toHaveProperty('error', 'Sequência de etapas inválida');
      expect(body.detalhes).toHaveProperty('etapaAnteriorNecessaria', ['PREPARACAO']);
    });

    it('deve avisar falta da etapa anterior mesmo quando o repositório já teve outro lançamento', async () => {
      const repoId = generateTestRepoId();

      const response1 = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          coordenadoria: 'CINF',
          quantidade: 1,
        },
      });
      expect(response1.statusCode).toBe(201);

      const response2 = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${operadorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'DIGITALIZACAO',
          coordenadoria: 'CINF',
          quantidade: 1,
        },
      });

      expect(response2.statusCode).toBe(422);
      const body = response2.json();
      expect(body).toHaveProperty('error', 'Sequência de etapas inválida');
      expect(body.detalhes).toHaveProperty('etapaAnteriorNecessaria', ['PREPARACAO']);
    });

    it('deve rejeitar requisiÃ§Ã£o sem autenticaÃ§Ã£o', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        payload: {
          repositorio: generateTestRepoId(),
          etapa: 'RECEBIMENTO',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('deve rejeitar dados invÃ¡lidos do schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: '', // invÃ¡lido
          etapa: 'DIGITALIZACAO',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('deve rejeitar quantidade zero', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: generateTestRepoId(),
          etapa: 'RECEBIMENTO',
          quantidade: 0,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('deve rejeitar quantidade negativa', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: generateTestRepoId(),
          etapa: 'RECEBIMENTO',
          quantidade: -5,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('deve rejeitar data em formato invÃ¡lido', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: generateTestRepoId(),
          etapa: 'RECEBIMENTO',
          data: '15/04/2026', // formato invÃ¡lido
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('deve rejeitar etapa invÃ¡lida', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: generateTestRepoId(),
          etapa: 'ETAPA_INVALIDA',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('ðŸ”’ SeguranÃ§a', () => {
    it('deve marcar origem como SISTEMA', async () => {
      const repoId = generateTestRepoId();

      await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          quantidade: 1,
        },
      });

      const database = (app as any).database;
      const producao = await database.query(
        `SELECT p.marcadores FROM producao_repositorio p
         JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
         WHERE r.id_repositorio_ged = $1`,
        [repoId]
      );

      expect(producao.rows.length).toBeGreaterThan(0);
      expect(producao.rows[0].marcadores.origem).toBe('SISTEMA');
    });

    it('deve usar prepared statements (previne SQL injection)', async () => {
      // Tentativa de SQL injection no repositÃ³rio
      await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: "'; DROP TABLE repositorios; --",
          etapa: 'RECEBIMENTO',
          quantidade: 1,
        },
      });

      // Deve falhar na validaÃ§Ã£o ou criar repositÃ³rio com nome estranho
      // Mas NÃƒO deve executar o DROP TABLE
      const database = (app as any).database;
      const tabelas = await database.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_name = 'repositorios'`
      );

      expect(tabelas.rows.length).toBe(1); // Tabela ainda existe
    });

    it('deve salvar colaborador correto no registro', async () => {
      const repoId = generateTestRepoId();

      await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          quantidade: 1,
        },
      });

      const database = (app as any).database;
      const producao = await database.query(
        `SELECT p.usuario_id, u.email FROM producao_repositorio p
         JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
         JOIN usuarios u ON u.id = p.usuario_id
         WHERE r.id_repositorio_ged = $1`,
        [repoId]
      );

      expect(producao.rows.length).toBeGreaterThan(0);
      expect(producao.rows[0].email).toBe('colaborador@test.com');
    });
  });

  describe('ðŸ“Š Marcadores JSONB', () => {
    it('deve salvar todos marcadores corretamente', async () => {
      const repoId = generateTestRepoId();

      await app.inject({
        method: 'POST',
        url: '/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          funcao: 'Digitalizador P/B',
          coordenadoria: 'CINF',
          tipo: 'Imagens',
          quantidade: 10,
        },
      });

      const database = (app as any).database;
      const producao = await database.query(
        `SELECT p.marcadores FROM producao_repositorio p
         JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
         WHERE r.id_repositorio_ged = $1`,
        [repoId]
      );

      const marcadores = producao.rows[0].marcadores;
      expect(marcadores.origem).toBe('SISTEMA');
      expect(marcadores.funcao).toBe('Digitalizador P/B');
      expect(marcadores.coordenadoria).toBe('CINF');
      expect(marcadores.tipo).toBe('Imagens');
    });
  });
});
