/**
 * Tipos relacionados a paginação
 */

export interface PaginationParams {
  pagina?: number;
  limite?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

export interface PaginatedColaboradores {
  colaboradores: unknown[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

export interface PaginatedEtapas {
  etapas: unknown[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

export interface PaginatedProcessos {
  processos: unknown[];
  total: number;
  pagina: number;
  totalPaginas: number;
}
