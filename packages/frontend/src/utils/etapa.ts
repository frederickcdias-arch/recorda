/**
 * Utilitário centralizado para cores de etapa de produção.
 *
 * Mantém consistência visual entre Dashboard, MeuHistoricoPage e outros
 * componentes que exibem etapas de produção com cores semânticas.
 */

export interface EtapaProducaoStyle {
  bg: string;
  text: string;
  bar: string;
}

const ETAPA_CORES: Record<string, EtapaProducaoStyle> = {
  recebimento: { bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-500' },
  prepara: { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500' },
  digitaliza: { bg: 'bg-cyan-50', text: 'text-cyan-700', bar: 'bg-cyan-500' },
  conferencia: { bg: 'bg-green-50', text: 'text-green-700', bar: 'bg-green-500' },
  confer: { bg: 'bg-green-50', text: 'text-green-700', bar: 'bg-green-500' },
  reconfer: { bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-500' },
  montagem: { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-500' },
  controle: { bg: 'bg-violet-50', text: 'text-violet-700', bar: 'bg-violet-500' },
  entrega: { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' },
};

const DEFAULT_STYLE: EtapaProducaoStyle = {
  bg: 'bg-blue-50',
  text: 'text-blue-700',
  bar: 'bg-blue-500',
};

/**
 * Retorna as classes Tailwind de cor para uma etapa de produção.
 * Aceita labels com ou sem acento, em qualquer case, e os valores
 * de enum do banco (ex: 'DIGITALIZACAO_COLORIDA').
 */
export function getEtapaProducaoStyle(etapa: string): EtapaProducaoStyle {
  const lower = etapa.toLowerCase();
  const key = Object.keys(ETAPA_CORES).find((k) => lower.includes(k));
  return ETAPA_CORES[key ?? ''] ?? DEFAULT_STYLE;
}
