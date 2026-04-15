import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import pg from 'pg';
import type { DatabaseConnection } from '../infrastructure/database/connection.js';

const { Pool } = pg;

let testPool: pg.Pool | null = null;
let testConnection: DatabaseConnection | null = null;

export async function createTestDatabase(): Promise<DatabaseConnection> {
  if (testConnection) return testConnection;

  testPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_TEST_NAME || 'recorda_test',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  // Criar DatabaseConnection compatível
  testConnection = {
    pool: testPool,
    query: testPool.query.bind(testPool),
    healthCheck: async () => {
      try {
        await testPool!.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    close: async () => {
      await testPool?.end();
      testPool = null;
      testConnection = null;
    }
  };

  return testConnection;
}

export async function closeTestDatabase(): Promise<void> {
  if (testConnection) {
    await testConnection.close();
  }
}

export async function buildTestServer(): Promise<FastifyInstance> {
  // Criar servidor Fastify simples para testes
  const app = Fastify({
    logger: false,
  });

  // Decorar com database
  const database = await createTestDatabase();
  app.decorate('database', database);

  // Registrar rotas necessárias para testes
  // (assumindo que as rotas já estão implementadas)
  
  return app;
}

export async function getTestToken(
  app: FastifyInstance,
  perfil: 'colaborador' | 'operador' | 'administrador' = 'colaborador'
): Promise<string> {
  // Criar usuário de teste se não existir
  const email = `${perfil}@test.com`;
  const password = 'senha123';

  try {
    // Tentar fazer login
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password }
    });

    if (loginResponse.statusCode === 200) {
      const data = loginResponse.json();
      return data.token;
    }

    // Se login falhar, criar usuário
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/usuarios',
      payload: {
        nome: `Usuário ${perfil}`,
        email,
        password,
        perfil,
        ativo: true
      },
      headers: {
        // Usar token de admin se disponível
        authorization: process.env.TEST_ADMIN_TOKEN ? `Bearer ${process.env.TEST_ADMIN_TOKEN}` : undefined
      }
    });

    if (createResponse.statusCode === 201 || createResponse.statusCode === 200) {
      // Fazer login novamente
      const newLoginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password }
      });

      const data = newLoginResponse.json();
      return data.token;
    }

    throw new Error(`Falha ao criar usuário de teste: ${createResponse.statusCode}`);
  } catch (error) {
    console.error('Erro ao obter token de teste:', error);
    throw error;
  }
}

export async function cleanupTestData(
  app: FastifyInstance,
  patterns: string[] = ['TEST_%', 'E2E_%']
): Promise<void> {
  const database = (app as any).database as pg.Pool;

  for (const pattern of patterns) {
    await database.query(
      `DELETE FROM producao_repositorio 
       WHERE repositorio_id IN (
         SELECT id_repositorio_recorda FROM repositorios 
         WHERE projeto = 'IMPORTACAO_PRODUCAO' 
         AND id_repositorio_ged LIKE $1
       )`,
      [pattern]
    );

    await database.query(
      `DELETE FROM checklists 
       WHERE repositorio_id IN (
         SELECT id_repositorio_recorda FROM repositorios 
         WHERE projeto = 'IMPORTACAO_PRODUCAO' 
         AND id_repositorio_ged LIKE $1
       )`,
      [pattern]
    );

    await database.query(
      `DELETE FROM repositorios 
       WHERE projeto = 'IMPORTACAO_PRODUCAO' 
       AND id_repositorio_ged LIKE $1`,
      [pattern]
    );
  }
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
): Promise<any> {
  const defaultPayload = {
    repositorio: generateTestRepoId(),
    etapa: 'RECEBIMENTO',
    coordenadoria: 'CINF',
    quantidade: 1,
    data: new Date().toISOString().split('T')[0],
    ...payload
  };

  const response = await app.inject({
    method: 'POST',
    url: '/api/producao/lancar-direto',
    headers: { authorization: `Bearer ${token}` },
    payload: defaultPayload
  });

  return {
    statusCode: response.statusCode,
    body: response.json(),
    payload: defaultPayload
  };
}

export async function waitForMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
