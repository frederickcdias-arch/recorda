import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@recorda.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin123';

async function performLogin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/E-mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/Senha/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await page.waitForURL('**/dashboard');
}

test.describe('Navegação principal', () => {
  test('permite acessar Operação/Recebimento e Relatórios Gerenciais', async ({ page }) => {
    await performLogin(page);

    const operacaoSection = page.getByRole('button', { name: /Opera/i });
    await operacaoSection.click();
    await page
      .getByRole('link', { name: /Recebimento/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/operacao\/recebimento$/);
    await expect(
      page.getByRole('main').getByRole('heading', { name: /Recebimento/i })
    ).toBeVisible();

    const relatoriosSection = page.getByRole('button', { name: /Relat/i });
    await relatoriosSection.click();
    await page.getByRole('link', { name: /Relatórios Gerenciais/i }).click();
    await expect(page).toHaveURL(/\/relatorios\/gerenciais$/);
    await expect(
      page
        .getByRole('main')
        .getByText(/Relatórios Gerenciais/i)
        .first()
    ).toBeVisible();
  });
});
