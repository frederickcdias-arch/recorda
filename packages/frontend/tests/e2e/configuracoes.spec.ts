import { test, expect } from '@playwright/test';
import { performLogin } from './support/auth';

test.describe('Configuracoes', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega ate a pagina de empresa e exibe formulario', async ({ page }) => {
    await page.getByRole('button', { name: /Configura/i }).click();
    await page.getByRole('link', { name: /Empresa/i }).click();
    await expect(page).toHaveURL(/\/configuracoes\/empresa$/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel(/Nome da Empresa/i)).toBeVisible();
  });

  test('navega ate a pagina de usuarios e exibe listagem', async ({ page }) => {
    await page.getByRole('button', { name: /Configura/i }).click();
    await page.getByRole('link', { name: /Usu.rio/i }).click();
    await expect(page).toHaveURL(/\/configuracoes\/usuarios$/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('main').getByRole('heading', { name: /Usu.rio/i })).toBeVisible();
  });

  test('navega ate a pagina de administracao e exibe acoes de manutencao', async ({ page }) => {
    await page.getByRole('button', { name: /Configura/i }).click();
    await page.getByRole('link', { name: /Administra/i }).click();
    await expect(page).toHaveURL(/\/configuracoes\/admin$/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Administra/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Limpar Duplicatas/i }).first()).toBeVisible();
  });
});
