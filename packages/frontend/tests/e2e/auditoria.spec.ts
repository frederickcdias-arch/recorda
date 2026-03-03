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

test.describe('Auditoria — Sub-rotas diferenciadas', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega até auditoria de importações', async ({ page }) => {
    const auditoriaSection = page.getByRole('button', { name: /^Auditoria$/i });
    await auditoriaSection.click();
    await page.getByRole('link', { name: /Importações/i }).click();
    await expect(page).toHaveURL(/\/auditoria\/importacoes$/);
    await expect(page.getByRole('heading', { name: /Importações/i })).toBeVisible();
  });

  test('navega até auditoria de OCR', async ({ page }) => {
    const auditoriaSection = page.getByRole('button', { name: /^Auditoria$/i });
    await auditoriaSection.click();
    await page.getByRole('link', { name: /OCR/i }).click();
    await expect(page).toHaveURL(/\/auditoria\/ocr$/);
    await expect(page.getByRole('heading', { name: /OCR/i })).toBeVisible();
  });

  test('navega até auditoria de correções', async ({ page }) => {
    const auditoriaSection = page.getByRole('button', { name: /^Auditoria$/i });
    await auditoriaSection.click();
    await page.getByRole('link', { name: /Correções/i }).click();
    await expect(page).toHaveURL(/\/auditoria\/correcoes$/);
    await expect(page.getByRole('heading', { name: /Correções/i })).toBeVisible();
  });

  test('navega até auditoria de ações', async ({ page }) => {
    const auditoriaSection = page.getByRole('button', { name: /^Auditoria$/i });
    await auditoriaSection.click();
    await page.getByRole('link', { name: /Ações/i }).click();
    await expect(page).toHaveURL(/\/auditoria\/acoes$/);
    await expect(page.getByRole('heading', { name: /Ações/i })).toBeVisible();
  });
});
