import { describe, expect, it } from 'vitest';
import {
  INVALID_DATA_MESSAGE,
  INVALID_QUANTIDADE_MESSAGE,
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
  it('aceita ISO e brasileiro com ano de 2 ou 4 dígitos', () => {
    expect(parseDataProducaoPlanilha('2026-05-01')).toEqual({
      ok: true,
      value: '2026-05-01',
    });
    expect(parseDataProducaoPlanilha('01/05/2026')).toEqual({
      ok: true,
      value: '2026-05-01',
    });
    expect(parseDataProducaoPlanilha('01/05/26')).toEqual({
      ok: true,
      value: '2026-05-01',
    });
  });

  it('rejeita vazio, data impossível e data incompleta', () => {
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
});
