/**
 * Tipos de API relacionados a ausências e justificativas.
 */

import type { PaginatedResponse } from './pagination.js';
import type { AusenciaPeriodo, AusenciaStatus, TipoAusencia } from '../entities/ausencia.js';

// ─── Admin endpoints ──────────────────────────────────────────────────────────

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

/** Admin cria ausência diretamente para um colaborador. */
export interface CriarAusenciaAdminDTO {
  usuarioId: string;
  tipoAusenciaId: string;
  dataInicio: string;
  dataFim: string;
  periodo: AusenciaPeriodo;
  horasAusencia?: number;
  justificativa?: string;
  observacoes?: string;
  /** 'pendente' (padrão) ou 'aprovado' (admin aprova diretamente). */
  status?: 'pendente' | 'aprovado';
}

export interface EditarAusenciaAdminDTO extends CriarAusenciaAdminDTO {}

export interface CancelarAusenciaAdminDTO {
  observacoes: string;
}

// ─── Colaborador endpoints ────────────────────────────────────────────────────

export interface ListarMinhasAusenciasParams {
  pagina?: number;
  limite?: number;
  status?: 'TODOS' | AusenciaStatus;
  dataInicio?: string;
  dataFim?: string;
  ordenacao?: 'mais-recentes' | 'mais-antigos';
}

/** Item de ausência no contexto do próprio colaborador. */
export interface MinhaAusenciaItem {
  id: string;
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

export interface ListarMinhasAusenciasResponse extends PaginatedResponse<MinhaAusenciaItem> {}

/** DTO legado — criação de ausência é exclusiva do admin (`CriarAusenciaAdminDTO`). */
export interface CriarAusenciaDTO {
  tipoAusenciaId: string;
  dataInicio: string;
  dataFim: string;
  periodo: AusenciaPeriodo;
  horasAusencia?: number;
  justificativa?: string;
  observacoes?: string;
}

export interface CancelarAusenciaDTO {
  motivo: string;
}

// ─── Tipos de ausência ────────────────────────────────────────────────────────

export interface ListarTiposAusenciaResponse {
  tipos: TipoAusencia[];
}

// ─── Relatório mensal de ausências ────────────────────────────────────────────

export interface RelatorioAusenciasParams {
  dataInicio?: string;
  dataFim?: string;
  colaboradorId?: string;
  tipoAusenciaId?: string;
  status?: 'TODOS' | AusenciaStatus;
}

export interface RelatorioAusenciasRow {
  id: string;
  usuarioId: string;
  colaboradorNome: string;
  tipoAusenciaId: string;
  tipoAusenciaNome: string;
  tipoAusenciaCor: string;
  dataInicio: string;
  dataFim: string;
  periodo: AusenciaPeriodo;
  horasAusencia?: string | null;
  status: AusenciaStatus;
  justificativa?: string | null;
  observacoes?: string | null;
  documentoAnexo?: string | null;
  aprovadoEm?: string | null;
  motivoRejeicao?: string | null;
  criadoEm: string;
  diasAusencia: number;
}

export interface RelatorioAusenciasResponse {
  registros: RelatorioAusenciasRow[];
  totais: {
    totalRegistros: number;
    totalPorStatus: Record<string, number>;
    totalPorTipo: Array<{ id: string; nome: string; cor: string; quantidade: number }>;
    totalPorColaborador: Array<{ id: string; nome: string; quantidade: number }>;
    diasAprovados: number;
    horasAprovadas: number;
  };
  filtros: {
    colaboradores: Array<{ id: string; nome: string }>;
    tipos: Array<{ id: string; nome: string; cor: string }>;
  };
}
