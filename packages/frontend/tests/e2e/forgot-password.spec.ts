import { test, expect } from '@playwright/test';

test.describe('Fluxo de recuperação de senha', () => {
  test('exibe página de esqueci minha senha e aceita e-mail', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('link', { name: /Esqueceu.*senha/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);

    await page.getByLabel(/E-mail/i).fill('usuario@recorda.local');
    await page.getByRole('button', { name: /Enviar/i }).click();

    // Should show success message regardless of whether email exists (security)
    await expect(
      page.getByText(/instruções/i).or(page.getByText(/e-mail/i))
    ).toBeVisible({ timeout: 10_000 });
  });

  test('página de reset de senha exibe formulário com campo de nova senha', async ({ page }) => {
    await page.goto('/reset-password?token=fake-token-for-test');

    await expect(page.getByLabel(/Nova Senha/i).or(page.getByPlaceholder(/senha/i).first())).toBeVisible();
  });

  test('link de voltar ao login funciona', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.getByRole('link', { name: /Voltar.*login/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
