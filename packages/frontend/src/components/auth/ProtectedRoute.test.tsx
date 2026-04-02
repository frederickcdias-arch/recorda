import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from '../../contexts/AuthContext';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as Mock;

function renderProtected(): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>Conteúdo protegido</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Página de login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('exibe spinner enquanto autenticação está carregando', () => {
    mockUseAuth.mockReturnValue({
      autenticado: false,
      carregando: true,
      logout: vi.fn(),
      login: vi.fn(),
      usuario: null,
      erro: null,
      rememberMe: false,
      temPermissao: vi.fn(),
      limparErro: vi.fn(),
    });

    renderProtected();

    expect(screen.getByText(/Verificando autenticação/i)).toBeInTheDocument();
  });

  it('redireciona para login quando não autenticado', () => {
    mockUseAuth.mockReturnValue({
      autenticado: false,
      carregando: false,
      logout: vi.fn(),
      login: vi.fn(),
      usuario: null,
      erro: null,
      rememberMe: false,
      temPermissao: vi.fn(),
      limparErro: vi.fn(),
    });

    renderProtected();

    expect(screen.getByText(/Página de login/i)).toBeInTheDocument();
  });
});
