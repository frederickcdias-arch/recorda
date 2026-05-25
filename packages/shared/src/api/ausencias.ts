/**
 * Tipos de API relacionados a ausências e justificativas.
 */

import type { PaginatedResponse } from './pagination.js';
import type { AusenciaPeriodo, AusenciaStatus } from '../entities/ausencia.js';

export interface ListarAusenciasAdminParams {
  pagina?: number;
  limite?: number;
  busca?: string;
  status?: 'TODOS' | AusenciaStatus;
  tipoAusenciaId?: string;
  usuarioId?: string;
  dataInicio?: string;
  dataFim?: string;
  ordenacao?: 'mais-recentes' | 'mais-antigos';
}

export interface AusenciaAdminItem {
  id: string;
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
  tipoAusenciaId: string;
  tipoAusenciaNome: string;
  tipoAusenciaCor: string;
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

export interface ListarAusenciasAdminResponse extends PaginatedResponse<AusenciaAdminItem> {}

export interface AprovarAusenciaDTO {
  justificativa?: string;
}

export interface RejeitarAusenciaDTO {
  motivoRejeicao: string;
}
