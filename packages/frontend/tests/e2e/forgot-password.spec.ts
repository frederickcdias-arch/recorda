import { test, expect } from '@playwright/test';
import { installApiMocks } from './support/mockApi';

test.describe('Fluxo de recuperacao de senha', () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
  });

  test('exibe pagina de esqueci minha senha com formulario disponivel', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('link', { name: /Recuperar acesso/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);

    await page.getByLabel(/E-mail/i).fill('usuario@recorda.local');
    await expect(page.getByRole('button', { name: /Enviar/i })).toBeEnabled();
  });

  test('pagina de reset de senha exibe formulario com campo de nova senha', async ({ page }) => {
    await page.goto('/reset-password?token=fake-token-for-test');

    await expect(page.getByLabel(/^Nova senha$/i)).toBeVisible();
    await expect(page.getByLabel(/^Confirmar nova senha$/i)).toBeVisible();
  });

  test('link de voltar ao login funciona', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.getByRole('link', { name: /Voltar para o login/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
