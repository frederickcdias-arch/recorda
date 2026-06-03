import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UsuariosPage } from './UsuariosPage';
import {
  useQueryClient,
  useRegisterUsuario,
  useToggleUsuarioAtivo,
  useUpdateUsuario,
  useUsuarios,
} from '../../hooks/useQueries';

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
    mockUseUsuarios.mockReturnValue({
      data: {
        usuarios: [
          {
            id: 'user-visualizador',
            nome: 'Infra Visualização',
            email: 'infra.visualizacao@recorda.local',
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

  it('renderiza a opção Visualizador no formulário de usuário', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: /Novo Usuário/i }));

    expect(screen.getByRole('option', { name: 'Visualizador' })).toBeInTheDocument();
  });

  it('envia perfil visualizador ao criar usuário', async () => {
    const user = userEvent.setup();
    registerMutateAsync.mockResolvedValueOnce({});

    renderPage();

    await user.click(screen.getByRole('button', { name: /Novo Usuário/i }));
    await user.type(screen.getByLabelText(/Nome \*/i), 'Infra Visualização');
    await user.type(screen.getByLabelText(/Email \*/i), 'infra.visualizacao@recorda.local');
    await user.type(
      screen.getByLabelText(/Senha \* \(mínimo 8 caracteres\)/i),
      'SenhaSegura123'
    );
    await user.selectOptions(screen.getByLabelText(/Perfil/i), 'visualizador');
    await user.click(screen.getByRole('button', { name: /Criar Usuário/i }));

    await waitFor(() => {
      expect(registerMutateAsync).toHaveBeenCalledWith({
        email: 'infra.visualizacao@recorda.local',
        nome: 'Infra Visualização',
        senha: 'SenhaSegura123',
        perfil: 'visualizador',
      });
    });
  });

  it('mostra a label Visualizador na listagem', () => {
    renderPage();

    expect(screen.getByText('Visualizador')).toBeInTheDocument();
  });
});
