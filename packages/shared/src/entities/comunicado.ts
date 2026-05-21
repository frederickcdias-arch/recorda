/**
 * Tipos relacionados a comunicados internos
 */

export type ComunicadoPrioridade = 'BAIXA' | 'MEDIA' | 'ALTA';

export type ComunicadoEscopoDestino = 'TODOS' | 'USUARIOS_ESPECIFICOS';

export type ComunicadoStatus = 'RASCUNHO' | 'PUBLICADO' | 'ENCERRADO';

export interface Comunicado {
  id: string;
  titulo: string;
  conteudo: string;
  prioridade: ComunicadoPrioridade;
  escopoDestino: ComunicadoEscopoDestino;
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
