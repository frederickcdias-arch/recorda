export const SYSTEM_TIMEZONE = 'America/Cuiaba';
export const LEGACY_PRODUCAO_ORIGEM = 'LEGADO';
export const SYSTEM_PRODUCAO_ORIGEM = 'SISTEMA';
export const LEGACY_CHECKLIST_OBSERVACAO = 'Importacao legada';
export const PROJETO_IMPORTACAO_PRODUCAO = 'IMPORTACAO_PRODUCAO';
export const LEGACY_REPOSITORIO_PROJETOS = ['LEGADO', PROJETO_IMPORTACAO_PRODUCAO] as const;

export const PRODUCAO_ESCOPOS = {
  contabilizada: 'producao_contabilizada',
} as const;

export const PRODUCAO_ORIGENS_CONTABILIZADAS = [
  LEGACY_PRODUCAO_ORIGEM,
  SYSTEM_PRODUCAO_ORIGEM,
] as const;
export const PRODUCAO_ETAPAS_EXCLUIDAS_DO_LEGADO = ['RECEBIMENTO', 'CONTROLE_QUALIDADE'] as const;

export const PRODUCAO_CONTABILIZADA_DESCRICAO =
  'Inclui producao de origem SISTEMA e LEGADO, mas desconsidera RECEBIMENTO e CONTROLE_QUALIDADE apenas nos registros LEGADO.';

function quoteSqlStrings(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

export function sqlDateInSystemTimezone(alias: string, column = 'data_producao'): string {
  return `(${alias}.${column} AT TIME ZONE '${SYSTEM_TIMEZONE}')::date`;
}

export function sqlTodayInSystemTimezone(): string {
  return `(CURRENT_TIMESTAMP AT TIME ZONE '${SYSTEM_TIMEZONE}')::date`;
}

export function sqlMonthStartInSystemTimezone(): string {
  return `DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE '${SYSTEM_TIMEZONE}')::date`;
}

export function sqlLastNDaysStartInSystemTimezone(days: number): string {
  return `(${sqlTodayInSystemTimezone()} - INTERVAL '${days} days')::date`;
}

export function buildProducaoContabilizadaWhere(alias = 'p'): string {
  const origem = `COALESCE(${alias}.marcadores->>'origem', '')`;
  return `${origem} IN (${quoteSqlStrings(PRODUCAO_ORIGENS_CONTABILIZADAS)}) AND (
    ${origem} = '${SYSTEM_PRODUCAO_ORIGEM}'
    OR ${alias}.etapa::text NOT IN (${quoteSqlStrings(PRODUCAO_ETAPAS_EXCLUIDAS_DO_LEGADO)})
  )`;
}

export function buildProducaoOrigemWhere(
  alias: string,
  origem: (typeof PRODUCAO_ORIGENS_CONTABILIZADAS)[number]
): string {
  return `COALESCE(${alias}.marcadores->>'origem', '') = '${origem}'`;
}

export function buildLegacyProducaoWhere(alias = 'p'): string {
  return buildProducaoOrigemWhere(alias, LEGACY_PRODUCAO_ORIGEM);
}

export function buildLegacyChecklistWhere(alias = 'c'): string {
  return `${alias}.observacao = '${LEGACY_CHECKLIST_OBSERVACAO}'`;
}

export function buildLegacyRepositorioProjetoWhere(alias = 'r'): string {
  return `${alias}.projeto IN (${quoteSqlStrings(LEGACY_REPOSITORIO_PROJETOS)})`;
}
