import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ControleQualidadePanel } from './ControleQualidadePanel';
import type { CQSugestaoItem } from '../../hooks/useQueries';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseCQSugestoes = vi.fn();
const mockUseRepositoriosControleQualidade = vi.fn();
const mockApiPost = vi.fn();

// Stable reference for queryClient mock — avoids infinite render loop caused
// by useCallback([queryClient]) receiving a new object reference every render.
const { stableQueryClient } = vi.hoisted(() => ({
  stableQueryClient: {
    fetchQuery: vi.fn().mockResolvedValue({
      itens: [],
      resumo: { total: 0, aprovados: 0, reprovados: 0, pendentes: 0 },
    }),
    invalidateQueries: vi.fn(),
  },
}));

vi.mock('../../hooks/useQueries', () => ({
  useCQSugestoes: (...args: unknown[]) => mockUseCQSugestoes(...args),
  useRepositoriosControleQualidade: () => mockUseRepositoriosControleQualidade(),
  useAvaliarDocumentoCQ: () => ({ mutateAsync: vi.fn() }),
  useAprovarTodosCQ: () => ({ mutateAsync: vi.fn() }),
  useConcluirCQ: () => ({ mutateAsync: vi.fn() }),
  useDevolverCQ: () => ({ mutateAsync: vi.fn() }),
  useGerarTermoCorrecao: () => ({ mutateAsync: vi.fn() }),
  useGerarTermoDevolucao: () => ({ mutateAsync: vi.fn() }),
  useGerarTermoDevolucaoMulti: () => ({ mutateAsync: vi.fn() }),
  useQueryClient: () => stableQueryClient,
  queryKeys: {
    cqAvaliacoes: (id: string) => ['cq-avaliacoes', id],
    repositoriosAll: ['repositorios'],
  },
}));

vi.mock('../../services/api', () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args), get: vi.fn(), download: vi.fn() },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeSugestao(overrides: Partial<CQSugestaoItem> = {}): CQSugestaoItem {
  return {
    repositorioId: 'repo-a',
    repositorioCodigo: '000001/2026',
    entidade: 'SGPA',
    origem: 'LANCADA',
    etapaAtualCalculada: 'CONTROLE_QUALIDADE',
    statusAtual: 'AGUARDANDO_CQ_LOTE',
    prontoParaCQ: true,
    motivos: [
      'Reconferência concluída',
      'Todas as etapas operacionais registradas',
      'Sem divergências bloqueantes',
    ],
    divergencias: [],
    ultimaEtapaConcluida: {
      etapa: 'RECONFERENCIA',
      responsavelNome: 'Maria Souza',
      data: '2026-05-29',
    },
    ...overrides,
  };
}

const emptyQueryResult = {
  data: undefined,
  isLoading: false,
  isError: false,
};

const emptyReposCQ = { data: [], isLoading: false };

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

interface RenderOptions {
  sugestoes?: CQSugestaoItem[];
  loading?: boolean;
}

function renderPanel({ sugestoes = [], loading = false }: RenderOptions = {}): void {
  mockUseRepositoriosControleQualidade.mockReturnValue(emptyReposCQ);

  const prontos = sugestoes.filter((s) => s.prontoParaCQ).length;
  const comAlertas = sugestoes.filter((s) => !s.prontoParaCQ).length;

  if (loading) {
    mockUseCQSugestoes.mockReturnValue({ ...emptyQueryResult, isLoading: true });
  } else {
    mockUseCQSugestoes.mockReturnValue({
      data: {
        data: sugestoes,
        meta: { page: 1, limit: 50, total: sugestoes.length },
        resumo: { prontos, comAlertas },
      },
      isLoading: false,
      isError: false,
    });
  }

  render(
    <QueryClientProvider client={makeQueryClient()}>
      <ControleQualidadePanel
        repositoriosDisponiveis={[]}
        onSuccess={vi.fn()}
        onError={vi.fn()}
        setBusy={vi.fn()}
      />
    </QueryClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ControleQualidadePanel — Sugestões para CQ (A4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiPost.mockResolvedValue({});
  });

  // ── 1. Seção "Sugestões para CQ" é renderizada ────────────────────────────
  it('renderiza a seção "Sugestões para CQ"', () => {
    renderPanel();
    expect(screen.getByText('Sugestões para CQ')).toBeInTheDocument();
    expect(screen.getByText(/Sugestões com base na produção registrada/i)).toBeInTheDocument();
  });

  // ── 2. Estado vazio quando sem sugestões ─────────────────────────────────
  it('exibe estado vazio quando não há sugestões', () => {
    renderPanel({ sugestoes: [] });
    expect(
      screen.getByText(/Nenhum repositório pronto para Controle de Qualidade/i)
    ).toBeInTheDocument();
  });

  // ── 3. Repositório pronto aparece com badge "Pronto" ─────────────────────
  it('exibe repositório pronto com badge "Pronto" e código correto', () => {
    renderPanel({ sugestoes: [makeSugestao()] });
    expect(screen.getByText('000001/2026')).toBeInTheDocument();
    expect(screen.getByText('Pronto')).toBeInTheDocument();
    expect(screen.getByText(/Maria Souza/i)).toBeInTheDocument();
  });

  // ── 4. Repositório com divergência aparece com badge "Atenção" ───────────
  it('exibe badge "Atenção" e tag de divergência para repo com alertas', () => {
    const comAlerta = makeSugestao({
      repositorioId: 'repo-b',
      repositorioCodigo: '000002/2026',
      prontoParaCQ: false,
      divergencias: [
        {
          tipo: 'DIGITALIZACAO_SEM_IMAGENS',
          severidade: 'alta',
          mensagem: 'Digitalização sem imagens.',
        },
      ],
    });
    renderPanel({ sugestoes: [comAlerta] });
    expect(screen.getByText('Atenção')).toBeInTheDocument();
    expect(screen.getByText('Sem imagens')).toBeInTheDocument();
  });

  // ── 5. Seleção via checkbox funciona ─────────────────────────────────────
  it('checkbox permite selecionar e desselecionar repositório', () => {
    renderPanel({ sugestoes: [makeSugestao()] });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    // After selection, confirmation hint should appear
    expect(screen.getByText(/1 repositório\(s\) selecionado\(s\)/i)).toBeInTheDocument();
  });

  // ── 6. Nenhum POST automático é disparado ao renderizar ───────────────────
  it('não dispara POST /lotes-cq automaticamente ao renderizar as sugestões', () => {
    renderPanel({ sugestoes: [makeSugestao()] });
    expect(mockApiPost).not.toHaveBeenCalledWith(
      expect.stringContaining('lotes-cq'),
      expect.anything()
    );
  });
});
