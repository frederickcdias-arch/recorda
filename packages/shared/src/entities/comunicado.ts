/**
 * Tipos relacionados a comunicados internos
 */

export type ComunicadoPrioridade = 'BAIXA' | 'MEDIA' | 'ALTA';

export type ComunicadoEscopoDestino = 'TODOS' | 'USUARIOS_ESPECIFICOS';

export type ComunicadoStatus = 'RASCUNHO' | 'PUBLICADO' | 'ENCERRADO';

export type ComunicadoTipo =
  | 'COMUNICADO_GERAL'
  | 'COMUNICADO_IMPORTANTE'
  | 'DECISAO_OPERACIONAL'
  | 'PADRONIZACAO'
  | 'SISTEMA'
  | 'TREINAMENTO'
  | 'BLOG_INTERNO';

export type ComunicadoCategoria =
  | 'PRODUCAO'
  | 'DIGITALIZACAO'
  | 'CONFERENCIA'
  | 'RECONFERENCIA'
  | 'QUALIDADE'
  | 'ADMINISTRATIVO'
  | 'SISTEMA'
  | 'GERAL';

export interface Comunicado {
  id: string;
  titulo: string;
  conteudo: string;
  prioridade: ComunicadoPrioridade;
  escopoDestino: ComunicadoEscopoDestino;
  tipo: ComunicadoTipo;
  categoria: ComunicadoCategoria;
  resumo: string | null;
  fixado: boolean;
  leituraObrigatoria: boolean;
  status: ComunicadoStatus;
  criadoPorUsuarioId: string;
  criadoEm: string;
  publicadoEm: string | null;
  encerradoEm: string | null;
  atualizadoEm: string;
}

export interface ComunicadoDestinatario {
  id: string;
  comunicadoId: string;
  usuarioId: string;
  lidoEm: string | null;
  entregueEm: string;
  criadoEm: string;
}
