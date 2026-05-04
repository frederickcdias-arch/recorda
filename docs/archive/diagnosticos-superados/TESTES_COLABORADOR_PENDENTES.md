# 🧪 Testes Pendentes - Sistema de Colaborador

**Status Atual:** ⚠️ Testes não implementados  
**Prioridade:** Alta  
**Estimativa:** 8-12 horas de trabalho

---

## 📊 Status de Cobertura de Testes

| Categoria                    | Status              | Prioridade  |
| ---------------------------- | ------------------- | ----------- |
| **Testes Unitários Backend** | ❌ Não implementado | 🔴 Alta     |
| **Testes de Integração**     | ❌ Não implementado | 🔴 Alta     |
| **Testes E2E Frontend**      | ❌ Não implementado | 🟡 Média    |
| **Testes de Segurança**      | ✅ Auditoria manual | 🟢 Completo |
| **Documentação**             | ✅ Completa         | 🟢 Completo |

---

## 1️⃣ Testes Unitários Backend (Prioridade ALTA)

### Arquivo: `packages/backend/src/infrastructure/http/schemas/producao.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { lancarProducaoColaboradorSchema } from './producao';

describe('Schema de Validação: lancarProducaoColaboradorSchema', () => {
  describe('✅ Validações que devem PASSAR', () => {
    it('deve aceitar dados mínimos válidos', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO',
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(true);
    });

    it('deve aceitar dados completos válidos', () => {
      const dados = {
        data: '2026-04-15',
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO',
        funcao: 'Digitalizador',
        coordenadoria: 'CINF',
        quantidade: 10,
        tipo: 'Imagens',
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(true);
    });

    it('deve aceitar quantidade como string e converter', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO',
        quantidade: '10',
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(true);
      if (resultado.success) {
        expect(resultado.data.quantidade).toBe(10);
      }
    });

    it('deve aceitar todas as etapas válidas', () => {
      const etapasValidas = [
        'RECEBIMENTO',
        'PREPARACAO',
        'DIGITALIZACAO',
        'CONFERENCIA',
        'RECONFERENCIA',
        'MONTAGEM',
        'ATENDIMENTO',
        'CONTROLE_QUALIDADE',
        'ENTREGA',
      ];

      etapasValidas.forEach((etapa) => {
        const dados = { repositorio: '150/2026', etapa };
        const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
        expect(resultado.success).toBe(true);
      });
    });
  });

  describe('❌ Validações que devem FALHAR', () => {
    it('deve rejeitar data em formato inválido', () => {
      const casos = [
        { data: '15/04/2026' }, // DD/MM/YYYY
        { data: '2026/04/15' }, // YYYY/MM/DD
        { data: '15-04-2026' }, // DD-MM-YYYY
        { data: 'invalido' },
      ];

      casos.forEach(({ data }) => {
        const dados = { repositorio: '150/2026', etapa: 'DIGITALIZACAO', data };
        const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
        expect(resultado.success).toBe(false);
      });
    });

    it('deve rejeitar repositório vazio', () => {
      const dados = { repositorio: '', etapa: 'DIGITALIZACAO' };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar repositório muito longo (>100 chars)', () => {
      const dados = {
        repositorio: 'x'.repeat(101),
        etapa: 'DIGITALIZACAO',
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar etapa inválida', () => {
      const dados = { repositorio: '150/2026', etapa: 'ETAPA_INVALIDA' };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar quantidade negativa', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO',
        quantidade: -1,
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar quantidade zero', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO',
        quantidade: 0,
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar quantidade decimal', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO',
        quantidade: 10.5,
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar função muito longa (>200 chars)', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO',
        funcao: 'x'.repeat(201),
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });
  });
});
```

---

### Arquivo: `packages/backend/src/infrastructure/http/routes/metas.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestServer } from '../../test/helpers';

describe('POST /api/producao/lancar-direto', () => {
  let app: FastifyInstance;
  let colaboradorToken: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildTestServer();
    colaboradorToken = await getTestToken(app, 'colaborador');
    adminToken = await getTestToken(app, 'administrador');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Limpar dados de teste
    await app.database.query(`
      DELETE FROM producao_repositorio 
      WHERE repositorio_id IN (
        SELECT id_repositorio_recorda FROM repositorios 
        WHERE projeto = 'IMPORTACAO_PRODUCAO' 
        AND id_repositorio_ged LIKE 'TEST_%'
      )
    `);
  });

  describe('✅ Casos de Sucesso', () => {
    it('deve criar produção com sucesso', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          data: '2026-04-15',
          repositorio: 'TEST_001/2026',
          etapa: 'RECEBIMENTO',
          coordenadoria: 'CINF',
          quantidade: 10,
          tipo: 'Imagens',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toHaveProperty('message', 'Produção registrada com sucesso');
      expect(response.json()).toHaveProperty('producao');
    });

    it('deve criar repositório automaticamente se não existir', async () => {
      const repoId = `TEST_${Date.now()}/2026`;

      const response = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          quantidade: 1,
        },
      });

      expect(response.statusCode).toBe(201);

      // Verificar que repositório foi criado
      const repo = await app.database.query(
        `SELECT * FROM repositorios WHERE id_repositorio_ged = $1`,
        [repoId]
      );
      expect(repo.rows.length).toBe(1);
      expect(repo.rows[0].projeto).toBe('IMPORTACAO_PRODUCAO');
    });

    it('deve criar checklist concluído automaticamente', async () => {
      const repoId = `TEST_${Date.now()}/2026`;

      await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          quantidade: 1,
        },
      });

      const checklist = await app.database.query(
        `SELECT c.* FROM checklists c
         JOIN repositorios r ON r.id_repositorio_recorda = c.repositorio_id
         WHERE r.id_repositorio_ged = $1 AND c.etapa = 'RECEBIMENTO'`,
        [repoId]
      );

      expect(checklist.rows.length).toBeGreaterThan(0);
      expect(checklist.rows[0].status).toBe('CONCLUIDO');
      expect(checklist.rows[0].ativo).toBe(false);
    });

    it('deve permitir mesma etapa com quantidade diferente', async () => {
      const repoId = `TEST_${Date.now()}/2026`;

      // Primeiro lançamento
      await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          quantidade: 10,
        },
      });

      // Segundo lançamento com quantidade diferente
      const response = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          quantidade: 15,
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('deve permitir mesmo repositório em coordenadorias diferentes', async () => {
      const repoId = `TEST_${Date.now()}/2026`;

      // CINF
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          coordenadoria: 'CINF',
          quantidade: 10,
        },
      });

      // CEE
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          coordenadoria: 'CEE',
          quantidade: 10,
        },
      });

      expect(response1.statusCode).toBe(201);
      expect(response2.statusCode).toBe(201);
    });

    it('deve permitir sequência correta de etapas', async () => {
      const repoId = `TEST_${Date.now()}/2026`;

      // 1. RECEBIMENTO
      let response = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
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
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: { repositorio: repoId, etapa: 'PREPARACAO', coordenadoria: 'CINF', quantidade: 1 },
      });
      expect(response.statusCode).toBe(201);

      // 3. DIGITALIZACAO
      response = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
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
  });

  describe('❌ Casos de Erro', () => {
    it('deve bloquear duplicata exata', async () => {
      const repoId = `TEST_${Date.now()}/2026`;
      const payload = {
        repositorio: repoId,
        etapa: 'RECEBIMENTO',
        quantidade: 10,
        tipo: 'Imagens',
      };

      // Primeiro lançamento
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload,
      });
      expect(response1.statusCode).toBe(201);

      // Tentativa de duplicata
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload,
      });

      expect(response2.statusCode).toBe(409);
      expect(response2.json()).toHaveProperty('error', 'Produção duplicada');
    });

    it('deve bloquear pulo de etapa', async () => {
      const repoId = `TEST_${Date.now()}/2026`;

      // Apenas RECEBIMENTO
      await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'RECEBIMENTO',
          coordenadoria: 'CINF',
          quantidade: 1,
        },
      });

      // Tenta pular para DIGITALIZACAO (sem PREPARACAO)
      const response = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: repoId,
          etapa: 'DIGITALIZACAO',
          coordenadoria: 'CINF',
          quantidade: 1,
        },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toHaveProperty('error', 'Sequência de etapas inválida');
      expect(response.json().detalhes).toHaveProperty('etapaAnteriorNecessaria', 'PREPARACAO');
    });

    it('deve rejeitar requisição sem autenticação', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        payload: { repositorio: 'TEST/2026', etapa: 'RECEBIMENTO' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('deve rejeitar dados inválidos do schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: '', // inválido
          etapa: 'DIGITALIZACAO',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('🔒 Segurança', () => {
    it('deve marcar origem como SISTEMA', async () => {
      const repoId = `TEST_${Date.now()}/2026`;

      await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: { repositorio: repoId, etapa: 'RECEBIMENTO', quantidade: 1 },
      });

      const producao = await app.database.query(
        `SELECT p.marcadores FROM producao_repositorio p
         JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
         WHERE r.id_repositorio_ged = $1`,
        [repoId]
      );

      expect(producao.rows[0].marcadores.origem).toBe('SISTEMA');
    });

    it('deve usar prepared statements (previne SQL injection)', async () => {
      // Tentativa de SQL injection no repositório
      const response = await app.inject({
        method: 'POST',
        url: '/api/producao/lancar-direto',
        headers: { authorization: `Bearer ${colaboradorToken}` },
        payload: {
          repositorio: "'; DROP TABLE repositorios; --",
          etapa: 'RECEBIMENTO',
          quantidade: 1,
        },
      });

      // Deve falhar na validação (schema) ou criar repositório com nome estranho
      // Mas NÃO deve executar o DROP TABLE
      const tabelas = await app.database.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name = 'repositorios'`
      );
      expect(tabelas.rows.length).toBe(1); // Tabela ainda existe
    });
  });
});
```

---

## 2️⃣ Testes E2E Frontend (Prioridade MÉDIA)

### Arquivo: `packages/frontend/tests/e2e/colaborador-producao.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Sistema de Colaborador - Lançamento de Produção', () => {
  test.beforeEach(async ({ page }) => {
    // Login como colaborador
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'colaborador@test.com');
    await page.fill('input[type="password"]', 'senha123');
    await page.click('button[type="submit"]');

    // Aguardar redirect para dashboard
    await page.waitForURL('**/colaborador/dashboard');
  });

  test('deve exibir dashboard simplificado para colaborador', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Dashboard');

    // Verificar que opções de admin NÃO aparecem
    await expect(page.locator('text=Configurações')).not.toBeVisible();
    await expect(page.locator('text=Usuários')).not.toBeVisible();
  });

  test('deve navegar para página de lançamento de produção', async ({ page }) => {
    await page.click('text=Lançar Produção');
    await expect(page).toHaveURL(/.*\/lancar-producao/);
    await expect(page.locator('h1')).toContainText('Lançar Produção');
  });

  test('deve lançar produção com sucesso', async ({ page }) => {
    await page.goto('http://localhost:5173/colaborador/lancar-producao');

    const repoId = `E2E_${Date.now()}/2026`;

    // Preencher formulário
    await page.fill('input[name="data"]', '2026-04-15');
    await page.fill('input[name="repositorio"]', repoId);
    await page.selectOption('select[name="etapa"]', 'DIGITALIZACAO');
    await page.selectOption('select[name="coordenadoria"]', { index: 1 });
    await page.fill('input[name="quantidade"]', '10');
    await page.selectOption('select[name="tipo"]', 'Imagens');

    // Submeter
    await page.click('button:has-text("Registrar Produção")');

    // Verificar toast de sucesso
    await expect(page.locator('.Toastify__toast--success')).toBeVisible();
    await expect(page.locator('.Toastify__toast--success')).toContainText('sucesso');

    // Formulário deve limpar
    await expect(page.locator('input[name="repositorio"]')).toHaveValue('');
  });

  test('deve criar nova coordenadoria', async ({ page }) => {
    await page.goto('http://localhost:5173/colaborador/lancar-producao');

    const novoNome = `COORD_E2E_${Date.now()}`;

    // Preencher input de nova coordenadoria
    await page.fill('input[placeholder*="Nova coordenadoria"]', novoNome);

    // Click no botão Adicionar
    await page.click('button:has-text("Adicionar")');

    // Aguardar toast de sucesso
    await expect(page.locator('.Toastify__toast--success')).toBeVisible();

    // Verificar que coordenadoria aparece no select
    const select = page.locator('select[name="coordenadoria"]');
    await expect(select).toContainText(novoNome);

    // Verificar que está selecionada
    await expect(select).toHaveValue(novoNome);
  });

  test('deve mostrar erro ao tentar duplicata', async ({ page }) => {
    await page.goto('http://localhost:5173/colaborador/lancar-producao');

    const repoId = `E2E_DUP_${Date.now()}/2026`;
    const payload = {
      data: '2026-04-15',
      repositorio: repoId,
      etapa: 'RECEBIMENTO',
      quantidade: '10',
      tipo: 'Imagens',
    };

    // Primeiro lançamento
    await page.fill('input[name="data"]', payload.data);
    await page.fill('input[name="repositorio"]', payload.repositorio);
    await page.selectOption('select[name="etapa"]', payload.etapa);
    await page.fill('input[name="quantidade"]', payload.quantidade);
    await page.selectOption('select[name="tipo"]', payload.tipo);
    await page.click('button:has-text("Registrar Produção")');

    await expect(page.locator('.Toastify__toast--success')).toBeVisible();
    await page.waitForTimeout(2000); // Aguardar toast desaparecer

    // Segundo lançamento (duplicata)
    await page.fill('input[name="data"]', payload.data);
    await page.fill('input[name="repositorio"]', payload.repositorio);
    await page.selectOption('select[name="etapa"]', payload.etapa);
    await page.fill('input[name="quantidade"]', payload.quantidade);
    await page.selectOption('select[name="tipo"]', payload.tipo);
    await page.click('button:has-text("Registrar Produção")');

    // Verificar toast de erro
    await expect(page.locator('.Toastify__toast--error')).toBeVisible();
    await expect(page.locator('.Toastify__toast--error')).toContainText('duplicada');
  });

  test('deve mostrar erro ao pular etapa', async ({ page }) => {
    await page.goto('http://localhost:5173/colaborador/lancar-producao');

    const repoId = `E2E_SEQ_${Date.now()}/2026`;

    // Tentar lançar CONFERENCIA sem etapas anteriores
    await page.fill('input[name="repositorio"]', repoId);
    await page.selectOption('select[name="etapa"]', 'CONFERENCIA');
    await page.fill('input[name="quantidade"]', '1');
    await page.click('button:has-text("Registrar Produção")');

    // Verificar toast de erro
    await expect(page.locator('.Toastify__toast--error')).toBeVisible();
    await expect(page.locator('.Toastify__toast--error')).toContainText(
      'Sequência de etapas inválida'
    );
  });

  test('deve validar campos obrigatórios', async ({ page }) => {
    await page.goto('http://localhost:5173/colaborador/lancar-producao');

    // Tentar submeter sem preencher
    await page.click('button:has-text("Registrar Produção")');

    // HTML5 validation deve prevenir submit
    const isInvalid = await page.locator('input[name="repositorio"]:invalid').isVisible();
    expect(isInvalid).toBe(true);
  });
});

test.describe('Painel Admin - Visualização de Produções de Colaboradores', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'senha123');
    await page.click('button[type="submit"]');
  });

  test('deve exibir produções com badge de origem', async ({ page }) => {
    await page.goto('http://localhost:5173/operacao/producao');

    // Aguardar carregamento
    await page.waitForSelector('table');

    // Verificar que badges aparecem
    const badgeSistema = page.locator('text=Sistema').or(page.locator('text=Fluxo'));
    const badgeLegado = page.locator('text=Legado');

    // Pelo menos um dos badges deve estar visível
    await expect(badgeSistema.or(badgeLegado).first()).toBeVisible();
  });

  test('deve ordenar por coluna ao clicar no cabeçalho', async ({ page }) => {
    await page.goto('http://localhost:5173/operacao/producao');

    await page.waitForSelector('table');

    // Click no cabeçalho "Quantidade"
    await page.click('th:has-text("Qtd")');

    // Verificar que ícone de ordenação aparece
    const sortIcon = page.locator('th:has-text("Qtd") svg');
    await expect(sortIcon).toBeVisible();

    // Click novamente inverte ordem
    await page.click('th:has-text("Qtd")');
    await expect(sortIcon).toBeVisible();
  });

  test('deve filtrar produções', async ({ page }) => {
    await page.goto('http://localhost:5173/operacao/producao');

    await page.waitForSelector('table');

    // Usar filtro de busca
    await page.fill('input[placeholder*="Busca"]', 'E2E');

    // Aguardar debounce
    await page.waitForTimeout(500);

    // Verificar que apenas resultados relevantes aparecem
    const rows = page.locator('tbody tr');
    const count = await rows.count();

    // Se houver resultados, todos devem conter "E2E"
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const text = await rows.nth(i).textContent();
        expect(text?.toUpperCase()).toContain('E2E');
      }
    }
  });
});
```

---

## 3️⃣ Como Executar os Testes

### Setup

```bash
# Instalar dependências de teste (se ainda não instaladas)
npm install --save-dev vitest @vitest/ui @playwright/test

# Backend: configurar Vitest
# Criar vitest.config.ts
```

### Executar Testes Unitários

```bash
cd packages/backend
npm run test

# Com coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Executar Testes E2E

```bash
cd packages/frontend
npx playwright install  # Primeira vez

npm run test:e2e

# Com UI
npx playwright test --ui

# Debug mode
npx playwright test --debug
```

---

## 4️⃣ Configuração Necessária

### `packages/backend/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['dist/**', 'test/**', '**/*.test.ts'],
    },
  },
});
```

### `packages/backend/test/setup.ts`

```typescript
import { beforeAll, afterAll } from 'vitest';
import { createTestDatabase } from './helpers';

let testDb: any;

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.close();
});
```

### `packages/frontend/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## 5️⃣ Priorização de Implementação

### Fase 1: Testes Críticos (1-2 dias)

1. ✅ Schema validation (producao.test.ts)
2. ✅ Endpoint de lançamento - casos básicos
3. ✅ Validação de duplicatas
4. ✅ Validação de sequência

### Fase 2: Testes Completos (2-3 dias)

5. ✅ Todos os casos de erro
6. ✅ Testes de segurança
7. ✅ Criação automática de repositórios/checklists
8. ✅ E2E fluxo feliz

### Fase 3: Cobertura Total (3-4 dias)

9. ✅ E2E todos os cenários
10. ✅ Testes de performance
11. ✅ Testes de acessibilidade
12. ✅ Documentação de testes

---

## 6️⃣ Métricas de Cobertura Esperadas

| Módulo              | Cobertura Alvo |
| ------------------- | -------------- |
| Schema Zod          | 100%           |
| Endpoint lancamento | 95%+           |
| Validações          | 100%           |
| E2E crítico         | 80%+           |
| **TOTAL**           | **90%+**       |

---

## 📝 Checklist de Implementação

### Setup

- [ ] Configurar Vitest no backend
- [ ] Configurar Playwright no frontend
- [ ] Criar helpers de teste
- [ ] Setup de banco de testes

### Testes Unitários

- [ ] producao.test.ts (schema)
- [ ] metas.test.ts (endpoint)
- [ ] Casos de sucesso (6 testes)
- [ ] Casos de erro (4 testes)
- [ ] Casos de segurança (2 testes)

### Testes E2E

- [ ] Login e navegação
- [ ] Lançamento de produção
- [ ] Criar coordenadoria
- [ ] Erro de duplicata
- [ ] Erro de sequência
- [ ] Validação de campos
- [ ] Painel admin
- [ ] Ordenação de colunas

### CI/CD

- [ ] Adicionar testes no pipeline
- [ ] Configurar relatórios de cobertura
- [ ] Notificações de falha

---

## 🎯 Resultado Esperado

Após implementação completa:

✅ **90%+ de cobertura de código**  
✅ **Todos os fluxos críticos testados**  
✅ **Testes automatizados em CI/CD**  
✅ **Confiança para deploy em produção**  
✅ **Documentação de testes completa**

---

**Status:** ⚠️ Aguardando implementação  
**Tempo estimado:** 8-12 horas  
**Prioridade:** 🔴 Alta
