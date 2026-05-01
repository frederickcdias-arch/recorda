import { describe, expect, it } from 'vitest';
import { formatCriticalNumber, parseFiniteNumber } from './number';

describe('parseFiniteNumber', () => {
  it('mantém zero real', () => {
    expect(parseFiniteNumber(0)).toBe(0);
    expect(parseFiniteNumber('0')).toBe(0);
  });

  it('retorna null para payload ausente ou inválido', () => {
    expect(parseFiniteNumber(null)).toBeNull();
    expect(parseFiniteNumber(undefined)).toBeNull();
    expect(parseFiniteNumber('abc')).toBeNull();
  });
});

describe('formatCriticalNumber', () => {
  it('formata zero real como 0', () => {
    expect(formatCriticalNumber(0)).toBe('0');
  });

  it('não mascara payload inválido como zero', () => {
    expect(formatCriticalNumber(undefined)).toBe('—');
    expect(formatCriticalNumber('abc')).toBe('—');
  });
});
