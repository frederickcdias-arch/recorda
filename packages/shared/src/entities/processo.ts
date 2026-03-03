/**
 * Tipos relacionados a processos
 */

export type StatusProcesso = 'ATIVO' | 'ARQUIVADO' | 'SUSPENSO' | 'CONCLUIDO';

export interface Processo {
  id: string;
  numero: string;
  interessado?: string;
  assunto?: string;
  status: StatusProcesso;
  dataEntrada: string;
  criadoEm: string;
  atualizadoEm?: string;
}

export interface Volume {
  id: string;
  processoId: string;
  numero: string;
  descricao?: string;
  criadoEm: string;
}

export interface Apenso {
  id: string;
  processoPrincipalId: string;
  processoApensoId: string;
  dataApensamento: string;
  observacao?: string;
}

export interface CriarProcessoDTO {
  numero: string;
  interessado?: string;
  assunto?: string;
}

export interface AtualizarProcessoDTO {
  numero?: string;
  interessado?: string;
  assunto?: string;
  status?: StatusProcesso;
}
