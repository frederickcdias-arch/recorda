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

test.describe('Relatórios Gerenciais', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega até relatórios gerenciais e exibe filtros de data', async ({ page }) => {
    const relatoriosSection = page.getByRole('button', { name: /^Relatórios$/i });
    await relatoriosSection.click();
    await page.getByRole('link', { name: /Relatórios Gerenciais/i }).click();
    await expect(page).toHaveURL(/\/relatorios\/gerenciais$/);
    await page.waitForLoadState('networkidle');

    await expect(page.getByLabel(/Data Início/i).or(page.getByText(/Data Início/i))).toBeVisible();
    await expect(page.getByLabel(/Data Fim/i).or(page.getByText(/Data Fim/i))).toBeVisible();
  });

  test('exibe botões de exportação PDF e Excel', async ({ page }) => {
    await page.goto('/relatorios/gerenciais');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /PDF/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Excel/i }).first()).toBeVisible();
  });
});

test.describe('Exportações', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega até exportações e exibe lista de relatórios disponíveis', async ({ page }) => {
    const relatoriosSection = page.getByRole('button', { name: /^Relatórios$/i });
    await relatoriosSection.click();
    await page.getByRole('link', { name: /Exportações/i }).click();
    await expect(page).toHaveURL(/\/relatorios\/exportacoes$/);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Exportações/i })).toBeVisible();
    await expect(page.getByText(/Produção/i).first()).toBeVisible();
  });

  test('cada tipo de relatório tem botões PDF e Excel', async ({ page }) => {
    await page.goto('/relatorios/exportacoes');
    await page.waitForLoadState('networkidle');

    const pdfButtons = page.getByRole('button', { name: /PDF/i });
    const excelButtons = page.getByRole('button', { name: /Excel/i });

    expect(await pdfButtons.count()).toBeGreaterThanOrEqual(1);
    expect(await excelButtons.count()).toBeGreaterThanOrEqual(1);
  });
});
