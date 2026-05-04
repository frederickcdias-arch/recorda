/**
 * Utilitários compartilhados para identificadores de repositório.
 * Usado tanto no backend quanto no frontend para garantir normalização consistente.
 */

/**
 * Normaliza id_repositorio_ged para o formato padrão: 000000/YYYY
 *
 * Exemplos:
 *   "16/2025"       -> "000016/2025"
 *   "000500 / 2025" -> "000500/2025"
 *   "500/2025"      -> "000500/2025"
 *   "216"           -> "000216/2025" (usa ano atual quando não fornecido)
 *
 * @param raw            Valor bruto digitado pelo usuário ou lido de planilha
 * @param anoReferencia  Ano a usar quando o input não contém barra (ex: "000216")
 */
export function normalizeIdRepositorioGed(raw: string, anoReferencia?: number): string {
  const limpo = raw.replace(/\s/g, '').trim();
  if (!limpo) return '';

  let numero: string;
  let ano: string;

  if (limpo.includes('/')) {
    const parts = limpo.split('/');
    numero = parts[0] ?? '';
    ano = parts[1] ?? '';
  } else {
    numero = limpo;
    ano = String(anoReferencia ?? new Date().getFullYear());
  }

  const numeroPadded = numero.replace(/^0+/, '').padStart(6, '0');
  const anoFinal = ano.length === 2 ? `20${ano}` : ano;

  return `${numeroPadded}/${anoFinal}`;
}
