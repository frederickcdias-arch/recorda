/**
 * Tipos relacionados a etapas de produção
 */

export interface Etapa {
  id: string;
  nome: string;
  descricao?: string;
  unidade: string;
  ordem: number;
  ativa: boolean;
  criadoEm: string;
}

export interface CriarEtapaDTO {
  nome: string;
  descricao?: string;
  unidade: string;
  ordem: number;
}

export interface AtualizarEtapaDTO {
  nome?: string;
  descricao?: string;
  unidade?: string;
  ordem?: number;
  ativa?: boolean;
}
