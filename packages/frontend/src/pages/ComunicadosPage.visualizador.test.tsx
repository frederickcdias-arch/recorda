import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ComunicadosPage } from './ComunicadosPage';
import { useAuth } from '../contexts/AuthContext';
import { useComunicadosUsuario, useMarcarComunicadoLido } from '../hooks/useQueries';
import { ToastProvider } from '../components/ui/Toast';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useQueries', () => ({
  useComunicadosUsuario: vi.fn(),
  useMarcarComunicadoLido: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as Mock;
const mockUseComunicadosUsuario = useComunicadosUsuario as unknown as Mock;
const mockUseMarcarComunicadoLido = useMarcarComunicadoLido as unknown as Mock;

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <ComunicadosPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('ComunicadosPage com perfil visualizador', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseComunicadosUsuario.mockReset();
    mockUseMarcarComunicadoLido.mockReset();

    mockUseAuth.mockReturnValue({
      usuario: {
        id: 'user-visualizador',
        nome: 'Infra Visualização',
        email: 'infra.visualizacao@recorda.local',
        perfil: 'visualizador',
      },
    });

    mockUseComunicadosUsuario.mockReturnValue({
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: {
        totalNaoLidos: 1,
        comunicados: [
          {
            id: 'com-1',
            titulo: 'Janela de validação',
            conteudo: 'Acesso liberado para conferência.',
            prioridade: 'MEDIA',
            escopoDestino: 'TODOS',
            tipo: 'COMUNICADO_GERAL',
            categoria: 'GERAL',
            resumo: null,
            fixado: false,
            leituraObrigatoria: false,
            status: 'PUBLICADO',
            criadoPorUsuarioId: 'admin-1',
            criadoEm: '2026-06-03T10:00:00.000Z',
            publicadoEm: '2026-06-03T10:00:00.000Z',
            encerradoEm: null,
            atualizadoEm: '2026-06-03T10:00:00.000Z',
            destinatario: {
              id: 'dest-1',
              comunicadoId: 'com-1',
              usuarioId: 'user-visualizador',
              lidoEm: null,
              entregueEm: '2026-06-03T10:00:00.000Z',
              criadoEm: '2026-06-03T10:00:00.000Z',
            },
          },
        ],
      },
    });

    mockUseMarcarComunicadoLido.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });
  });

  it('esconde a ação de marcar comunicado como lido', () => {
    renderPage();

    expect(screen.getAllByText('Janela de validação')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Marcar como lido/i })).not.toBeInTheDocument();
  });
});
