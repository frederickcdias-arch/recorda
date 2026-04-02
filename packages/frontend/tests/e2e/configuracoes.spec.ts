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

test.describe('Configurações', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega até a página de empresa e exibe formulário', async ({ page }) => {
    const configSection = page.getByRole('button', { name: /Configura/i });
    await configSection.click();
    await page.getByRole('link', { name: /Empresa/i }).click();
    await expect(page).toHaveURL(/\/configuracoes\/empresa$/);
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByLabel(/Nome da Empresa/i).or(page.getByText(/Empresa/i).first())
    ).toBeVisible();
  });

  test('navega até a página de usuários e exibe listagem', async ({ page }) => {
    const configSection = page.getByRole('button', { name: /Configura/i });
    await configSection.click();
    await page.getByRole('link', { name: /Usuários/i }).click();
    await expect(page).toHaveURL(/\/configuracoes\/usuarios$/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Usuários/i })).toBeVisible();
  });

  test('navega até a página de administração e exibe ações de manutenção', async ({ page }) => {
    const configSection = page.getByRole('button', { name: /Configura/i });
    await configSection.click();
    await page.getByRole('link', { name: /Administra/i }).click();
    await expect(page).toHaveURL(/\/configuracoes\/admin$/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Administra/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Limpar Duplicatas/i }).first()).toBeVisible();
  });
});
