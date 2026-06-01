import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

import { PainelEtapaPage } from './PainelEtapaPage';
import type { PainelDivergencia } from '../../hooks/useQueries';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../hooks/useQueries', () => ({
  usePainelEtapa: vi.fn(() => ({
    data: { data: [], meta: { page: 1, limit: 20, total: 0 } },
    isLoading: false,
    isError: false,
  })),
}));

// OperacaoEtapasNav uses NavLink — stub it out to avoid complex router/menu setup
vi.mock('./EtapaOperacionalPage', () => ({
  OperacaoEtapasNav: () => <nav data-testid="operacao-etapas-nav" />,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderAt(pathname: string): void {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[pathname]}>
        <Routes>
          {/* Static painel routes — mirrors routes/index.tsx */}
          <Route path="/operacao/preparacao" element={<PainelEtapaPage />} />
          <Route path="/operacao/digitalizacao" element={<PainelEtapaPage />} />
          <Route path="/operacao/conferencia" element={<PainelEtapaPage />} />
          <Route path="/operacao/reconferencia" element={<PainelEtapaPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PainelEtapaPage — roteamento por pathname', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('/operacao/preparacao renderiza Painel de Preparação', () => {
    renderAt('/operacao/preparacao');
    expect(screen.getByText('Painel de Preparação')).toBeInTheDocument();
    expect(screen.queryByText('Etapa não encontrada.')).not.toBeInTheDocument();
  });

  it('/operacao/digitalizacao renderiza Painel de Digitalização', () => {
    renderAt('/operacao/digitalizacao');
    expect(screen.getByText('Painel de Digitalização')).toBeInTheDocument();
    expect(screen.queryByText('Etapa não encontrada.')).not.toBeInTheDocument();
  });

  it('/operacao/conferencia renderiza Painel de Conferência', () => {
    renderAt('/operacao/conferencia');
    expect(screen.getByText('Painel de Conferência')).toBeInTheDocument();
    expect(screen.queryByText('Etapa não encontrada.')).not.toBeInTheDocument();
  });

  it('/operacao/reconferencia renderiza Painel de Reconferência', () => {
    renderAt('/operacao/reconferencia');
    expect(screen.getByText('Painel de Reconferência')).toBeInTheDocument();
    expect(screen.queryByText('Etapa não encontrada.')).not.toBeInTheDocument();
  });

  it('slug inválido exibe "Etapa não encontrada."', () => {
    render(
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={['/operacao/invalido']}>
          <Routes>
            <Route path="/operacao/invalido" element={<PainelEtapaPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText('Etapa não encontrada.')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 Alertas de inconsistência operacional (A3) — testes de UI
// ─────────────────────────────────────────────────────────────────────────────

import * as useQueriesModule from '../../hooks/useQueries';

function makeItemWithDivergencias(divergencias: PainelDivergencia[]) {
  return {
    data: {
      data: [
        {
          producaoId: 1,
          repositorioId: 'R1',
          repositorioCodigo: '000001/2026',
          entidade: 'ORGAO',
          etapa: 'PREPARACAO',
          statusEtapa: 'DIVERGENTE',
          responsavelId: 1,
          responsavelNome: 'Test User',
          dataExecucao: '2026-01-01',
          quantidade: 0,
          unidade: 'REPOSITORIO',
          origem: 'LANCADA',
          etapaAtualRepositorio: 'PREPARACAO',
          statusAtualRepositorio: 'EM_PREPARACAO',
          temDivergencia: true,
          maiorSeveridade:
            divergencias.length > 0
              ? ((['alta', 'media', 'baixa'] as const).find((s) =>
                  divergencias.some((d) => d.severidade === s)
                ) ?? null)
              : null,
          divergencias,
          producaoRelacionada: [],
        },
      ],
      meta: { page: 1, limit: 20, total: 1 },
    },
    isLoading: false,
    isError: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('PainelEtapaPage — alertas de inconsistência (A3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── A3-UI-1. Badge "Atenção" aparece quando há divergência ────────
  it('exibe badge "Atenção" quando o item tem divergências', () => {
    vi.spyOn(useQueriesModule, 'usePainelEtapa').mockReturnValue(
      makeItemWithDivergencias([
        { tipo: 'ETAPA_PULADA', severidade: 'alta', mensagem: 'Etapa pulada detectada.' },
      ])
    );

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/operacao/preparacao']}>
          <Routes>
            <Route path="/operacao/preparacao" element={<PainelEtapaPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('Atenção')).toBeInTheDocument();
  });

  // ── A3-UI-2. Tipo principal é exibido em forma legível ────────────
  it('exibe rótulo legível do tipo principal da divergência', () => {
    vi.spyOn(useQueriesModule, 'usePainelEtapa').mockReturnValue(
      makeItemWithDivergencias([
        { tipo: 'ETAPA_PULADA', severidade: 'alta', mensagem: 'Etapa pulada detectada.' },
      ])
    );

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/operacao/preparacao']}>
          <Routes>
            <Route path="/operacao/preparacao" element={<PainelEtapaPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText(/Etapa pulada/i)).toBeInTheDocument();
  });

  // ── A3-UI-3. Contador "+N alertas" para múltiplas divergências ───
  it('exibe contador "+2 alertas" quando há 3 divergências', () => {
    vi.spyOn(useQueriesModule, 'usePainelEtapa').mockReturnValue(
      makeItemWithDivergencias([
        { tipo: 'ETAPA_PULADA', severidade: 'alta', mensagem: 'Msg 1' },
        { tipo: 'STATUS_ATRASADO', severidade: 'media', mensagem: 'Msg 2' },
        { tipo: 'RESPONSAVEL_AUSENTE', severidade: 'media', mensagem: 'Msg 3' },
      ])
    );

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/operacao/preparacao']}>
          <Routes>
            <Route path="/operacao/preparacao" element={<PainelEtapaPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText(/\+2/)).toBeInTheDocument();
  });

  // ── A3-UI-4. Filtro "Com alertas" envia statusEtapa=DIVERGENTE ───
  it('selecionar "Com alertas" chama usePainelEtapa com statusEtapa DIVERGENTE', async () => {
    const mockFn = vi.spyOn(useQueriesModule, 'usePainelEtapa').mockReturnValue({
      data: { data: [], meta: { page: 1, limit: 20, total: 0 } },
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const user = userEvent.setup();

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/operacao/preparacao']}>
          <Routes>
            <Route path="/operacao/preparacao" element={<PainelEtapaPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const select = screen.getByRole('combobox', { name: /Status da etapa/i });
    await user.selectOptions(select, 'Com alertas');

    // After selecting, the hook must have been called with statusEtapa='DIVERGENTE'
    const calls = mockFn.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ statusEtapa: 'DIVERGENTE' });
  });

  // ── A3-UI-5. Sem botão de ação de correção manual ─────────────────
  it('não exibe botão de correção, exclusão ou aprovação manual', () => {
    vi.spyOn(useQueriesModule, 'usePainelEtapa').mockReturnValue(
      makeItemWithDivergencias([
        { tipo: 'ETAPA_PULADA', severidade: 'alta', mensagem: 'Etapa pulada detectada.' },
      ])
    );

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/operacao/preparacao']}>
          <Routes>
            <Route path="/operacao/preparacao" element={<PainelEtapaPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.queryByRole('button', { name: /corrigir/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aprovar/i })).not.toBeInTheDocument();
  });
});
