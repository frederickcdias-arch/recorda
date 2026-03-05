const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDatePreservingDay(value: string): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  if (DATE_ONLY_PATTERN.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateBR(value: string | Date | null | undefined, fallback = '-'): string {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value : parseDatePreservingDay(value);
  if (!parsed) return fallback;
  return parsed.toLocaleDateString('pt-BR');
}

export function formatDateTimeBR(value: string | Date | null | undefined, fallback = '-'): string {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value : parseDatePreservingDay(value);
  if (!parsed) return fallback;
  return parsed.toLocaleString('pt-BR');
}

export function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

