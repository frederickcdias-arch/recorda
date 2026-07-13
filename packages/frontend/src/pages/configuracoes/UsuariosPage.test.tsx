import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UsuariosPage } from './UsuariosPage';
import { useAuth } from '../../contexts/AuthContext';
import {
  useQueryClient,
  useRegisterUsuario,
  useToggleUsuarioAtivo,
  useUpdateUsuario,
  useUsuarios,
} from '../../hooks/useQueries';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/useQueries', () => ({
  useQueryClient: vi.fn(),
  useUsuarios: vi.fn(),
  useRegisterUsuario: vi.fn(),
  useUpdateUsuario: vi.fn(),
  useToggleUsuarioAtivo: vi.fn(),
  queryKeys: {
    usuarios: ['usuarios'],
  },
}));

const mockUseQueryClient = useQueryClient as unknown as Mock;
const mockUseAuth = useAuth as unknown as Mock;
const mockUseUsuarios = useUsuarios as unknown as Mock;
const mockUseRegisterUsuario = useRegisterUsuario as unknown as Mock;
const mockUseUpdateUsuario = useUpdateUsuario as unknown as Mock;
const mockUseToggleUsuarioAtivo = useToggleUsuarioAtivo as unknown as Mock;

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UsuariosPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UsuariosPage', () => {
  const registerMutateAsync = vi.fn();

  beforeEach(() => {
    registerMutateAsync.mockReset();
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: vi.fn(),
    });
    mockUseAuth.mockReturnValue({
      usuario: {
        id: 'current-admin',
      },
    });
    mockUseUsuarios.mockReturnValue({
      data: {
        usuarios: [
          {
            id: 'user-visualizador',
            nome: 'Infra Visualizacao',
            email: 'infra.visualizacao@recorda.local',
            perfis: ['visualizador'],
            perfilAtivo: 'visualizador',
            perfil: 'visualizador',
            papel: 'VISUALIZADOR',
            ativo: true,
            criado_em: '2026-06-03T12:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    });
    mockUseRegisterUsuario.mockReturnValue({
      mutateAsync: registerMutateAsync,
    });
    mockUseUpdateUsuario.mockReturnValue({
      mutateAsync: vi.fn(),
    });
    mockUseToggleUsuarioAtivo.mockReturnValue({
      mutateAsync: vi.fn(),
    });
  });

  it('renders the Visualizador option in the user form', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: /Novo Usuário/i }));

    expect(screen.getByRole('checkbox', { name: 'Visualizador' })).toBeInTheDocument();
  });

  it('submits visualizador profile when creating a user', async () => {
    const user = userEvent.setup();
    registerMutateAsync.mockResolvedValueOnce({});

    renderPage();

    await user.click(screen.getByRole('button', { name: /Novo Usuário/i }));
    await user.type(screen.getByLabelText(/Nome \*/i), 'Infra Visualizacao');
    await user.type(screen.getByLabelText(/Email \*/i), 'infra.visualizacao@recorda.local');
    await user.type(screen.getByLabelText(/Senha \*/i), 'SenhaSegura123');
    await user.click(screen.getByRole('checkbox', { name: 'Operador' }));
    await user.click(screen.getByRole('checkbox', { name: 'Visualizador' }));
    await user.click(screen.getByRole('button', { name: /Criar Usuário/i }));

    await waitFor(() => {
      expect(registerMutateAsync).toHaveBeenCalledWith({
        email: 'infra.visualizacao@recorda.local',
        nome: 'Infra Visualizacao',
        senha: 'SenhaSegura123',
        perfil: 'visualizador',
        perfis: ['visualizador'],
      });
    });
  });

  it('shows the Visualizador label in the list', () => {
    renderPage();

    expect(screen.getByText('Visualizador ativo')).toBeInTheDocument();
  });

  it('opens confirmation before toggling user status', async () => {
    const user = userEvent.setup();
    const toggleMutateAsync = vi.fn().mockResolvedValueOnce({});

    mockUseToggleUsuarioAtivo.mockReturnValue({
      mutateAsync: toggleMutateAsync,
    });

    renderPage();

    await user.click(screen.getByRole('button', { name: /Desativar usuário Infra Visualizacao/i }));

    const dialog = screen.getByRole('dialog', { name: /Desativar usuário/i });
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Desativar usuário/i }));

    await waitFor(() => {
      expect(toggleMutateAsync).toHaveBeenCalledWith('user-visualizador');
    });
  });
});
