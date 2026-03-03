import { describe, it, expect } from 'vitest';
import { normalizeIdRepositorioGed } from './operacional-repositorios.js';

describe('normalizeIdRepositorioGed', () => {
  it('normalizes "16/2025" to "000016/2025"', () => {
    expect(normalizeIdRepositorioGed('16/2025')).toBe('000016/2025');
  });

  it('normalizes "000500 / 2025" removing spaces', () => {
    expect(normalizeIdRepositorioGed('000500 / 2025')).toBe('000500/2025');
  });

  it('normalizes "500/2025" padding number', () => {
    expect(normalizeIdRepositorioGed('500/2025')).toBe('000500/2025');
  });

  it('normalizes number-only "216" using reference year', () => {
    expect(normalizeIdRepositorioGed('216', 2025)).toBe('000216/2025');
  });

  it('normalizes 2-digit year "16/25" to 4-digit', () => {
    expect(normalizeIdRepositorioGed('16/25')).toBe('000016/2025');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeIdRepositorioGed('')).toBe('');
    expect(normalizeIdRepositorioGed('   ')).toBe('');
  });

  it('handles already-normalized input', () => {
    expect(normalizeIdRepositorioGed('000016/2025')).toBe('000016/2025');
  });

  it('handles large numbers', () => {
    expect(normalizeIdRepositorioGed('123456/2025')).toBe('123456/2025');
  });

  it('handles numbers larger than 6 digits', () => {
    expect(normalizeIdRepositorioGed('1234567/2025')).toBe('1234567/2025');
  });
});
