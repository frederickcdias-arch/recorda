import { test, expect } from '@playwright/test';
import { performLogin } from './support/auth';

test.describe('Navegacao principal', () => {
  test('permite acessar Operacao/Recebimento e Relatorios Gerenciais', async ({ page }) => {
    await performLogin(page);

    await page.getByRole('button', { name: /Opera/i }).click();
    await page.getByRole('link', { name: /Recebimento/i }).first().click();
    await expect(page).toHaveURL(/\/operacao\/recebimento$/);
    await expect(page.getByText(/Recebimento/i).first()).toBeVisible();

    await page.getByRole('button', { name: /Relat.rio/i }).click();
    await page.getByRole('link', { name: /Relat.rios Gerenciais/i }).click();
    await expect(page).toHaveURL(/\/relatorios\/gerenciais$/);
    await expect(page.getByText(/Relat.rios Gerenciais/i).first()).toBeVisible();
  });
});
