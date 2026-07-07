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
    await expect(page.getByRole('combobox', { name: /Trocar perfil/i })).toBeVisible();

    await page.getByRole('button', { name: 'Sair do sistema' }).click();
    await page.waitForURL('**/login');
    await expect(page.getByRole('heading', { name: /Acesso restrito/i })).toBeVisible();
  });

  test('permite alternar entre perfis e preservar o perfil ativo', async ({ page }) => {
    await performLogin(page);

    const seletorPerfil = page.getByLabel(/Trocar perfil/i);
    await expect(seletorPerfil).toBeVisible();
    await expect(seletorPerfil).toHaveValue('administrador');

    await seletorPerfil.selectOption('colaborador');
    await expect(seletorPerfil).toHaveValue('colaborador');
  });

  test('exibe mensagem de erro para credenciais invalidas', async ({ page }) => {
    await installApiMocks(page);
    await page.goto('/login');

    await page.getByRole('textbox', { name: /E-mail/i }).fill('invalido@recorda.local');
    await page.getByRole('textbox', { name: /Senha/i }).fill('senha-errada');
    await page.getByRole('button', { name: /Entrar/i }).click();

    await expect(page.getByText(/Credenciais inválidas/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
