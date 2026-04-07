import { test, expect } from '@playwright/test';
import { performLogin } from './support/auth';

test.describe('Producao', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega ate a pagina de producao e exibe conteudo', async ({ page }) => {
    await page.getByRole('button', { name: /Produ/i }).click();
    await page.getByRole('link', { name: /^Painel$/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/producao$/);
    await expect(page.getByRole('main').getByText(/Nenhum registro encontrado|Produ..o/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('navega ate importar producao e exibe formulario', async ({ page }) => {
    await page.getByRole('button', { name: /Produ/i }).click();
    await page.getByRole('link', { name: /Importar Produ..o/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/producao\/importar$/);
    await expect(page.getByRole('main').getByText(/Importar Produ..o/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('dashboard exibe card de producao do mes', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /Produ..o do M.s/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Base de conhecimento operacional', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega ate base de conhecimento e exibe conteudo', async ({ page }) => {
    await page.getByRole('button', { name: /Opera/i }).click();
    await page.getByRole('link', { name: /Conhecimento/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/operacao\/conhecimento$/);
    await expect(page.getByRole('main').getByText(/Manual de Recebimento|Conhecimento/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
