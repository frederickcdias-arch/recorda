/**
 * Tipos de resposta da API
 */

export interface ApiError {
  error: string;
  code?: string;
  details?: string;
}

export interface ApiSuccess {
  message: string;
}

export interface DashboardStats {
  producaoTotal: number;
  producaoTrend: string;
  processosAtivos: number;
  processosNovosHoje: number;
  recebimentosPendentes: number;
  colaboradoresAtivos: number;
}

export interface DashboardData {
  stats: DashboardStats;
  producaoPorEtapa: { etapa: string; valor: number; cor: string }[];
  statusRecebimento: { status: string; valor: number; icon: string; cor: string }[];
  alertas: { tipo: 'info' | 'warning' | 'error'; titulo: string; descricao: string }[];
}

export interface OCRResponse {
  sucesso: boolean;
  dados: {
    protocolo: string | null;
    interessado: string | null;
    setor: string | null;
    data: string | null;
    confianca: number;
    textoCompleto?: string;
  };
  tempoProcessamento?: number;
  mensagem: string;
}

export interface RelatorioProducao {
  periodo: { inicio: string; fim: string };
  totais: {
    totalGeral: number;
    totalColaboradores: number;
    totalCoordenadorias: number;
  };
  resumoPorEtapa: { etapa: string; quantidade: number }[];
  colaboradores: {
    nome: string;
    coordenadoria: string;
    etapas: { etapa: string; quantidade: number }[];
    total: number;
  }[];
}
