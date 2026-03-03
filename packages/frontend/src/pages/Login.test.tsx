import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { LoginPage } from './Login';
import { useAuth } from '../contexts/AuthContext';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const mockUseAuth = useAuth as unknown as Mock;

function renderLogin(): void {
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    navigateMock.mockReset();
  });

  it('submete formulário e navega para dashboard quando login tem sucesso', async () => {
    const loginMock = vi.fn().mockResolvedValue(true);

    mockUseAuth.mockReturnValue({
      login: loginMock,
      autenticado: false,
      carregando: false,
      erro: null,
      limparErro: vi.fn(),
      rememberMe: false,
    });

    const user = userEvent.setup();

    renderLogin();

    await user.type(screen.getByLabelText(/E-mail/i), 'user@test.com');
    await user.type(screen.getByLabelText(/Senha/i), 'SenhaSegura123');
    await user.click(screen.getByRole('button', { name: /Entrar/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('user@test.com', 'SenhaSegura123', false);
      expect(navigateMock).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('mostra mensagem de erro quando contexto expõe erro', () => {
    mockUseAuth.mockReturnValue({
      login: vi.fn(),
      autenticado: false,
      carregando: false,
      erro: 'Credenciais inválidas',
      limparErro: vi.fn(),
      rememberMe: false,
    });

    renderLogin();

    expect(screen.getByText(/Credenciais inválidas/i)).toBeInTheDocument();
  });

  it('navega automaticamente quando já está autenticado', () => {
    mockUseAuth.mockReturnValue({
      login: vi.fn(),
      autenticado: true,
      carregando: false,
      erro: null,
      limparErro: vi.fn(),
      rememberMe: true,
    });

    renderLogin();

    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });
});
