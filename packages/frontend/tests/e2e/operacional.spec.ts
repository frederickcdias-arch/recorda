import { test, expect } from '@playwright/test';
import { performLogin } from './support/auth';

test.describe('Fluxo operacional - etapas', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega ate a etapa de Recebimento e exibe sub-abas', async ({ page }) => {
    await page.getByRole('button', { name: /Opera/i }).click();
    await page
      .getByRole('link', { name: /Recebimento/i })
      .first()
      .click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('main').getByRole('heading', { name: /Recebimento/i })).toBeVisible(
      {
        timeout: 10_000,
      }
    );
    await expect(page.getByRole('button', { name: /^Reposit.rios \(\d+\)$/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('exibe lista de repositorios na etapa operacional', async ({ page }) => {
    await page.getByRole('button', { name: /Opera/i }).click();
    await page
      .getByRole('link', { name: /Recebimento/i })
      .first()
      .click();
    await page.waitForLoadState('networkidle');

    await expect(
      page
        .getByRole('table')
        .or(page.getByText(/Nenhum repositorio/i))
        .or(page.getByText(/repositorio/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('botao de novo repositorio esta visivel na etapa de Recebimento', async ({ page }) => {
    await page.getByRole('button', { name: /Opera/i }).click();
    await page
      .getByRole('link', { name: /Recebimento/i })
      .first()
      .click();
    await page.waitForLoadState('networkidle');

    const novoBtn = page
      .getByRole('button', { name: /Novo Repositorio/i })
      .or(page.getByRole('button', { name: /Nova Caixa/i }))
      .or(page.getByRole('button', { name: /Adicionar/i }).first());
    await expect(novoBtn).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Fluxo operacional - avulsos', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega ate aba de avulsos e exibe lista', async ({ page }) => {
    await page.getByRole('button', { name: /Opera/i }).click();
    await page
      .getByRole('link', { name: /Recebimento/i })
      .first()
      .click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /^Avulsos$/i }).click();

    await expect(
      page
        .getByRole('main')
        .getByText(/Nenhum Reposit.rio encontrado|avulso|Adicionar/i)
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Fluxo operacional - controle de qualidade', () => {
  test.beforeEach(async ({ page }) => {
    await performLogin(page);
  });

  test('navega ate Controle de Qualidade e exibe conteudo', async ({ page }) => {
    await page.getByRole('button', { name: /Opera/i }).click();
    await page.getByRole('link', { name: /Controle de Qualidade/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('main').getByRole('heading', { name: /Controle de Qualidade/i })
    ).toBeVisible({ timeout: 10_000 });
  });
});
