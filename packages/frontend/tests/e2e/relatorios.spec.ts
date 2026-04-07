import { test, expect } from '@playwright/test';
import { performLogin } from './support/auth';

test.describe('Relatorios gerenciais', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega ate relatorios gerenciais e exibe filtros de data', async ({ page }) => {
    await page.getByRole('button', { name: /^Relat.rios$/i }).click();
    await page.getByRole('link', { name: /Relat.rios Gerenciais/i }).click();
    await expect(page).toHaveURL(/\/relatorios\/gerenciais$/);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/Data In.cio/i)).toBeVisible();
    await expect(page.getByText(/Data Fim/i)).toBeVisible();
  });

  test('exibe botoes de exportacao PDF e Excel', async ({ page }) => {
    await page.goto('/relatorios/gerenciais');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /PDF/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Excel/i }).first()).toBeVisible();
  });
});

test.describe('Exportacoes', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega ate exportacoes e exibe lista de relatorios disponiveis', async ({ page }) => {
    await page.getByRole('button', { name: /^Relat.rios$/i }).click();
    await page.getByRole('link', { name: /Exporta..es/i }).click();
    await expect(page).toHaveURL(/\/relatorios\/exportacoes$/);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('main').getByRole('heading', { name: /Exporta..es/i })).toBeVisible();
    await expect(page.getByText(/Relat.rio Gerencial de Produ..o/i)).toBeVisible();
  });

  test('cada tipo de relatorio tem botoes PDF e Excel', async ({ page }) => {
    await page.goto('/relatorios/exportacoes');
    await page.waitForLoadState('networkidle');

    const pdfButtons = page.getByRole('button', { name: /PDF/i });
    const excelButtons = page.getByRole('button', { name: /Excel/i });

    expect(await pdfButtons.count()).toBeGreaterThanOrEqual(1);
    expect(await excelButtons.count()).toBeGreaterThanOrEqual(1);
  });
});
