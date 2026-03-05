/**
 * Type definitions for the complete report.
 * Used by PDF and Excel export services.
 * The actual report generation logic lives in infrastructure/http/routes/relatorios.ts
 */

export interface ProducaoEtapa {
  etapaId: string;
  etapaNome: string;
  unidade: string;
  ordem: number;
  quantidade: number;
}

export interface ProducaoColaborador {
  colaboradorId: string;
  colaboradorNome: string;
  matricula: string;
  etapas: ProducaoEtapa[];
  total: number;
}

export interface ProducaoCoordenadoria {
  coordenadoriaId: string;
  coordenadoriaNome: string;
  coordenadoriaSigla: string;
  colaboradores: ProducaoColaborador[];
  totaisPorEtapa: ProducaoEtapa[];
  totalGeral: number;
  totalCaixas: number;
  totalImagens: number;
}

export interface ResumoEtapa {
  etapaId: string;
  etapaNome: string;
  unidade: string;
  ordem: number;
  totalQuantidade: number;
  totalColaboradores: number;
  mediaPorColaborador: number;
}

export interface GlossarioItem {
  termo: string;
  definicao: string;
}

export interface RelatorioCompleto {
  titulo: string;
  periodo: {
    inicio: string;
    fim: string;
  };
  dataGeracao: string;
  resumoPorEtapa: ResumoEtapa[];
  producaoPorCoordenadoria: ProducaoCoordenadoria[];
  glossario: GlossarioItem[];
  totais: {
    totalGeral: number;
    totalCaixas: number;
    totalImagens: number;
    totalColaboradores: number;
    totalCoordenadorias: number;
    totalEtapas: number;
  };
}
