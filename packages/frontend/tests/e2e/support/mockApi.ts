import type { Page, Route } from '@playwright/test';

const adminUser = {
  id: 'admin-1',
  nome: 'Administrador',
  email: 'admin@recorda.local',
  perfil: 'administrador',
  perfilAtivo: 'administrador',
  perfis: ['administrador', 'colaborador'],
  coordenadoriaId: undefined,
};

let activeProfile: 'administrador' | 'colaborador' = 'administrador';

function getCurrentUser() {
  return {
    ...adminUser,
    perfilAtivo: activeProfile,
    perfil: activeProfile,
  };
}

const dashboardData = {
  stats: {
    producaoTotal: 12,
    producaoTrend: '8%',
    processosAtivos: 4,
    processosNovosHoje: 1,
    colaboradoresAtivos: 2,
  },
  producaoPorEtapa: [
    { etapa: 'RECEBIMENTO', valor: 4 },
    { etapa: 'CONTROLE_QUALIDADE', valor: 8 },
  ],
  statusRecebimento: [
    { status: 'Importados hoje', valor: 1, icon: 'inbox' },
    { status: 'Registros no mes', valor: 12, icon: 'bar-chart' },
    { status: 'Importacoes com erro (24h)', valor: 0, icon: 'alert-circle' },
  ],
  alertas: [],
  backlogPorEtapa: [],
  tempoMedioPorEtapa: [],
  retrabalhoCQ: [],
};

const repositorio = {
  id_repositorio_recorda: 'repo-1',
  id_repositorio_ged: 'GED-001',
  orgao: 'CINF',
  projeto: 'Projeto Alpha',
  status_atual: 'RECEBIDO',
  etapa_atual: 'RECEBIMENTO',
  data_criacao: '2026-04-01T10:00:00.000Z',
  total_processos: 1,
  checklist_concluido: false,
  checklist_aberto: false,
  producao_registrada: false,
  total_relatorios: 0,
  segundos_na_etapa: 3600,
};

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function isAdminLogin(email: string, senha: string): boolean {
  return (
    senha === (process.env.E2E_ADMIN_PASSWORD ?? 'admin123') &&
    ['admin@recorda.local', 'admin@recorda.com'].includes(email.toLowerCase())
  );
}

export async function installApiMocks(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (!['xhr', 'fetch'].includes(request.resourceType())) {
      return route.continue();
    }
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method().toUpperCase();
    const bodyText = request.postData() ?? '{}';
    const body = bodyText ? JSON.parse(bodyText) : {};

    if (path === '/auth/login' && method === 'POST') {
      if (isAdminLogin(String(body.email ?? ''), String(body.senha ?? ''))) {
        activeProfile = 'administrador';
        return json(route, 200, {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          usuario: getCurrentUser(),
        });
      }

      return json(route, 401, { error: 'Credenciais inválidas' });
    }

    if (path === '/auth/switch-profile' && method === 'POST') {
      const requested = String(body.perfilAtivo ?? '');
      if (requested !== 'administrador' && requested !== 'colaborador') {
        return json(route, 400, { error: 'Perfil ativo invÃ¡lido' });
      }

      activeProfile = requested;
      return json(route, 200, {
        accessToken: 'mock-access-token-switched',
        refreshToken: 'mock-refresh-token-switched',
        usuario: getCurrentUser(),
      });
    }

    if (path === '/auth/logout' && method === 'POST') {
      return json(route, 200, { ok: true });
    }

    if (path === '/auth/forgot-password' && method === 'POST') {
      return json(route, 200, {
        message: 'As instrucoes para redefinicao de senha foram enviadas para o e-mail informado.',
        resetToken: 'mock-reset-token',
      });
    }

    if (path === '/auth/reset-password' && method === 'POST') {
      return json(route, 200, {
        message: 'Senha redefinida com sucesso.',
      });
    }

    if (path === '/auth/me' && method === 'GET') {
      return json(route, 200, getCurrentUser());
    }

    if (path === '/auth/usuarios' && method === 'GET') {
      return json(route, 200, {
        usuarios: [
          {
            id: adminUser.id,
            email: adminUser.email,
            nome: adminUser.nome,
            papel: 'ADMIN',
            ativo: true,
            criado_em: '2026-04-01T10:00:00.000Z',
          },
        ],
      });
    }

    if (
      path.startsWith('/auth/usuarios/') &&
      path.endsWith('/toggle-ativo') &&
      method === 'PATCH'
    ) {
      return json(route, 200, { ok: true });
    }

    if (path === '/dashboard' && method === 'GET') {
      return json(route, 200, dashboardData);
    }

    if (path === '/coordenadorias' && method === 'GET') {
      return json(route, 200, [{ id: 'coord-1', nome: 'Coordenadoria Central', sigla: 'CC' }]);
    }

    if (path === '/configuracao/projetos' && method === 'GET') {
      return json(route, 200, {
        projetos: [{ id: 'proj-1', nome: 'Projeto Alpha', ativo: true }],
      });
    }

    if (path === '/configuracao/projetos' && method === 'POST') {
      return json(route, 201, { id: 'proj-2', nome: body.nome ?? 'Projeto Novo', ativo: true });
    }

    if (path === '/configuracao/empresa' && method === 'GET') {
      return json(route, 200, {
        nome: 'Recorda',
        cnpj: '00.000.000/0001-00',
        endereco: 'Rua Exemplo, 100',
        telefone: '(65) 0000-0000',
        email: 'contato@recorda.local',
        logoUrl: '',
        exibirLogoRelatorio: true,
        exibirEnderecoRelatorio: true,
        exibirContatoRelatorio: true,
        logoLarguraRelatorio: 120,
        logoAlinhamentoRelatorio: 'CENTRO',
        logoDeslocamentoYRelatorio: 0,
      });
    }

    if (path === '/configuracao/empresa' && method === 'PUT') {
      return json(route, 200, { ok: true });
    }

    if (path === '/configuracao/empresa/logo' && method === 'DELETE') {
      return json(route, 200, { ok: true });
    }

    if (path === '/auditoria/estatisticas' && method === 'GET') {
      return json(route, 200, { total: 1 });
    }

    if (path === '/auditoria' && method === 'GET') {
      return json(route, 200, {
        logs: [
          {
            id: 'log-1',
            tabela: 'usuarios',
            operacao: 'INSERT',
            registro_id: 'admin-1',
            criado_em: '2026-04-01T10:00:00.000Z',
          },
        ],
        totalPaginas: 1,
      });
    }

    if (path === '/operacional/orgaos-recebimento' && method === 'GET') {
      return json(route, 200, { itens: [{ id: 'org-1', nome: 'CINF' }] });
    }

    if (path === '/operacional/setores-recebimento' && method === 'GET') {
      return json(route, 200, { itens: [{ id: 'set-1', nome: 'Recebimento' }] });
    }

    if (path === '/operacional/classificacoes-recebimento' && method === 'GET') {
      return json(route, 200, { itens: [{ id: 'class-1', nome: 'Classificacao A' }] });
    }

    if (path === '/operacional/repositorios' && method === 'GET') {
      return json(route, 200, {
        itens: [repositorio],
        total: 1,
        pagina: 1,
        totalPaginas: 1,
      });
    }

    if (path === '/operacional/recebimento-avulsos' && method === 'GET') {
      return json(route, 200, {
        processos: [],
        totalPaginas: 1,
      });
    }

    if (
      /^\/operacional\/repositorios\/[^/]+\/recebimento-processos$/.test(path) &&
      method === 'GET'
    ) {
      return json(route, 200, {
        processos: [],
      });
    }

    if (/^\/operacional\/repositorios\/[^/]+\/cq-avaliacoes$/.test(path) && method === 'GET') {
      return json(route, 200, {
        itens: [],
        resumo: { total: 0, aprovados: 0, reprovados: 0, pendentes: 0 },
      });
    }

    if (path === '/operacional/fontes-importacao' && method === 'GET') {
      return json(route, 200, {
        fontes: [{ id: 'fonte-1', nome: 'Fonte Principal', url: 'https://example.test/planilha' }],
      });
    }

    if (/^\/operacional\/fontes-importacao\/[^/]+\/validar-duplicatas$/.test(path)) {
      return json(route, 200, {
        fonte: { id: 'fonte-1', nome: 'Fonte Principal' },
        total: 1,
        novos: { quantidade: 1, itens: [] },
        duplicados: { quantidade: 0, itens: [] },
      });
    }

    if (/^\/operacional\/fontes-importacao\/[^/]+\/importar$/.test(path)) {
      return json(route, 200, {
        fonte: 'Fonte Principal',
        importados: 1,
        duplicados: 0,
        erros: 0,
      });
    }

    if (path === '/operacional/importacoes-legado' && method === 'GET') {
      return json(route, 200, { itens: [] });
    }

    if (path === '/operacional/producao' && method === 'GET') {
      return json(route, 200, {
        registros: [],
        total: 0,
        pagina: 1,
        limite: 25,
        totalPaginas: 1,
        filtros: { colaboradores: [], etapas: [] },
      });
    }

    if (path === '/operacional/conhecimento/documentos' && method === 'GET') {
      return json(route, 200, {
        itens: [
          {
            id: 'kb-1',
            codigo: 'KB-001',
            titulo: 'Manual de Recebimento',
            categoria: 'MANUAIS',
            descricao: 'Documento de exemplo',
            status: 'ATIVO',
            nivel_acesso: 'OPERADOR_ADMIN',
            versao_atual: 1,
            etapas: ['RECEBIMENTO'],
          },
        ],
      });
    }

    if (/^\/operacional\/conhecimento\/documentos\/[^/]+$/.test(path) && method === 'GET') {
      return json(route, 200, {
        documento: {
          id: 'kb-1',
          codigo: 'KB-001',
          titulo: 'Manual de Recebimento',
          categoria: 'MANUAIS',
          descricao: 'Documento de exemplo',
          status: 'ATIVO',
          nivel_acesso: 'OPERADOR_ADMIN',
          versao_atual: 1,
          etapas: ['RECEBIMENTO'],
          versao_atual_id: 'kbv-1',
        },
        etapas: ['RECEBIMENTO'],
        versaoAtual: {
          id: 'kbv-1',
          versao: 1,
          conteudo: '# Conteudo',
          resumo_alteracao: 'Versao inicial',
          publicado_em: '2026-04-01T10:00:00.000Z',
          publicado_por_nome: 'Administrador',
        },
        versoes: [],
      });
    }

    if (path === '/operacional/conhecimento/glossario' && method === 'GET') {
      return json(route, 200, { itens: [] });
    }

    if (path === '/operacional/conhecimento/leis-normas' && method === 'GET') {
      return json(route, 200, { itens: [] });
    }

    if (path === '/relatorios' && method === 'GET') {
      return json(route, 200, {
        titulo: 'Relatorio Gerencial',
        resumoPorEtapa: [],
        producaoPorCoordenadoria: [],
        totais: {
          totalGeral: 12,
          totalCaixas: 0,
          totalImagens: 0,
          totalColaboradores: 2,
          totalCoordenadorias: 1,
          totalEtapas: 2,
        },
      });
    }

    if (path === '/relatorios/operacional' && method === 'GET') {
      return json(route, 200, { registros: [] });
    }

    if (path.startsWith('/admin/') && method === 'POST') {
      return json(route, 200, { removidos: 0, total: 0 });
    }

    return json(route, 200, {});
  });
}
