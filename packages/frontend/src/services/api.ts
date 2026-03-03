/**
 * Serviço de API centralizado com autenticação automática
 */

import { getToken, clearStoredTokens as clearTokens } from './tokenStorage.js';

const rawApiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || '/api';
const API_BASE = rawApiBase.endsWith('/') ? rawApiBase.slice(0, -1) : rawApiBase;

function resolveApiUrl(endpoint: string, baseUrl: string): string {
  if (endpoint.startsWith('http')) return endpoint;

  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Allow legacy "/api/*" endpoints to work even when VITE_API_BASE points to external backend.
  if (baseUrl !== '/api' && normalizedEndpoint.startsWith('/api/')) {
    return `${baseUrl}${normalizedEndpoint.slice(4)}`;
  }

  return `${baseUrl}${normalizedEndpoint}`;
}

export function buildApiUrl(endpoint: string): string {
  return resolveApiUrl(endpoint, API_BASE);
}

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
}

interface FetchWithAuthInit extends RequestInit {
  skipAuth?: boolean;
}

interface ApiError {
  error: string;
  code?: string;
  status: number;
}

class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const { skipAuth = false, headers: customHeaders, ...restOptions } = options;
    
    const headers = new Headers(customHeaders);
    
    // Adicionar Content-Type se não for FormData e houver body
    if (restOptions.body && !(restOptions.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    
    // Adicionar token de autenticação
    if (!skipAuth) {
      const token = getToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    const url = resolveApiUrl(endpoint, this.baseUrl);
    
    const response = await fetch(url, {
      ...restOptions,
      headers,
    });

    // Tratar erros de autenticação
    if (response.status === 401) {
      // Token expirado ou inválido - redirecionar para login
      clearTokens();
      window.location.href = '/login';
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    // Tratar erros de autorização
    if (response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        error: errorData.error || 'Acesso negado',
        code: 'FORBIDDEN',
        status: 403,
      } as ApiError;
    }

    // Tratar outros erros
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        error: errorData.error || `Erro ${response.status}`,
        code: errorData.code,
        status: response.status,
      } as ApiError;
    }

    // Retornar dados
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    
    // Para downloads de arquivos (PDF, Excel)
    if (contentType?.includes('application/pdf') || 
        contentType?.includes('application/vnd.openxmlformats')) {
      return response.blob() as Promise<T>;
    }

    return response.text() as Promise<T>;
  }

  fetchWithAuth(input: RequestInfo | URL, init: FetchWithAuthInit = {}): Promise<Response> {
    const { skipAuth = false, headers, ...rest } = init;
    const mergedHeaders = new Headers(headers);

    if (!skipAuth) {
      const token = getToken();
      if (token) {
        mergedHeaders.set('Authorization', `Bearer ${token}`);
      }
    }

    if (!(rest.body instanceof FormData) && !mergedHeaders.has('Content-Type') && rest.method && ['POST', 'PUT', 'PATCH'].includes(rest.method.toUpperCase())) {
      mergedHeaders.set('Content-Type', 'application/json');
    }

    const target =
      typeof input === 'string'
        ? resolveApiUrl(input, this.baseUrl)
        : input;

    return fetch(target, {
      ...rest,
      headers: mergedHeaders,
    });
  }

  async download(endpoint: string, filenameHint?: string): Promise<void> {
    const response = await this.fetchWithAuth(endpoint);

    if (response.status === 401) {
      clearTokens();
      window.location.href = '/login';
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Erro ao baixar arquivo');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    if (filenameHint) {
      link.download = filenameHint;
    }
    link.click();
    window.URL.revokeObjectURL(url);
  }

  async get<T>(endpoint: string, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown, options?: ApiOptions): Promise<T> {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  async put<T>(endpoint: string, data?: unknown, options?: ApiOptions): Promise<T> {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  async patch<T>(endpoint: string, data?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, { 
      ...options, 
      method: 'PATCH', 
      body: JSON.stringify(data) 
    });
  }

  async delete<T>(endpoint: string, options?: ApiOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

// Instância singleton
export const api = new ApiService();

// Exportar tipos
export type { ApiError, ApiOptions };
