import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  Usuario,
  PerfilUsuario,
  PermissaoTipo,
  LoginResponse,
  RefreshTokenResponse,
} from '@recorda/shared';
import { PERMISSOES_POR_PERFIL } from '@recorda/shared';
import {
  getToken,
  getRefreshToken,
  getRememberMePreference,
  setStoredTokens,
  clearStoredTokens,
} from '../services/tokenStorage.js';
import { api } from '../services/api';

// Re-exportar tipos para compatibilidade
export type { Usuario, PerfilUsuario, PermissaoTipo } from '@recorda/shared';

interface AuthContextData {
  usuario: Usuario | null;
  carregando: boolean;
  autenticado: boolean;
  erro: string | null;
  rememberMe: boolean;
  temPermissao: (permissao: PermissaoTipo) => boolean;
  login: (email: string, senha: string, rememberMe?: boolean) => Promise<boolean>;
  trocarPerfil: (perfil: PerfilUsuario) => Promise<boolean>;
  logout: () => Promise<void>;
  limparErro: () => void;
}

const AuthContext = createContext<AuthContextData | undefined>(undefined);

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const data = await api.post<RefreshTokenResponse>(
      '/auth/refresh',
      { refreshToken },
      { skipAuth: true }
    );

    const rememberMe = getRememberMePreference();
    setStoredTokens(data.accessToken, data.refreshToken, rememberMe);
    return true;
  } catch {
    return false;
  }
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const queryClient = useQueryClient();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(getRememberMePreference());

  const normalizeUsuario = useCallback((data: Partial<Usuario> & { id: string; nome: string; email: string }): Usuario => {
    const perfis: PerfilUsuario[] = Array.isArray(data.perfis) && data.perfis.length > 0
      ? (data.perfis as PerfilUsuario[])
      : data.perfil
        ? [data.perfil as PerfilUsuario]
        : ['operador' as PerfilUsuario];
    const perfilAtivo: PerfilUsuario =
      (data.perfilAtivo as PerfilUsuario | undefined) ??
      (data.perfil as PerfilUsuario | undefined) ??
      perfis[0]!;

    return {
      id: data.id,
      nome: data.nome,
      email: data.email,
      perfis,
      perfilAtivo,
      perfil: perfilAtivo,
      coordenadoriaId: data.coordenadoria?.id ?? data.coordenadoriaId,
      coordenadoria: data.coordenadoria,
      ativo: data.ativo,
    };
  }, []);

  const autenticado = usuario !== null;

  useEffect(() => {
    async function verificarToken(): Promise<void> {
      const token = getToken();

      if (!token) {
        setCarregando(false);
        return;
      }

      try {
        const data = await api.get<Usuario>('/auth/me');

        setUsuario(normalizeUsuario(data));
      } catch {
        // Token invalido, tentar refresh.
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          try {
            const data = await api.get<Usuario>('/auth/me');
            setUsuario(normalizeUsuario(data));
          } catch {
            clearStoredTokens();
          }
        } else {
          clearStoredTokens();
        }
      } finally {
        setCarregando(false);
      }
    }

    void verificarToken();
  }, []);

  const temPermissao = useCallback(
    (permissao: PermissaoTipo): boolean => {
      if (!usuario) return false;
      const perfilAtual = usuario.perfilAtivo ?? usuario.perfil;
      const permissoesDoPerfil = PERMISSOES_POR_PERFIL[perfilAtual];
      return permissoesDoPerfil.includes(permissao);
    },
    [usuario]
  );

  const login = useCallback(
    async (email: string, password: string, lembrarMe = false): Promise<boolean> => {
      setCarregando(true);
      setErro(null);

      try {
        const data = await api.post<LoginResponse>(
          '/auth/login',
          { email, senha: password },
          { skipAuth: true }
        );

        if (!data.accessToken || !data.refreshToken || !data.usuario) {
          throw new Error('Resposta de login invalida');
        }

        setStoredTokens(data.accessToken, data.refreshToken, lembrarMe);
        setRememberMe(lembrarMe);
        setUsuario(normalizeUsuario(data.usuario));

        return true;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'error' in error
              ? String((error as { error: unknown }).error)
              : 'Credenciais invalidas';
        setErro(errorMessage);
        return false;
      } finally {
        setCarregando(false);
      }
    },
    []
  );

  const trocarPerfil = useCallback(
    async (perfil: PerfilUsuario): Promise<boolean> => {
      setErro(null);

      try {
        const data = await api.post<LoginResponse>('/auth/switch-profile', { perfilAtivo: perfil });
        const rememberMeAtual = getRememberMePreference();
        setStoredTokens(data.accessToken, data.refreshToken, rememberMeAtual);
        queryClient.clear();
        setUsuario(normalizeUsuario(data.usuario));
        return true;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'error' in error
              ? String((error as { error: unknown }).error)
              : 'Não foi possível trocar o perfil';
        setErro(errorMessage);
        return false;
      }
    },
    [normalizeUsuario, queryClient]
  );

  const logout = useCallback(async (): Promise<void> => {
    const token = getToken();

    try {
      if (token) {
        await api.post('/auth/logout', {}, {});
      }
    } catch {
      // Ignora erros no logout
    } finally {
      clearStoredTokens();
      setUsuario(null);
    }
  }, []);

  const limparErro = useCallback((): void => {
    setErro(null);
  }, []);

  const value = useMemo(
    () => ({
      usuario,
      carregando,
      autenticado,
      erro,
      rememberMe,
      temPermissao,
      login,
      trocarPerfil,
      logout,
      limparErro,
    }),
    [
      usuario,
      carregando,
      autenticado,
      erro,
      rememberMe,
      temPermissao,
      login,
      trocarPerfil,
      logout,
      limparErro,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextData {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

export function usePermissao(permissao: PermissaoTipo): boolean {
  const { temPermissao } = useAuth();
  return temPermissao(permissao);
}

// Funcao utilitaria para fazer requisicoes autenticadas.
export async function fetchAutenticado(url: string, options: RequestInit = {}): Promise<Response> {
  return api.fetchWithAuth(url, options);
}
