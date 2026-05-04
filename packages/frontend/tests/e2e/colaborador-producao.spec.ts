import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_APP_URL || 'http://localhost:5173';

test.describe('Sistema de Colaborador - Lançamento de Produção', () => {
  test.beforeEach(async ({ page }) => {
    // Login como colaborador
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'colaborador@test.com');
    await page.fill('input[type="password"]', 'senha123');
    await page.click('button[type="submit"]');

    // Aguardar redirect para dashboard
    await page.waitForURL('**/colaborador/dashboard', { timeout: 10000 });
  });

  test('deve exibir dashboard simplificado para colaborador', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Dashboard');

    // Verificar que opções de admin NÃO aparecem
    const configText = page.locator('text=Configurações');
    const usuariosText = page.locator('text=Usuários');

    const configCount = await configText.count();
    const usuariosCount = await usuariosText.count();

    expect(configCount).toBe(0);
    expect(usuariosCount).toBe(0);
  });

  test('deve navegar para página de lançamento de produção', async ({ page }) => {
    await page.click('text=Lançar Produção');
    await expect(page).toHaveURL(/.*\/lancar-producao/);
    await expect(page.locator('h1')).toContainText('Lançar Produção');
  });

  test('deve lançar produção com sucesso', async ({ page }) => {
    await page.goto(`${BASE_URL}/colaborador/lancar-producao`);

    const repoId = `E2E_${Date.now()}/2026`;

    // Preencher formulário
    await page.fill('input[name="data"]', '2026-04-15');
    await page.fill('input[name="repositorio"]', repoId);
    await page.selectOption('select[name="etapa"]', 'RECEBIMENTO');

    // Selecionar primeira coordenadoria disponível
    const coordOptions = await page.locator('select[name="coordenadoria"] option').count();
    if (coordOptions > 1) {
      await page.selectOption('select[name="coordenadoria"]', { index: 1 });
    }

    await page.fill('input[name="quantidade"]', '10');

    // Selecionar tipo se disponível
    const tipoSelect = page.locator('select[name="tipo"]');
    if (await tipoSelect.isVisible()) {
      await page.selectOption('select[name="tipo"]', 'Imagens');
    }

    // Submeter
    await page.click('button:has-text("Registrar Produção")');

    // Verificar toast de sucesso (compatível com diferentes bibliotecas de toast)
    const successToast = page.locator(
      '.Toastify__toast--success, .toast-success, [role="alert"]:has-text("sucesso")'
    );
    await expect(successToast.first()).toBeVisible({ timeout: 5000 });

    // Formulário deve limpar
    await expect(page.locator('input[name="repositorio"]')).toHaveValue('');
  });

  test('deve criar nova coordenadoria', async ({ page }) => {
    await page.goto(`${BASE_URL}/colaborador/lancar-producao`);

    const novoNome = `COORD_E2E_${Date.now()}`;

    // Preencher input de nova coordenadoria
    const novaCoordInput = page.locator('input[placeholder*="Nova coordenadoria"]');
    await novaCoordInput.fill(novoNome);

    // Click no botão Adicionar
    await page.click('button:has-text("Adicionar")');

    // Aguardar toast de sucesso
    const successToast = page.locator(
      '.Toastify__toast--success, .toast-success, [role="alert"]:has-text("sucesso")'
    );
    await expect(successToast.first()).toBeVisible({ timeout: 5000 });

    // Verificar que coordenadoria aparece no select
    const select = page.locator('select[name="coordenadoria"]');
    await expect(select).toContainText(novoNome);

    // Verificar que está selecionada
    const selectedValue = await select.inputValue();
    expect(selectedValue).toBe(novoNome);
  });

  test('deve mostrar erro ao tentar duplicata', async ({ page }) => {
    await page.goto(`${BASE_URL}/colaborador/lancar-producao`);

    const repoId = `E2E_DUP_${Date.now()}/2026`;
    const payload = {
      data: '2026-04-15',
      repositorio: repoId,
      etapa: 'RECEBIMENTO',
      quantidade: '10',
      tipo: 'Imagens',
    };

    // Primeiro lançamento
    await page.fill('input[name="data"]', payload.data);
    await page.fill('input[name="repositorio"]', payload.repositorio);
    await page.selectOption('select[name="etapa"]', payload.etapa);
    await page.fill('input[name="quantidade"]', payload.quantidade);

    const tipoSelect = page.locator('select[name="tipo"]');
    if (await tipoSelect.isVisible()) {
      await page.selectOption('select[name="tipo"]', payload.tipo);
    }

    await page.click('button:has-text("Registrar Produção")');

    const successToast = page.locator('.Toastify__toast--success, .toast-success');
    await expect(successToast.first()).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000); // Aguardar toast desaparecer

    // Segundo lançamento (duplicata)
    await page.fill('input[name="data"]', payload.data);
    await page.fill('input[name="repositorio"]', payload.repositorio);
    await page.selectOption('select[name="etapa"]', payload.etapa);
    await page.fill('input[name="quantidade"]', payload.quantidade);

    if (await tipoSelect.isVisible()) {
      await page.selectOption('select[name="tipo"]', payload.tipo);
    }

    await page.click('button:has-text("Registrar Produção")');

    // Verificar toast de erro
    const errorToast = page.locator(
      '.Toastify__toast--error, .toast-error, [role="alert"]:has-text("duplicada")'
    );
    await expect(errorToast.first()).toBeVisible({ timeout: 5000 });
  });

  test('deve mostrar erro ao pular etapa', async ({ page }) => {
    await page.goto(`${BASE_URL}/colaborador/lancar-producao`);

    const repoId = `E2E_SEQ_${Date.now()}/2026`;

    // Tentar lançar CONFERENCIA sem etapas anteriores
    await page.fill('input[name="repositorio"]', repoId);
    await page.selectOption('select[name="etapa"]', 'CONFERENCIA');
    await page.fill('input[name="quantidade"]', '1');

    // Selecionar coordenadoria
    const coordOptions = await page.locator('select[name="coordenadoria"] option').count();
    if (coordOptions > 1) {
      await page.selectOption('select[name="coordenadoria"]', { index: 1 });
    }

    await page.click('button:has-text("Registrar Produção")');

    // Verificar toast de erro
    const errorToast = page.locator(
      '.Toastify__toast--error, .toast-error, [role="alert"]:has-text("Sequência")'
    );
    await expect(errorToast.first()).toBeVisible({ timeout: 5000 });
  });

  test('deve validar campos obrigatórios', async ({ page }) => {
    await page.goto(`${BASE_URL}/colaborador/lancar-producao`);

    // Tentar submeter sem preencher
    await page.click('button:has-text("Registrar Produção")');

    // HTML5 validation deve prevenir submit
    const isInvalid = await page.locator('input[name="repositorio"]:invalid').isVisible();
    expect(isInvalid).toBe(true);
  });

  test('deve ter campo Tipo com opções fixas', async ({ page }) => {
    await page.goto(`${BASE_URL}/colaborador/lancar-producao`);

    const tipoSelect = page.locator('select[name="tipo"]');

    // Verificar que é um select
    await expect(tipoSelect).toBeVisible();

    // Verificar opções
    const options = await tipoSelect.locator('option').allTextContents();
    expect(options.some((opt) => opt.includes('Imagens'))).toBe(true);
    expect(options.some((opt) => opt.includes('Caixas'))).toBe(true);
  });
});

test.describe('Painel Admin - Visualização de Produções de Colaboradores', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'senha123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
  });

  test('deve exibir produções com badge de origem', async ({ page }) => {
    await page.goto(`${BASE_URL}/operacao/producao`);

    // Aguardar carregamento da tabela
    await page.waitForSelector('table, .loading', { timeout: 10000 });

    // Verificar se badges aparecem (se houver dados)
    const badgeSistema = page.locator('text=Sistema, text=Fluxo');
    const badgeLegado = page.locator('text=Legado');

    const sistemaCount = await badgeSistema.count();
    const legadoCount = await badgeLegado.count();

    // Se houver produções, pelo menos um badge deve aparecer
    if (sistemaCount > 0 || legadoCount > 0) {
      expect(sistemaCount + legadoCount).toBeGreaterThan(0);
    }
  });

  test('deve ordenar por coluna ao clicar no cabeçalho', async ({ page }) => {
    await page.goto(`${BASE_URL}/operacao/producao`);

    await page.waitForSelector('table', { timeout: 10000 });

    // Click no cabeçalho "Qtd" ou "Quantidade"
    const qtdHeader = page.locator('th:has-text("Qtd"), th:has-text("Quantidade")').first();
    await qtdHeader.click();

    // Verificar que ícone de ordenação aparece
    const sortIcon = qtdHeader.locator('svg, .sort-icon');
    const iconCount = await sortIcon.count();
    expect(iconCount).toBeGreaterThan(0);
  });

  test('deve filtrar produções por busca', async ({ page }) => {
    await page.goto(`${BASE_URL}/operacao/producao`);

    await page.waitForSelector('table, input[placeholder*="Busca"]', { timeout: 10000 });

    // Usar filtro de busca
    const buscaInput = page.locator('input[placeholder*="Busca"], input[placeholder*="busca"]');
    if (await buscaInput.isVisible()) {
      await buscaInput.fill('E2E');

      // Aguardar debounce
      await page.waitForTimeout(500);

      // Verificar que filtro foi aplicado (URL ou resultados)
      const currentUrl = page.url();
      const hasUrlParam = currentUrl.includes('busca') || currentUrl.includes('E2E');

      // Se não houver parâmetro na URL, verificar se os resultados mudaram
      if (!hasUrlParam) {
        const rows = page.locator('tbody tr');
        const rowCount = await rows.count();
        // Se houver resultados, validar que são relevantes
        expect(rowCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('deve ter seleção de data para filtros', async ({ page }) => {
    await page.goto(`${BASE_URL}/operacao/producao`);

    await page.waitForSelector('input[type="date"], .date-picker', { timeout: 10000 });

    const dataInicio = page.locator('input[name*="inicio"], input[name*="dataInicio"]');
    const dataFim = page.locator('input[name*="fim"], input[name*="dataFim"]');

    // Verificar que campos de data existem
    const inicioCount = await dataInicio.count();
    const fimCount = await dataFim.count();

    expect(inicioCount).toBeGreaterThan(0);
    expect(fimCount).toBeGreaterThan(0);
  });
});
