/**
 * Extrai mensagem de erro de qualquer tipo de exceção
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'error' in error) {
    return String((error as { error: string }).error);
  }
  if (typeof error === 'string') return error;
  return fallback;
}
