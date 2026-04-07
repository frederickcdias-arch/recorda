import type { Page } from '@playwright/test';
import { installApiMocks } from './mockApi';

export const ADMIN_EMAIL_CANDIDATES = (
  process.env.E2E_ADMIN_EMAIL?.split(',').map((email) => email.trim()).filter(Boolean) ?? [
    'admin@recorda.local',
    'admin@recorda.com',
  ]
).filter((email, index, emails) => emails.indexOf(email) === index);

export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin123';

export async function performLogin(page: Page): Promise<void> {
  await installApiMocks(page);

  for (const email of ADMIN_EMAIL_CANDIDATES) {
    await page.goto('/login');
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto('/login');

    await page.getByLabel(/E-mail/i).fill(email);
    await page.getByLabel(/Senha/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /Entrar/i }).click();

    try {
      await page.waitForURL('**/dashboard', { timeout: 5_000 });
      return;
    } catch {
      // Try the next known admin seed.
    }
  }

  throw new Error(
    `Unable to authenticate with any configured E2E admin user: ${ADMIN_EMAIL_CANDIDATES.join(', ')}`
  );
}
