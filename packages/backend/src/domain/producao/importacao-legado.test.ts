import { describe, expect, it } from 'vitest';
import {
  FUTURE_DATA_MESSAGE,
  INVALID_DATA_MESSAGE,
  INVALID_QUANTIDADE_MESSAGE,
  getTodayIsoInTimezone,
  parseDataProducaoPlanilha,
  parseQuantidadePlanilha,
} from './importacao-legado.js';

describe('parseQuantidadePlanilha', () => {
  it('aceita inteiro positivo simples', () => {
    expect(parseQuantidadePlanilha('12')).toEqual({ ok: true, value: 12 });
  });

  it('aceita separador de milhar', () => {
    expect(parseQuantidadePlanilha('1.234')).toEqual({ ok: true, value: 1234 });
    expect(parseQuantidadePlanilha('1,234')).toEqual({ ok: true, value: 1234 });
  });

  it('rejeita vazio, decimal e texto', () => {
    expect(parseQuantidadePlanilha('')).toEqual({
      ok: false,
      error: INVALID_QUANTIDADE_MESSAGE,
    });
    expect(parseQuantidadePlanilha('1,5')).toEqual({
      ok: false,
      error: INVALID_QUANTIDADE_MESSAGE,
    });
    expect(parseQuantidadePlanilha('abc')).toEqual({
      ok: false,
      error: INVALID_QUANTIDADE_MESSAGE,
    });
  });
});

describe('parseDataProducaoPlanilha', () => {
  it('aceita ISO e brasileiro com ano de 2 ou 4 digitos', () => {
    const now = new Date('2026-05-01T15:00:00Z');

    expect(parseDataProducaoPlanilha('2026-05-01', { now })).toEqual({
      ok: true,
      value: '2026-05-01',
    });
    expect(parseDataProducaoPlanilha('01/05/2026', { now })).toEqual({
      ok: true,
      value: '2026-05-01',
    });
    expect(parseDataProducaoPlanilha('01/05/26', { now })).toEqual({
      ok: true,
      value: '2026-05-01',
    });
  });

  it('rejeita vazio, data impossivel e data incompleta', () => {
    expect(parseDataProducaoPlanilha('')).toEqual({
      ok: false,
      error: INVALID_DATA_MESSAGE,
    });
    expect(parseDataProducaoPlanilha('31/02/2026')).toEqual({
      ok: false,
      error: INVALID_DATA_MESSAGE,
    });
    expect(parseDataProducaoPlanilha('11-21')).toEqual({
      ok: false,
      error: INVALID_DATA_MESSAGE,
    });
  });

  it('rejeita data futura textual e serial', () => {
    const now = new Date('2026-05-01T15:00:00Z');

    expect(parseDataProducaoPlanilha('15/12/2026', { now })).toEqual({
      ok: false,
      error: FUTURE_DATA_MESSAGE,
    });
    expect(parseDataProducaoPlanilha('46371', { maxDateIso: '2026-05-01' })).toEqual({
      ok: false,
      error: FUTURE_DATA_MESSAGE,
    });
  });
});

describe('getTodayIsoInTimezone', () => {
  it('resolve a data atual no timezone oficial do sistema', () => {
    expect(getTodayIsoInTimezone(new Date('2026-05-01T03:30:00Z'))).toBe('2026-04-30');
    expect(getTodayIsoInTimezone(new Date('2026-05-01T05:30:00Z'))).toBe('2026-05-01');
  });
});
