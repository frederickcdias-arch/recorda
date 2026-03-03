import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@recorda.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin123';

test.describe('Fluxo de autenticação e dashboard', () => {
  test('usuário administrador faz login, visualiza dashboard e realiza logout', async ({ page }) => {
    await page.goto('/login');
    // Garantir que qualquer sessão anterior seja descartada
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto('/login');

    await page.getByLabel(/E-mail/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/Senha/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /Entrar/i }).click();

    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('Visão Geral')).toBeVisible();
    await expect(page.getByText('Produção Total')).toBeVisible();

    await page.getByRole('button', { name: /sair/i }).click();
    await page.waitForURL('**/login');
    await expect(page.getByRole('heading', { name: /Acesse sua conta/i })).toBeVisible();
  });

  test('exibe mensagem de erro para credenciais inválidas', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/E-mail/i).fill('invalido@recorda.local');
    await page.getByLabel(/Senha/i).fill('senha-errada');
    await page.getByRole('button', { name: /Entrar/i }).click();

    await expect(page.getByText(/Credenciais inválidas/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
