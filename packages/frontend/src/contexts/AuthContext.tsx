import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { Usuario, PerfilUsuario, PermissaoTipo } from '@recorda/shared';
import {
  getToken,
  getRefreshToken,
  getRememberMePreference,
  setStoredTokens,
  clearStoredTokens,
} from '../services/tokenStorage.js';
import { buildApiUrl } from '../services/api.js';

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
    const response = await fetch(buildApiUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return false;

    const data = await response.json();
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
        const response = await fetch(buildApiUrl('/auth/me'), {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUsuario({
            id: data.id,
            nome: data.nome,
            email: data.email,
            perfil: data.perfil as PerfilUsuario,
            coordenadoriaId: data.coordenadoria?.id,
            coordenadoria: data.coordenadoria,
          });
        } else if (response.status === 401) {
          // Tentar refresh do token
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            // Refazer a requisição original com o novo token
            const newToken = getToken();
            if (newToken) {
              const retryResponse = await fetch(buildApiUrl('/auth/me'), {
                headers: { 'Authorization': `Bearer ${newToken}` },
              });
              if (retryResponse.ok) {
                const data = await retryResponse.json();
                setUsuario({
                  id: data.id,
                  nome: data.nome,
                  email: data.email,
                  perfil: data.perfil as PerfilUsuario,
                  coordenadoriaId: data.coordenadoria?.id,
                  coordenadoria: data.coordenadoria,
                });
                return;
              }
            }
          }
          clearStoredTokens();
        } else {
          clearStoredTokens();
        }
      } catch {
        clearStoredTokens();
      } finally {
        setCarregando(false);
      }
    }

    verificarToken();
  }, []);

  const temPermissao = useCallback((permissao: PermissaoTipo): boolean => {
    if (!usuario) return false;
    const permissoesDoPerfil = PERMISSOES_POR_PERFIL[usuario.perfil];
    return permissoesDoPerfil.includes(permissao);
  }, [usuario]);

  const login = useCallback(async (email: string, senha: string, lembrarMe = false): Promise<boolean> => {
    setCarregando(true);
    setErro(null);

    try {
      const response = await fetch(buildApiUrl('/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, senha }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || 'Erro ao fazer login');
        return false;
      }

      const loginData = data as LoginResponse;
      setStoredTokens(loginData.accessToken, loginData.refreshToken, lembrarMe);
      setRememberMe(lembrarMe);
      setUsuario({
        ...loginData.usuario,
        perfil: loginData.usuario.perfil as PerfilUsuario,
      });

      return true;
    } catch {
      setErro('Erro de conexão. Verifique sua internet.');
      return false;
    } finally {
      setCarregando(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    const token = getToken();
    
    try {
      if (token) {
        await fetch(buildApiUrl('/auth/logout'), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
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

  const value = useMemo(() => ({
    usuario,
    carregando,
    autenticado,
    erro,
    rememberMe,
    temPermissao,
    login,
    logout,
    limparErro,
  }), [usuario, carregando, autenticado, erro, rememberMe, temPermissao, login, logout, limparErro]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
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
  const token = getToken();
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(buildApiUrl(url), {
    ...options,
    headers,
  });
}
