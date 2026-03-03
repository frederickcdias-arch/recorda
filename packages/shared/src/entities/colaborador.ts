/**
 * Tipos relacionados a colaboradores
 */

export interface Colaborador {
  id: string;
  nome: string;
  matricula: string;
  email?: string;
  ativo: boolean;
  coordenadoriaId: string;
  coordenadoriaNome?: string;
  coordenadoriaSigla?: string;
  criadoEm: string;
}

export interface CriarColaboradorDTO {
  nome: string;
  matricula: string;
  email?: string;
  coordenadoriaId: string;
}

export interface AtualizarColaboradorDTO {
  nome?: string;
  matricula?: string;
  email?: string;
  coordenadoriaId?: string;
  ativo?: boolean;
}

export interface Coordenadoria {
  id: string;
  nome: string;
  sigla: string;
  ativa: boolean;
  criadoEm: string;
}
