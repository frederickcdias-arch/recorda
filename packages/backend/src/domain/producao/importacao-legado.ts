import { SYSTEM_TIMEZONE } from './producao-metrics.js';

export const INVALID_QUANTIDADE_MESSAGE =
  'Quantidade invalida. Informe um numero inteiro maior que zero.';
export const INVALID_DATA_MESSAGE =
  'Data de producao invalida. Corrija a data na planilha antes de importar.';
export const FUTURE_DATA_MESSAGE =
  'Data de producao futura nao e permitida. Corrija a data na planilha antes de importar.';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface ParseDataOptions {
  maxDateIso?: string;
  now?: Date;
  timeZone?: string;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getTodayIsoInTimezone(
  now: Date = new Date(),
  timeZone: string = SYSTEM_TIMEZONE
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Nao foi possivel resolver a data atual para o timezone ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

function validateMaxDate(isoDate: string, options?: ParseDataOptions): ValidationResult<string> {
  const maxDateIso = options?.maxDateIso ?? getTodayIsoInTimezone(options?.now, options?.timeZone);
  if (isoDate > maxDateIso) {
    return { ok: false, error: FUTURE_DATA_MESSAGE };
  }
  return { ok: true, value: isoDate };
}

export function excelSerialToIsoDate(
  serial: number,
  options?: ParseDataOptions
): ValidationResult<string> {
  if (!Number.isFinite(serial) || serial <= 0) {
    return { ok: false, error: INVALID_DATA_MESSAGE };
  }

  const excelEpoch = Date.UTC(1899, 11, 30);
  const milliseconds = Math.floor(serial) * 24 * 60 * 60 * 1000;
  const date = new Date(excelEpoch + milliseconds);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  if (!isValidDateParts(year, month, day)) {
    return { ok: false, error: INVALID_DATA_MESSAGE };
  }

  return validateMaxDate(formatIsoDate(year, month, day), options);
}

export function parseQuantidadePlanilha(input: unknown): ValidationResult<number> {
  if (typeof input === 'number') {
    if (Number.isInteger(input) && input > 0) {
      return { ok: true, value: input };
    }
    return { ok: false, error: INVALID_QUANTIDADE_MESSAGE };
  }

  const raw = String(input ?? '').trim();
  if (!raw) {
    return { ok: false, error: INVALID_QUANTIDADE_MESSAGE };
  }

  const compact = raw.replace(/\s/g, '');

  if (/^\d+$/.test(compact)) {
    const parsed = Number(compact);
    return parsed > 0
      ? { ok: true, value: parsed }
      : { ok: false, error: INVALID_QUANTIDADE_MESSAGE };
  }

  if (/^\d{1,3}([.,]\d{3})+$/.test(compact)) {
    const parsed = Number(compact.replace(/[.,]/g, ''));
    return parsed > 0
      ? { ok: true, value: parsed }
      : { ok: false, error: INVALID_QUANTIDADE_MESSAGE };
  }

  return { ok: false, error: INVALID_QUANTIDADE_MESSAGE };
}

export function parseDataProducaoPlanilha(
  input: unknown,
  options?: ParseDataOptions
): ValidationResult<string> {
  const raw = String(input ?? '').trim();
  if (!raw) {
    return { ok: false, error: INVALID_DATA_MESSAGE };
  }

  if (/^\d+([.,]\d+)?$/.test(raw) && !raw.includes('/') && !raw.includes('-')) {
    const serial = Number(raw.replace(',', '.'));
    return excelSerialToIsoDate(serial, options);
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return isValidDateParts(year, month, day)
      ? validateMaxDate(formatIsoDate(year, month, day), options)
      : { ok: false, error: INVALID_DATA_MESSAGE };
  }

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    const yearPart = brMatch[3]!;
    const year =
      yearPart.length === 2
        ? Number(`${Number(yearPart) > 50 ? '19' : '20'}${yearPart}`)
        : Number(yearPart);

    return isValidDateParts(year, month, day)
      ? validateMaxDate(formatIsoDate(year, month, day), options)
      : { ok: false, error: INVALID_DATA_MESSAGE };
  }

  return { ok: false, error: INVALID_DATA_MESSAGE };
}
