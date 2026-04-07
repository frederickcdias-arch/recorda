import { test, expect } from '@playwright/test';
import { performLogin } from './support/auth';
import { installApiMocks } from './support/mockApi';

test.describe('Fluxo de autenticacao e dashboard', () => {
  test('usuario administrador faz login, visualiza dashboard e realiza logout', async ({
    page,
  }) => {
    await performLogin(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByText(/Visão Geral/i)).toBeVisible();
    await expect(page.getByText(/Produção do Mês/i)).toBeVisible();

    await page.getByRole('button', { name: /sair/i }).click();
    await page.waitForURL('**/login');
    await expect(page.getByRole('heading', { name: /Acesse sua conta/i })).toBeVisible();
  });

  test('exibe mensagem de erro para credenciais invalidas', async ({ page }) => {
    await installApiMocks(page);
    await page.goto('/login');

    await page.getByLabel(/E-mail/i).fill('invalido@recorda.local');
    await page.getByLabel(/Senha/i).fill('senha-errada');
    await page.getByRole('button', { name: /Entrar/i }).click();

    await expect(page.getByText(/Credenciais inválidas/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
