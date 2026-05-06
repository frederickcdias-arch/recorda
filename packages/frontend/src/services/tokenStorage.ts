/**
 * Centraliza chaves e operações de armazenamento de tokens JWT.
 * Único ponto de verdade — importado por AuthContext e ApiService.
 *
 * Segurança:
 * - Access token: sempre em sessionStorage (nunca localStorage) para reduzir risco de XSS.
 * - Refresh token: localStorage quando rememberMe=true, sessionStorage caso contrário.
 */

export const TOKEN_KEY = 'recorda_access_token';
export const REFRESH_TOKEN_KEY = 'recorda_refresh_token';
export const REMEMBER_ME_KEY = 'recorda_remember_me';

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY) ?? sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getRememberMePreference(): boolean {
  return localStorage.getItem(REMEMBER_ME_KEY) === 'true';
}

export function setStoredTokens(
  accessToken: string,
  refreshToken: string,
  rememberMe = false
): void {
  // Access token always in sessionStorage — never persisted to localStorage
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.setItem(TOKEN_KEY, accessToken);

  // Refresh token follows rememberMe preference
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  const refreshStorage = rememberMe ? localStorage : sessionStorage;
  refreshStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);

  if (rememberMe) {
    localStorage.setItem(REMEMBER_ME_KEY, 'true');
  } else {
    localStorage.removeItem(REMEMBER_ME_KEY);
  }
}

export function clearStoredTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(REMEMBER_ME_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}
