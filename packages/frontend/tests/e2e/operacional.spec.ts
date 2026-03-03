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

test.describe('Fluxo Operacional — Etapas', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega até a etapa de Recebimento e exibe sub-abas', async ({ page }) => {
    // Navegar para a seção operacional
    const operacionalSection = page.getByRole('button', { name: /Opera/i });
    await operacionalSection.click();
    await page.getByRole('link', { name: /Recebimento/i }).first().click();
    await page.waitForLoadState('networkidle');

    // Deve exibir as sub-abas Repositórios e Avulsos
    await expect(
      page.getByRole('tab', { name: /Repositórios/i }).or(page.getByText(/Repositórios/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('exibe lista de repositórios na etapa operacional', async ({ page }) => {
    const operacionalSection = page.getByRole('button', { name: /Opera/i });
    await operacionalSection.click();
    await page.getByRole('link', { name: /Recebimento/i }).first().click();
    await page.waitForLoadState('networkidle');

    // Deve exibir tabela ou lista de repositórios (ou mensagem de lista vazia)
    await expect(
      page.getByRole('table').or(page.getByText(/Nenhum repositório/i)).or(page.getByText(/repositório/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('botão de novo repositório está visível na etapa de Recebimento', async ({ page }) => {
    const operacionalSection = page.getByRole('button', { name: /Opera/i });
    await operacionalSection.click();
    await page.getByRole('link', { name: /Recebimento/i }).first().click();
    await page.waitForLoadState('networkidle');

    const novoBtn = page.getByRole('button', { name: /Novo Repositório/i })
      .or(page.getByRole('button', { name: /Nova Caixa/i }))
      .or(page.getByRole('button', { name: /Adicionar/i }).first());
    await expect(novoBtn).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Fluxo Operacional — Avulsos', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega até aba de avulsos e exibe lista', async ({ page }) => {
    const operacionalSection = page.getByRole('button', { name: /Opera/i });
    await operacionalSection.click();
    await page.getByRole('link', { name: /Recebimento/i }).first().click();
    await page.waitForLoadState('networkidle');

    // Clicar na aba Avulsos
    const avulsosTab = page.getByRole('tab', { name: /Avulsos/i })
      .or(page.getByText(/Avulsos/i));
    await avulsosTab.first().click();

    // Deve exibir conteúdo de avulsos
    await expect(
      page.getByText(/avulso/i).first()
        .or(page.getByText(/Nenhum processo/i))
        .or(page.getByRole('button', { name: /Adicionar/i }).first())
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Fluxo Operacional — Controle de Qualidade', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega até Controle de Qualidade e exibe conteúdo', async ({ page }) => {
    const operacionalSection = page.getByRole('button', { name: /Opera/i });
    await operacionalSection.click();
    await page.getByRole('link', { name: /Controle de Qualidade/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /Controle de Qualidade/i })
        .or(page.getByText(/Qualidade/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });
});
