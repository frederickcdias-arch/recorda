import { describe, it, afterEach, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider, useAuth } from './AuthContext';

function TestConsumer(): JSX.Element {
  const { login, logout, autenticado, usuario } = useAuth();

  return (
    <div>
      <button onClick={() => login('user@test.com', 'SenhaSegura123')}>login</button>
      <button onClick={() => logout()}>logout</button>
      <span data-testid="autenticado">{autenticado ? 'yes' : 'no'}</span>
      <span data-testid="usuario">{usuario?.nome ?? 'anon'}</span>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('realiza login com sucesso e armazena tokens na sessão', async () => {
    const user = userEvent.setup();

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (typeof input === 'string' && input.includes('/api/auth/login')) {
        return new Response(
          JSON.stringify({
            accessToken: 'token-123',
            refreshToken: 'refresh-456',
            usuario: {
              id: 'user-1',
              nome: 'Usuário Teste',
              email: 'user@test.com',
              perfil: 'operador',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(null, { status: 404 });
    });

    vi.stubGlobal('fetch', mockFetch);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await user.click(screen.getByText('login'));

    await waitFor(() => expect(screen.getByTestId('autenticado')).toHaveTextContent('yes'));
    expect(screen.getByTestId('usuario')).toHaveTextContent('Usuário Teste');
    expect(sessionStorage.getItem('recorda_access_token')).toBe('token-123');
    expect(sessionStorage.getItem('recorda_refresh_token')).toBe('refresh-456');
  });

  it('executa logout limpando tokens de armazenamento', async () => {
    sessionStorage.setItem('recorda_access_token', 'token-abc');
    sessionStorage.setItem('recorda_refresh_token', 'refresh-def');

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (typeof input === 'string' && input.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            id: 'user-1',
            nome: 'Usuário Existente',
            email: 'user@test.com',
            perfil: 'operador',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (typeof input === 'string' && input.includes('/api/auth/logout')) {
        return new Response(null, { status: 200 });
      }

      return new Response(null, { status: 404 });
    });

    vi.stubGlobal('fetch', mockFetch);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByTestId('autenticado')).toHaveTextContent('yes'));
    await user.click(screen.getByText('logout'));

    await waitFor(() => expect(screen.getByTestId('autenticado')).toHaveTextContent('no'));
    expect(sessionStorage.getItem('recorda_access_token')).toBeNull();
    expect(sessionStorage.getItem('recorda_refresh_token')).toBeNull();
  });
});
