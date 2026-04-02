/**
 * Tipos operacionais compartilhados entre frontend e backend
 */

export type EtapaFluxo =
  | 'RECEBIMENTO'
  | 'PREPARACAO'
  | 'DIGITALIZACAO'
  | 'CONFERENCIA'
  | 'MONTAGEM'
  | 'CONTROLE_QUALIDADE'
  | 'ENTREGA';

export type StatusRepositorio =
  | 'RECEBIDO'
  | 'EM_PREPARACAO'
  | 'PREPARADO'
  | 'EM_DIGITALIZACAO'
  | 'DIGITALIZADO'
  | 'EM_CONFERENCIA'
  | 'CONFERIDO'
  | 'EM_MONTAGEM'
  | 'MONTADO'
  | 'AGUARDANDO_CQ_LOTE'
  | 'EM_CQ'
  | 'CQ_APROVADO'
  | 'CQ_REPROVADO'
  | 'EM_ENTREGA'
  | 'ENTREGUE';

export type ResultadoItemChecklist = 'CONFORME' | 'NAO_CONFORME_COM_TRATATIVA';

export type TipoExcecao = 'MIDIA' | 'COLORIDO' | 'MAPA' | 'FRAGILIDADE';

export type StatusTratativa = 'ABERTA' | 'EM_TRATATIVA' | 'RESOLVIDA';

export type ResultadoCQ = 'PENDENTE' | 'APROVADO' | 'REPROVADO';

export type TipoRelatorioOperacional =
  | 'RECEBIMENTO'
  | 'PRODUCAO'
  | 'ENTREGA'
  | 'CORRECAO'
  | 'DEVOLUCAO';

export type OrigemDocumentoRecebimento = 'MANUAL' | 'OCR' | 'LEGADO';

export type StatusChecklist = 'ABERTO' | 'EM_ANDAMENTO' | 'CONCLUIDO';

export type CategoriaConhecimento =
  | 'PROCEDIMENTO'
  | 'GLOSSARIO'
  | 'NORMAS_LEIS'
  | 'ATUALIZACOES_PROCESSO';
