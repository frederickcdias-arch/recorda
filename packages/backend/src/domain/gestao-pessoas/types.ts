// Tipos e interfaces para Gestão de Pessoas

export type PeriodoAusencia =
  | 'dia_completo'
  | 'meio_periodo_manha'
  | 'meio_periodo_tarde'
  | 'horas';
export type StatusAusencia = 'pendente' | 'aprovado' | 'rejeitado' | 'cancelado';
export type StatusFerias =
  | 'planejado'
  | 'solicitado'
  | 'aprovado'
  | 'em_gozo'
  | 'concluido'
  | 'cancelado';
export type TipoOcorrencia = 'advertencia_verbal' | 'advertencia_escrita' | 'suspensao' | 'elogio';
export type GravidadeOcorrencia = 'leve' | 'media' | 'grave';
export type TipoMudancaCargo = 'promocao' | 'rebaixamento' | 'transferencia' | 'ajuste_salarial';
export type StatusAvaliacao = 'rascunho' | 'finalizado' | 'revisado';
export type TipoBancoHoras = 'entrada' | 'saida' | 'ajuste';

export interface TipoAusencia {
  id: string;
  nome: string;
  descricao?: string;
  requerJustificativa: boolean;
  requerDocumento: boolean;
  descontaSalario: boolean;
  cor: string;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface Ausencia {
  id: string;
  usuarioId: string;
  tipoAusenciaId: string;
  dataInicio: Date;
  dataFim: Date;
  periodo: PeriodoAusencia;
  horasAusencia?: number;
  justificativa?: string;
  observacoes?: string;
  status: StatusAusencia;
  aprovadoPor?: string;
  aprovadoEm?: Date;
  motivoRejeicao?: string;
  documentoAnexo?: string;
  criadoPor: string;
  criadoEm: Date;
  atualizadoEm: Date;
  // Campos populados via JOIN
  usuario?: {
    id: string;
    nome: string;
    email: string;
  };
  tipoAusencia?: TipoAusencia;
  aprovador?: {
    id: string;
    nome: string;
  };
}

export interface BancoHoras {
  id: string;
  usuarioId: string;
  data: Date;
  horasExtras: number;
  horasDevidas: number;
  tipo: TipoBancoHoras;
  descricao?: string;
  aprovado: boolean;
  aprovadoPor?: string;
  aprovadoEm?: Date;
  criadoPor: string;
  criadoEm: Date;
  atualizadoEm: Date;
  // Campos populados via JOIN
  usuario?: {
    id: string;
    nome: string;
  };
}

export interface SaldoBancoHoras {
  usuarioId: string;
  usuarioNome: string;
  totalHorasExtras: number;
  totalHorasDevidas: number;
  saldoHoras: number;
}

export interface Ferias {
  id: string;
  usuarioId: string;
  periodoAquisitivoInicio: Date;
  periodoAquisitivoFim: Date;
  diasDireito: number;
  diasUtilizados: number;
  diasRestantes: number;
  dataInicio?: Date;
  dataFim?: Date;
  abonoPecuniario: boolean;
  diasAbono: number;
  status: StatusFerias;
  aprovadoPor?: string;
  aprovadoEm?: Date;
  observacoes?: string;
  criadoEm: Date;
  atualizadoEm: Date;
  // Campos populados via JOIN
  usuario?: {
    id: string;
    nome: string;
    email: string;
  };
}

export interface Ocorrencia {
  id: string;
  usuarioId: string;
  tipo: TipoOcorrencia;
  dataOcorrencia: Date;
  motivo: string;
  descricao?: string;
  medidasTomadas?: string;
  documentoAnexo?: string;
  gravidade?: GravidadeOcorrencia;
  registradoPor: string;
  cienciaFuncionario: boolean;
  dataCiencia?: Date;
  observacoes?: string;
  criadoEm: Date;
  atualizadoEm: Date;
  // Campos populados via JOIN
  usuario?: {
    id: string;
    nome: string;
  };
  registrador?: {
    id: string;
    nome: string;
  };
}

export interface HistoricoCargo {
  id: string;
  usuarioId: string;
  cargoAnterior?: string;
  cargoNovo: string;
  salarioAnterior?: number;
  salarioNovo?: number;
  dataEfetivacao: Date;
  tipoMudanca: TipoMudancaCargo;
  motivo?: string;
  departamento?: string;
  registradoPor: string;
  criadoEm: Date;
  // Campos populados via JOIN
  usuario?: {
    id: string;
    nome: string;
  };
}

export interface AvaliacaoDesempenho {
  id: string;
  usuarioId: string;
  avaliadorId: string;
  periodoInicio: Date;
  periodoFim: Date;
  notaGeral?: number;
  pontosFortes?: string;
  pontosMelhoria?: string;
  metasAtingidas?: string;
  metasProximas?: string;
  competencias?: Record<string, number>;
  observacoes?: string;
  status: StatusAvaliacao;
  dataAvaliacao?: Date;
  cienciaFuncionario: boolean;
  dataCiencia?: Date;
  criadoEm: Date;
  atualizadoEm: Date;
  // Campos populados via JOIN
  usuario?: {
    id: string;
    nome: string;
    email: string;
  };
  avaliador?: {
    id: string;
    nome: string;
  };
}

// DTOs para criação e atualização

export interface CriarAusenciaDTO {
  usuarioId: string;
  tipoAusenciaId: string;
  dataInicio: Date;
  dataFim: Date;
  periodo: PeriodoAusencia;
  horasAusencia?: number;
  justificativa?: string;
  observacoes?: string;
  documentoAnexo?: string;
}

export interface AtualizarAusenciaDTO {
  tipoAusenciaId?: string;
  dataInicio?: Date;
  dataFim?: Date;
  periodo?: PeriodoAusencia;
  horasAusencia?: number;
  justificativa?: string;
  observacoes?: string;
  documentoAnexo?: string;
}

export interface AprovarAusenciaDTO {
  aprovado: boolean;
  motivoRejeicao?: string;
}

export interface CriarBancoHorasDTO {
  usuarioId: string;
  data: Date;
  horasExtras?: number;
  horasDevidas?: number;
  tipo: TipoBancoHoras;
  descricao?: string;
}

export interface CriarFeriasDTO {
  usuarioId: string;
  periodoAquisitivoInicio: Date;
  periodoAquisitivoFim: Date;
  diasDireito?: number;
  dataInicio?: Date;
  dataFim?: Date;
  abonoPecuniario?: boolean;
  diasAbono?: number;
  observacoes?: string;
}

export interface AtualizarFeriasDTO {
  dataInicio?: Date;
  dataFim?: Date;
  abonoPecuniario?: boolean;
  diasAbono?: number;
  observacoes?: string;
  status?: StatusFerias;
}

export interface CriarOcorrenciaDTO {
  usuarioId: string;
  tipo: TipoOcorrencia;
  dataOcorrencia: Date;
  motivo: string;
  descricao?: string;
  medidasTomadas?: string;
  documentoAnexo?: string;
  gravidade?: GravidadeOcorrencia;
  observacoes?: string;
}

export interface CriarHistoricoCargoDTO {
  usuarioId: string;
  cargoAnterior?: string;
  cargoNovo: string;
  salarioAnterior?: number;
  salarioNovo?: number;
  dataEfetivacao: Date;
  tipoMudanca: TipoMudancaCargo;
  motivo?: string;
  departamento?: string;
}

export interface CriarAvaliacaoDTO {
  usuarioId: string;
  periodoInicio: Date;
  periodoFim: Date;
  notaGeral?: number;
  pontosFortes?: string;
  pontosMelhoria?: string;
  metasAtingidas?: string;
  metasProximas?: string;
  competencias?: Record<string, number>;
  observacoes?: string;
}

export interface AtualizarAvaliacaoDTO {
  notaGeral?: number;
  pontosFortes?: string;
  pontosMelhoria?: string;
  metasAtingidas?: string;
  metasProximas?: string;
  competencias?: Record<string, number>;
  observacoes?: string;
  status?: StatusAvaliacao;
}

// Filtros para consultas

export interface FiltrosAusencia {
  usuarioId?: string;
  tipoAusenciaId?: string;
  status?: StatusAusencia;
  dataInicio?: Date;
  dataFim?: Date;
  periodo?: PeriodoAusencia;
}

export interface FiltrosFerias {
  usuarioId?: string;
  status?: StatusFerias;
  periodoAquisitivoInicio?: Date;
  periodoAquisitivoFim?: Date;
}

export interface FiltrosOcorrencia {
  usuarioId?: string;
  tipo?: TipoOcorrencia;
  gravidade?: GravidadeOcorrencia;
  dataInicio?: Date;
  dataFim?: Date;
}

export interface FiltrosAvaliacao {
  usuarioId?: string;
  avaliadorId?: string;
  status?: StatusAvaliacao;
  periodoInicio?: Date;
  periodoFim?: Date;
}

// Relatórios e estatísticas

export interface ResumoAusencias {
  usuarioId: string;
  usuarioNome: string;
  tipoAusencia: string;
  totalAusencias: number;
  totalDias: number;
}

export interface EstatisticasRH {
  totalColaboradores: number;
  ausenciasHoje: number;
  ausenciasPendentes: number;
  feriasProgramadas: number;
  avaliacoesPendentes: number;
  ocorrenciasMes: number;
}

export interface RelatorioPresenca {
  usuarioId: string;
  usuarioNome: string;
  diasTrabalhados: number;
  diasAusentes: number;
  horasExtras: number;
  percentualPresenca: number;
}
