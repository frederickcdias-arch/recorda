import { test, expect } from '@playwright/test';
import { performLogin } from './support/auth';

test.describe('Auditoria - sub-rotas diferenciadas', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega ate auditoria de importacoes', async ({ page }) => {
    await page.getByRole('button', { name: /^Auditoria$/i }).click();
    await page.getByRole('link', { name: /Importa..es/i }).click();
    await expect(page).toHaveURL(/\/auditoria\/importacoes$/);
    await expect(page.getByText(/Auditoria de Importa..es/i).first()).toBeVisible();
  });

  test('navega ate auditoria de OCR', async ({ page }) => {
    await page.getByRole('button', { name: /^Auditoria$/i }).click();
    await page.getByRole('link', { name: /OCR/i }).click();
    await expect(page).toHaveURL(/\/auditoria\/ocr$/);
    await expect(page.getByText(/Auditoria de OCR/i).first()).toBeVisible();
  });

  test('navega ate auditoria de correcoes', async ({ page }) => {
    await page.getByRole('button', { name: /^Auditoria$/i }).click();
    await page.getByRole('link', { name: /Corre..es/i }).click();
    await expect(page).toHaveURL(/\/auditoria\/correcoes$/);
    await expect(page.getByText(/Auditoria de Corre..es/i).first()).toBeVisible();
  });

  test('navega ate auditoria de acoes', async ({ page }) => {
    await page.getByRole('button', { name: /^Auditoria$/i }).click();
    await page.getByRole('link', { name: /A..es de Usu.rios/i }).click();
    await expect(page).toHaveURL(/\/auditoria\/acoes$/);
    await expect(page.getByText(/A..es de Usu.rios/i).first()).toBeVisible();
  });
});
