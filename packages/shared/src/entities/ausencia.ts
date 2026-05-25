/**
 * Tipos de ausência compartilhados entre frontend e backend.
 */

export type AusenciaStatus = 'pendente' | 'aprovado' | 'rejeitado' | 'cancelado';

export type AusenciaPeriodo =
  | 'dia_completo'
  | 'meio_periodo_manha'
  | 'meio_periodo_tarde'
  | 'horas';

export interface TipoAusencia {
  id: string;
  nome: string;
  descricao?: string;
  requerJustificativa: boolean;
  requerDocumento: boolean;
  descontaSalario: boolean;
  cor: string;
  ativo: boolean;
}

export interface Ausencia {
  id: string;
  usuarioId: string;
  tipoAusenciaId: string;
  dataInicio: string;
  dataFim: string;
  periodo: AusenciaPeriodo;
  horasAusencia?: string | null;
  justificativa?: string | null;
  observacoes?: string | null;
  status: AusenciaStatus;
  aprovadoPor?: string | null;
  aprovadoEm?: string | null;
  motivoRejeicao?: string | null;
  documentoAnexo?: string | null;
  criadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
}
