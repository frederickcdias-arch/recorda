/**
 * Tipos de API relacionados a comunicados internos
 */

import type {
  Comunicado,
  ComunicadoCategoria,
  ComunicadoDestinatario,
  ComunicadoEscopoDestino,
  ComunicadoPrioridade,
  ComunicadoTipo,
} from '../entities/comunicado.js';

export interface CriarComunicadoDTO {
  titulo: string;
  conteudo: string;
  prioridade: ComunicadoPrioridade;
  escopoDestino: ComunicadoEscopoDestino;
  tipo?: ComunicadoTipo;
  categoria?: ComunicadoCategoria;
  resumo?: string | null;
  fixado?: boolean;
  leituraObrigatoria?: boolean;
}

export interface AtualizarComunicadoDTO {
  titulo?: string;
  conteudo?: string;
  prioridade?: ComunicadoPrioridade;
  escopoDestino?: ComunicadoEscopoDestino;
  tipo?: ComunicadoTipo;
  categoria?: ComunicadoCategoria;
  resumo?: string | null;
  fixado?: boolean;
  leituraObrigatoria?: boolean;
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
  tipo?: 'TODAS' | ComunicadoTipo;
  categoria?: 'TODAS' | ComunicadoCategoria;
  fixado?: 'TODAS' | 'SIM' | 'NAO';
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
