import { describe, expect, it, vi } from 'vitest';
import { formatDateBR, getCurrentDateInputValue } from './date';

describe('formatDateBR', () => {
  it('preserva datas YYYY-MM-DD sem voltar um dia no fuso', () => {
    expect(formatDateBR('2026-06-03')).toBe('03/06/2026');
  });
});

describe('getCurrentDateInputValue', () => {
  it('gera valor de input usando o fuso oficial do sistema', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T02:30:00.000Z'));

    expect(getCurrentDateInputValue()).toBe('2026-06-02');

    vi.useRealTimers();
  });
});
