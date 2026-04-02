import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { Usuario, PerfilUsuario, PermissaoTipo } from '@recorda/shared';
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

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  usuario: Usuario;
}

interface AuthContextData {
  usuario: Usuario | null;
  carregando: boolean;
  autenticado: boolean;
  erro: string | null;
  rememberMe: boolean;
  temPermissao: (permissao: PermissaoTipo) => boolean;
  login: (email: string, senha: string, rememberMe?: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  limparErro: () => void;
}

const AuthContext = createContext<AuthContextData | undefined>(undefined);

const PERMISSOES_POR_PERFIL: Record<PerfilUsuario, PermissaoTipo[]> = {
  operador: [
    'visualizar_dashboard',
    'gerar_relatorios',
    'importar_producao',
    'capturar_documentos',
  ],
  administrador: [
    'visualizar_dashboard',
    'gerar_relatorios',
    'importar_producao',
    'capturar_documentos',
    'gerenciar_configuracoes',
    'gerenciar_usuarios',
  ],
};

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const data = await api.post<{ accessToken: string; refreshToken: string }>(
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
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(getRememberMePreference());

  const autenticado = usuario !== null;

  // Verificar token ao carregar
  useEffect(() => {
    async function verificarToken() {
      const token = getToken();

      if (!token) {
        setCarregando(false);
        return;
      }

      try {
        const data = await api.get<Usuario>('/auth/me');

        setUsuario({
          id: data.id,
          nome: data.nome,
          email: data.email,
          perfil: data.perfil as PerfilUsuario,
          coordenadoriaId: data.coordenadoria?.id,
          coordenadoria: data.coordenadoria,
        });
      } catch (error) {
        // Token inválido, tentar refresh
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          try {
            const data = await api.get<Usuario>('/auth/me');
            setUsuario({
              id: data.id,
              nome: data.nome,
              email: data.email,
              perfil: data.perfil as PerfilUsuario,
              coordenadoriaId: data.coordenadoria?.id,
              coordenadoria: data.coordenadoria,
            });
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

    verificarToken();
  }, []);

  const temPermissao = useCallback(
    (permissao: PermissaoTipo): boolean => {
      if (!usuario) return false;
      const permissoesDoPerfil = PERMISSOES_POR_PERFIL[usuario.perfil];
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
          throw new Error('Resposta de login inválida');
        }

        setStoredTokens(data.accessToken, data.refreshToken, lembrarMe);
        setRememberMe(lembrarMe);
        setUsuario({
          ...data.usuario,
          perfil: data.usuario.perfil as PerfilUsuario,
        });

        return true;
      } catch (error: any) {
        const errorMessage = error?.error || error?.message || 'Credenciais inválidas';
        setErro(errorMessage);
        return false;
      } finally {
        setCarregando(false);
      }
    },
    []
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

  const limparErro = useCallback(() => {
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
      logout,
      limparErro,
    }),
    [usuario, carregando, autenticado, erro, rememberMe, temPermissao, login, logout, limparErro]
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

// Função utilitária para fazer requisições autenticadas
export async function fetchAutenticado(url: string, options: RequestInit = {}): Promise<Response> {
  return api.fetchWithAuth(url, options);
}
