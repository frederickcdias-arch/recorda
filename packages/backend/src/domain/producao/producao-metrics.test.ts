import { describe, expect, it } from 'vitest';
import {
  SYSTEM_TIMEZONE,
  buildProducaoContabilizadaWhere,
  sqlDateInSystemTimezone,
  sqlLastNDaysStartInSystemTimezone,
  sqlMonthStartInSystemTimezone,
  sqlTodayInSystemTimezone,
} from './producao-metrics.js';

describe('producao-metrics', () => {
  it('usa America/Cuiaba como timezone oficial', () => {
    expect(SYSTEM_TIMEZONE).toBe('America/Cuiaba');
    expect(sqlDateInSystemTimezone('p')).toContain('America/Cuiaba');
    expect(sqlTodayInSystemTimezone()).toContain('America/Cuiaba');
    expect(sqlMonthStartInSystemTimezone()).toContain('America/Cuiaba');
    expect(sqlLastNDaysStartInSystemTimezone(7)).toContain('America/Cuiaba');
  });

  it('expõe a regra única de produção contabilizada', () => {
    const where = buildProducaoContabilizadaWhere('p');
    expect(where).toContain("COALESCE(p.marcadores->>'origem', '') IN ('LEGADO', 'SISTEMA')");
    expect(where).toContain("COALESCE(p.marcadores->>'origem', '') = 'SISTEMA'");
    expect(where).toContain("p.etapa::text NOT IN ('RECEBIMENTO', 'CONTROLE_QUALIDADE')");
  });
});
