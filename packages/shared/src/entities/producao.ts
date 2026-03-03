/**
 * Tipos relacionados a produção
 */

export interface RegistroProducao {
  id: string;
  colaboradorId: string;
  etapaId: string;
  processoId?: string;
  volumeId?: string;
  quantidade: number;
  dataProducao: string;
  observacao?: string;
  fonteDadosId?: string;
  importacaoId?: string;
  criadoEm: string;
}

export interface CriarRegistroProducaoDTO {
  colaboradorId: string;
  etapaId: string;
  processoId?: string;
  volumeId?: string;
  quantidade: number;
  dataProducao: string;
  observacao?: string;
}

export type StatusImportacao = 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDA' | 'ERRO';

export interface Importacao {
  id: string;
  tipo: 'PLANILHA' | 'API' | 'CSV';
  status: StatusImportacao;
  arquivoOrigem?: string;
  totalRegistros: number;
  registrosProcessados: number;
  registrosSucesso: number;
  registrosErro: number;
  dataInicio: string;
  dataFim?: string;
  colaboradorId?: string;
}

export interface FonteDados {
  id: string;
  nome: string;
  tipo: 'API' | 'PLANILHA' | 'CSV';
  urlApi?: string;
  headersApi?: Record<string, string>;
  frequenciaSync?: string;
  configuracoes?: Record<string, unknown>;
  arquivoPlanilhaPath?: string;
  arquivoOcrPath?: string;
  mapeamentoColunas?: Record<string, string>;
  ativa: boolean;
  criadoEm: string;
}
