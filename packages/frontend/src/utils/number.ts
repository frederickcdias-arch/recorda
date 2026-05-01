export function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function formatCriticalNumber(
  value: unknown,
  options?: { fallback?: string; locale?: string }
): string {
  const parsed = parseFiniteNumber(value);
  if (parsed === null) {
    return options?.fallback ?? '—';
  }

  return parsed.toLocaleString(options?.locale ?? 'pt-BR');
}
