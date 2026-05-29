import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PainelEtapaPage } from './PainelEtapaPage';

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
