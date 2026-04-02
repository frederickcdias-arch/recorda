import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@recorda.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin123';

async function performLogin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.goto('/login');
  await page.getByLabel(/E-mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/Senha/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

test.describe('Produção', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega até a página de produção e exibe conteúdo', async ({ page }) => {
    const producaoSection = page.getByRole('button', { name: /Produ/i });
    await producaoSection.click();
    await page.getByRole('link', { name: /^Painel$/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/producao$/);
    await expect(page.getByRole('heading', { name: /Produção/i })).toBeVisible({ timeout: 10_000 });
  });

  test('navega até importar produção e exibe formulário', async ({ page }) => {
    const producaoSection = page.getByRole('button', { name: /Produ/i });
    await producaoSection.click();
    await page.getByRole('link', { name: /Importar Produção/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/producao\/importar$/);
    await expect(page.getByRole('heading', { name: /Importar Produção/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('dashboard exibe card de produção total', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Produção Total/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Base de Conhecimento Operacional', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega até base de conhecimento e exibe conteúdo', async ({ page }) => {
    const operacaoSection = page.getByRole('button', { name: /Opera/i });
    await operacaoSection.click();
    await page.getByRole('link', { name: /Conhecimento/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/operacao\/conhecimento$/);
    await expect(page.getByText(/Conhecimento/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
