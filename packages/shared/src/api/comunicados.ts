/**
 * Tipos de API relacionados a comunicados internos
 */

import type {
  Comunicado,
  ComunicadoDestinatario,
  ComunicadoEscopoDestino,
  ComunicadoPrioridade,
} from '../entities/comunicado.js';

export interface CriarComunicadoDTO {
  titulo: string;
  conteudo: string;
  prioridade: ComunicadoPrioridade;
  escopoDestino: ComunicadoEscopoDestino;
}

export interface PublicarComunicadoDTO {
  usuarioIds?: string[];
}

export interface ListarComunicadosAdminParams {
  pagina?: number;
  limite?: number;
  busca?: string;
  status?: 'TODOS' | 'RASCUNHO' | 'PUBLICADO' | 'ENCERRADO';
  escopo?: 'QUALQUER' | ComunicadoEscopoDestino;
  prioridade?: 'TODAS' | ComunicadoPrioridade;
  dataInicio?: string;
  dataFim?: string;
  publicadoEm?: string;
  ordenacao?: 'mais-recentes' | 'mais-antigos' | 'mais-pendentes' | 'mais-lidos';
}

export interface ComunicadoAdminResumo extends Comunicado {
  totalDestinatarios: number;
  totalLidos: number;
}

export interface ComunicadoAdminDestinatarioItem {
  destinatario: ComunicadoDestinatario;
  usuarioNome: string;
  usuarioEmail: string;
  usuarioAtivo: boolean;
}

export interface ComunicadoAdminDetalhe extends ComunicadoAdminResumo {
  destinatarios: ComunicadoAdminDestinatarioItem[];
}

export interface ComunicadoUsuarioItem extends Comunicado {
  destinatario: ComunicadoDestinatario;
}

export interface ListarComunicadosAdminResponse {
  comunicados: ComunicadoAdminResumo[];
  total: number;
  pagina: number;
  totalPaginas: number;
  resumo: {
    totalFiltrados: number;
    rascunhos: number;
    publicados: number;
    encerrados: number;
    pendenciasLeitura: number;
    prioridadeAlta: number;
    prioridadeMedia: number;
    prioridadeBaixa: number;
  };
}

export interface ObterComunicadoAdminResponse {
  comunicado: ComunicadoAdminDetalhe;
}

export interface ListarComunicadosUsuarioResponse {
  comunicados: ComunicadoUsuarioItem[];
  totalNaoLidos: number;
}

export interface MarcarComunicadoLidoResponse {
  message: string;
  comunicadoId: string;
  lidoEm: string;
}

export interface ExcluirComunicadoResponse {
  message: string;
  comunicadoId: string;
  destinatariosRemovidos: number;
}
