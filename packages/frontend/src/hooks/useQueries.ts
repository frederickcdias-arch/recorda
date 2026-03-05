import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { StatusRepositorio, EtapaFluxo } from '@recorda/shared';

export { useQueryClient } from '@tanstack/react-query';

// ─── Types ───────────────────────────────────────────────────

export interface DashboardData {
  stats: {
    producaoTotal: number;
    producaoTrend: string;
    processosAtivos: number;
    processosNovosHoje: number;
    colaboradoresAtivos: number;
  };
  producaoPorEtapa: { etapa: string; valor: number }[];
  statusRecebimento: { status: string; valor: number; icon: string }[];
  alertas: { tipo: 'info' | 'warning' | 'error'; titulo: string; descricao: string }[];
  backlogPorEtapa?: { etapa: string; total: number }[];
  tempoMedioPorEtapa?: { etapa: string; mediaHoras: number }[];
  retrabalhoCQ?: { motivo: string; total: number; repositorios: string }[];
}

export interface RepositorioItem {
  id_repositorio_recorda: string;
  id_repositorio_ged: string;
  orgao: string;
  projeto: string;
  status_atual: StatusRepositorio;
  etapa_atual: string;
  data_criacao: string;
  seadesk_confirmado_em?: string | null;
}

interface PaginatedResponse<T> {
  itens: T[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

export interface SelectOption {
  id: string;
  nome: string;
}

// ─── Query Keys ──────────────────────────────────────────────

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  repositorios: (params: Record<string, string | number>) =>
    ['repositorios', params] as const,
  repositoriosAll: ['repositorios'] as const,
  setoresRecebimento: ['setores-recebimento'] as const,
  orgaosRecebimento: ['orgaos-recebimento'] as const,
  projetosConfiguracao: ['configuracao-projetos'] as const,
  classificacoesRecebimento: ['classificacoes-recebimento'] as const,
  avulsos: (params: Record<string, string | number>) =>
    ['avulsos', params] as const,
  avulsosAll: ['avulsos'] as const,
  empresa: ['empresa'] as const,
  usuarios: ['usuarios'] as const,
  coordenadorias: ['coordenadorias'] as const,
  auditoria: (params: Record<string, string | number>) =>
    ['auditoria', params] as const,
  producao: (params: Record<string, string | number>) =>
    ['producao', params] as const,
  producaoAll: ['producao'] as const,
  conhecimentoDocs: (params: Record<string, string>) =>
    ['conhecimento-docs', params] as const,
  conhecimentoDocsAll: ['conhecimento-docs'] as const,
  conhecimentoDetalhe: (id: string) =>
    ['conhecimento-detalhe', id] as const,
  glossario: ['glossario'] as const,
  leisNormas: ['leis-normas'] as const,
  importacoesHistorico: ['importacoes-historico'] as const,
  fontesImportacao: ['fontes-importacao'] as const,
  recebimentoProcessos: (repoId: string) =>
    ['recebimento-processos', repoId] as const,
  recebimentoProcessosAll: ['recebimento-processos'] as const,
  checklistsRepo: (repoId: string, etapa: string, ativo?: boolean) =>
    ['checklists-repo', repoId, etapa, ativo ?? 'all'] as const,
  checklistDetalhe: (id: string) =>
    ['checklist-detalhe', id] as const,
  documentosRecebimento: (repoId: string) =>
    ['documentos-recebimento', repoId] as const,
  lotesCQ: ['lotes-cq'] as const,
  loteCQDetalhe: (id: string) =>
    ['lote-cq-detalhe', id] as const,
  cqAvaliacoes: (repoId: string) =>
    ['cq-avaliacoes', repoId] as const,
};

// ─── Hooks ───────────────────────────────────────────────────

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.get<DashboardData>('/dashboard'),
    staleTime: 60_000,
  });
}

export function useRepositoriosRecebimento() {
  return useQuery({
    queryKey: [...queryKeys.repositoriosAll, 'recebimento-options'] as const,
    queryFn: () =>
      api.get<{ itens: { id_repositorio_recorda: string; id_repositorio_ged: string; orgao: string; projeto: string }[] }>(
        '/operacional/repositorios?etapa=RECEBIMENTO&limite=100&pagina=1',
      ),
    select: (data) => data.itens ?? [],
    staleTime: 30_000,
  });
}

export function useRepositorios(params: {
  etapa?: string;
  status?: string;
  busca?: string;
  pagina?: number;
  limite?: number;
}) {
  const { etapa, status, busca, pagina = 1, limite = 50 } = params;
  const queryParams: Record<string, string | number> = { pagina, limite };
  if (etapa) queryParams.etapa = etapa;
  if (status) queryParams.status = status;
  if (busca) queryParams.busca = busca;

  return useQuery({
    queryKey: queryKeys.repositorios(queryParams),
    queryFn: () => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(queryParams)) {
        qs.set(k, String(v));
      }
      return api.get<PaginatedResponse<RepositorioItem>>(
        `/operacional/repositorios?${qs.toString()}`
      );
    },
  });
}

export function useSetoresRecebimento() {
  return useQuery({
    queryKey: queryKeys.setoresRecebimento,
    queryFn: () =>
      api.get<{ itens: SelectOption[] }>('/operacional/setores-recebimento'),
    staleTime: 5 * 60_000,
    select: (data) => data.itens ?? [],
  });
}

export function useClassificacoesRecebimento() {
  return useQuery({
    queryKey: queryKeys.classificacoesRecebimento,
    queryFn: () =>
      api.get<{ itens: SelectOption[] }>('/operacional/classificacoes-recebimento'),
    staleTime: 5 * 60_000,
    select: (data) => data.itens ?? [],
  });
}

export function useOrgaosRecebimento() {
  return useQuery({
    queryKey: queryKeys.orgaosRecebimento,
    queryFn: () =>
      api.get<{ itens: SelectOption[] }>('/operacional/orgaos-recebimento'),
    staleTime: 5 * 60_000,
    select: (data) => data.itens ?? [],
  });
}

export function useProjetosConfiguracao() {
  return useQuery({
    queryKey: queryKeys.projetosConfiguracao,
    queryFn: () =>
      api.get<{ projetos: Array<{ id: string; nome: string; ativo: boolean }> }>('/configuracao/projetos'),
    staleTime: 5 * 60_000,
    select: (data) => (data.projetos ?? []).filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome })),
  });
}

export function useCreateProjetoConfiguracao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { nome: string; descricao?: string; ativo?: boolean }) =>
      api.post('/configuracao/projetos', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.projetosConfiguracao });
    },
  });
}

// ─── Mutation Hooks ─────────────────────────────────────────

export function useCreateRepositorio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { idRepositorioGed: string; orgao: string; projeto: string; classificacaoId: string }) =>
      api.post('/operacional/repositorios', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
    },
  });
}

export function useDeleteRepositorio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/operacional/repositorios/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
    },
  });
}

export function useAvancarEtapa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, etapaDestino, statusDestino }: { id: string; etapaDestino: string; statusDestino: string }) =>
      api.patch(`/operacional/repositorios/${id}/avancar`, { etapaDestino, statusDestino }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

// ─── Config Mutations ────────────────────────────────────────

export function useSaveEmpresa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: object) => api.put('/configuracao/empresa', config),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.empresa }),
  });
}

export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => api.post<{ logoUrl: string }>('/configuracao/empresa/logo', formData),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.empresa }),
  });
}

export function useRemoveLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/configuracao/empresa/logo'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.empresa }),
  });
}

export function useRegisterUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; nome: string; senha: string; perfil: string }) =>
      api.post('/auth/register', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.usuarios }),
  });
}

export function useToggleUsuarioAtivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/auth/usuarios/${id}/toggle-ativo`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.usuarios }),
  });
}

export function useDeleteProducao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/producao/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.producaoAll }),
  });
}

export function useLimparProducoes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ message: string; removidos: number }>('/producao'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.producaoAll });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

// ─── Operacional Mutations ───────────────────────────────────

export function useBatchProcessos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, processos }: { repoId: string; processos: object[] }) =>
      api.post(`/operacional/repositorios/${repoId}/recebimento-processos/batch`, { processos }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.repositoriosAll }),
  });
}

export function useRegistrarProducao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, etapa, checklistId, quantidade }: { repoId: string; etapa: string; checklistId: string; quantidade: number }) =>
      api.post(`/operacional/repositorios/${repoId}/producao`, { etapa, checklistId, quantidade }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useGerarRelatorioRecebimento() {
  return useMutation({
    mutationFn: async (repositorioIds: string[]) => {
      const report = await api.post<{ id: string }>('/operacional/relatorio-recebimento', { repositorioIds });
      return report;
    },
  });
}

export function useGerarRelatorioProducao() {
  return useMutation({
    mutationFn: async (repositorioId: string) => {
      const report = await api.post<{ id: string }>(`/operacional/repositorios/${repositorioId}/relatorio-producao`);
      await api.download(`/api/operacional/relatorios/${report.id}/download`, `relatorio-producao-${repositorioId}.pdf`);
    },
  });
}

export function useCriarChecklist() {
  return useMutation({
    mutationFn: ({ repoId, etapa }: { repoId: string; etapa: string }) =>
      api.post<{ id: string }>(`/operacional/repositorios/${repoId}/checklists`, { etapa }),
  });
}

export function useSalvarItemChecklist() {
  return useMutation({
    mutationFn: ({ checklistId, modeloId, resultado, observacao }: { checklistId: string; modeloId: string; resultado: string; observacao: string }) =>
      api.post(`/operacional/checklists/${checklistId}/itens`, { modeloId, resultado, observacao }),
  });
}

export function useConcluirChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ checklistId, observacao, itens }: {
      checklistId: string;
      observacao?: string;
      itens?: Array<{ modeloId: string; resultado: string; observacao?: string }>;
    }) =>
      api.post(`/operacional/checklists/${checklistId}/concluir`, { observacao: observacao ?? '', itens }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.repositoriosAll }),
  });
}

export function useCriarLoteCQ() {
  return useMutation({
    mutationFn: ({ codigo, repositorioIds }: { codigo?: string; repositorioIds: string[] }) =>
      api.post<{ id: string; codigo: string }>('/operacional/lotes-cq', { codigo, repositorioIds }),
  });
}

export function useAvaliarItemCQ() {
  return useMutation({
    mutationFn: ({ loteId, itemId, resultado, motivoCodigo }: { loteId: string; itemId: string; resultado: string; motivoCodigo?: string }) =>
      api.patch(`/operacional/lotes-cq/${loteId}/itens/${itemId}`, {
        resultado,
        motivoCodigo: resultado === 'REPROVADO' ? (motivoCodigo || 'NAO_CONFORME') : undefined,
      }),
  });
}

export function useFecharLoteCQ() {
  return useMutation({
    mutationFn: (loteId: string) => api.post(`/operacional/lotes-cq/${loteId}/fechar`),
  });
}

export function useGerarRelatorioEntregaCQ() {
  return useMutation({
    mutationFn: (loteId: string) =>
      api.post<{ id: string; arquivo_path: string; hash_arquivo: string }>(`/operacional/lotes-cq/${loteId}/relatorio-entrega`),
  });
}

export function useAvaliarDocumentoCQ() {
  return useMutation({
    mutationFn: ({ repoId, processoId, resultado, observacao }: { repoId: string; processoId: string; resultado: string; observacao?: string }) =>
      api.put(`/operacional/repositorios/${repoId}/cq-avaliacoes/${processoId}`, { resultado, observacao }),
  });
}

export function useAprovarTodosCQ() {
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<{ total: number }>(`/operacional/repositorios/${repoId}/cq-aprovar-todos`),
  });
}

export function useConcluirCQ() {
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<{ status: string; total: number; reprovados: number }>(`/operacional/repositorios/${repoId}/cq-concluir`),
  });
}

export function useDevolverCQ() {
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post(`/operacional/repositorios/${repoId}/cq-retornar-recebimento`),
  });
}

export function useGerarTermoCorrecao() {
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<{ id: string; arquivo_path: string }>(`/operacional/repositorios/${repoId}/termo-correcao`),
  });
}

export function useGerarTermoDevolucao() {
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<{ id: string; arquivo_path: string }>(`/operacional/repositorios/${repoId}/termo-devolucao`),
  });
}

export function useGerarTermoDevolucaoMulti() {
  return useMutation({
    mutationFn: (repositorioIds: string[]) =>
      api.post<{ id: string }>('/operacional/termo-devolucao', { repositorioIds }),
  });
}

export function useCriarDocConhecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { codigo: string; titulo: string; categoria: string; descricao: string; nivelAcesso: string; conteudo: string; resumoAlteracao: string; etapas: string[] }) =>
      api.post('/operacional/conhecimento/documentos', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.conhecimentoDocsAll }),
  });
}

export function useCriarVersaoConhecimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, conteudo, resumoAlteracao }: { docId: string; conteudo: string; resumoAlteracao: string }) =>
      api.post(`/operacional/conhecimento/documentos/${docId}/versoes`, { conteudo, resumoAlteracao }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.conhecimentoDocsAll });
    },
  });
}

export function useImportarRecebimentoLegado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { usuarioId: string; registros: object[] }) =>
      api.post<{ importacaoId: string; totalRegistros: number; registrosSucesso: number; registrosErro: number; erros: { linha: number; idRepositorioGed: string; erro: string }[] }>(
        '/operacional/importacoes-legado/recebimento', payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.importacoesHistorico }),
  });
}

export function useImportarProducaoLegado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { usuarioId?: string; etapa?: string; registros: object[] }) =>
      api.post<{ importacaoId: string; totalRegistros: number; registrosSucesso: number; registrosErro: number; inseridos?: number; atualizados?: number; ignorados?: number; duplicados?: number; erros: { linha: number; idRepositorioGed: string; erro: string }[] }>(
        '/operacional/importacoes-legado/producao', payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.importacoesHistorico });
      void qc.invalidateQueries({ queryKey: queryKeys.producaoAll });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function usePreviewImportacaoProducaoLegado() {
  return useMutation({
    mutationFn: (payload: { usuarioId?: string; etapa?: string; registros: object[] }) =>
      api.post<{
        totalRegistros: number;
        registrosValidos: number;
        duplicadasPlanilha: number[];
        duplicadasBanco: number[];
        linhasInvalidas: { linha: number; erro: string }[];
        impacto: { inseridosPrevistos: number; atualizadosPrevistos: number; ignoradosPrevistos: number; invalidos: number };
      }>('/operacional/importacoes-legado/producao/preview', payload),
  });
}

export function useRollbackImportacaoLegado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ message: string; removidos: number; restaurados: number; hashesRemovidos: number }>(`/operacional/importacoes-legado/${id}/rollback`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.importacoesHistorico });
      void qc.invalidateQueries({ queryKey: queryKeys.producaoAll });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useValidarDuplicidadesLegado() {
  return useMutation({
    mutationFn: (payload: { tipo: string; registros: object[]; etapa?: string }) =>
      api.post<{ totalRegistros: number; duplicadasPlanilha: number[]; duplicadasBanco: number[]; todasDuplicadas: number[]; registrosValidos: number }>(
        '/operacional/importacoes-legado/validar', payload),
  });
}

export function useFetchSheets() {
  return useMutation({
    mutationFn: (url: string) =>
      api.post<{ csv: string; url: string }>('/operacional/importacoes-legado/fetch-sheets', { url }),
  });
}

// ─── Fontes de Importação ─────────────────────────────────────
interface FonteImportacao {
  id: string; nome: string; url: string; tipo: string;
  criado_em: string; ultima_importacao_em: string | null;
}
interface ImportarFonteResult {
  fonte: string; totalPlanilha: number; importados: number;
  duplicados: number; erros: number; detalhesErros: { linha: number; erro: string }[];
}

export function useFontesImportacao() {
  return useQuery({
    queryKey: queryKeys.fontesImportacao,
    queryFn: () => api.get<{ fontes: FonteImportacao[] }>('/operacional/fontes-importacao'),
    select: (data) => data.fontes,
  });
}

export function useCriarFonteImportacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { nome: string; url: string }) =>
      api.post<{ id: string }>('/operacional/fontes-importacao', payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.fontesImportacao }),
  });
}

export function useExcluirFonteImportacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/operacional/fontes-importacao/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.fontesImportacao }),
  });
}

export function useImportarFonte() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ImportarFonteResult>(`/operacional/fontes-importacao/${id}/importar`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.fontesImportacao });
      void qc.invalidateQueries({ queryKey: queryKeys.importacoesHistorico });
      void qc.invalidateQueries({ queryKey: queryKeys.producaoAll });
    },
  });
}

export function useImportarTodasFontes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{
      total: number;
      resultados: Array<{ fonte: string; importados: number; duplicados: number; erros: number; sucesso: boolean }>;
      resumo: { importados: number; duplicados: number; erros: number };
    }>('/operacional/fontes-importacao/importar-todas'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.fontesImportacao });
      void qc.invalidateQueries({ queryKey: queryKeys.importacoesHistorico });
      void qc.invalidateQueries({ queryKey: queryKeys.producaoAll });
    },
  });
}

export function useLimparImportacoesLegado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ mensagem: string; removidos: Record<string, number> }>('/operacional/importacoes-legado/limpar'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.importacoesHistorico });
      void qc.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
      void qc.invalidateQueries({ queryKey: queryKeys.producaoAll });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useCriarSetorRecebimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nome: string) => api.post<{ id: string; nome: string }>('/operacional/setores-recebimento', { nome }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.setoresRecebimento }),
  });
}

export function useCriarOrgaoRecebimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nome: string) => api.post<{ id: string; nome: string }>('/operacional/orgaos-recebimento', { nome }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.orgaosRecebimento }),
  });
}

export function useCriarClassificacaoRecebimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nome: string) => api.post<{ id: string; nome: string }>('/operacional/classificacoes-recebimento', { nome }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.classificacoesRecebimento }),
  });
}

export function useOcrPreview() {
  return useMutation({
    mutationFn: ({ repoId, imagemBase64 }: { repoId: string; imagemBase64: string }) =>
      api.post<{ protocolo: string; interessado: string; textoExtraido: string; confianca: number }>(`/operacional/repositorios/${repoId}/ocr-preview`, { imagemBase64 }),
  });
}

export function useOcrPreviewAvulso() {
  return useMutation({
    mutationFn: (imagemBase64: string) =>
      api.post<{ protocolo: string; interessado: string; confianca: number }>('/operacional/recebimento-avulsos/ocr-preview', { imagemBase64 }),
  });
}

export function useCriarProcessoAvulso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: object) => api.post('/operacional/recebimento-avulsos', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.avulsosAll }),
  });
}

export function useCriarProcessoRecebimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, ...body }: { repoId: string; protocolo: string; interessado: string; setorId?: string; volumeAtual: number; volumeTotal: number; origem: string; ocrConfianca?: number | null; textoExtraido?: string; imagemBase64?: string }) =>
      api.post(`/operacional/repositorios/${repoId}/recebimento-processos`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
      void qc.invalidateQueries({ queryKey: queryKeys.recebimentoProcessosAll });
    },
  });
}

export function useExcluirProcessoRecebimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (processoId: string) => api.delete(`/operacional/recebimento-processos/${processoId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
      void qc.invalidateQueries({ queryKey: queryKeys.recebimentoProcessosAll });
    },
  });
}

export function useCriarApenso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ processoId, ...body }: { processoId: string; protocolo: string; interessado?: string; volumeAtual: number; volumeTotal: number; origem: string; ocrConfianca?: number | null; textoExtraido?: string; imagemBase64?: string }) =>
      api.post(`/operacional/recebimento-processos/${processoId}/apensos`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
      void qc.invalidateQueries({ queryKey: queryKeys.recebimentoProcessosAll });
    },
  });
}

export function useExcluirApenso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (apensoId: string) => api.delete(`/operacional/recebimento-apensos/${apensoId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
      void qc.invalidateQueries({ queryKey: queryKeys.recebimentoProcessosAll });
    },
  });
}

export function useVincularProcessos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { processoIds: string[]; repositorioId: string }) =>
      api.patch<{ vinculados: number }>('/operacional/recebimento-processos/vincular', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.avulsosAll });
      void qc.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
    },
  });
}

// ─── Configurações Queries ──────────────────────────────────

export function useEmpresa() {
  return useQuery({
    queryKey: queryKeys.empresa,
    queryFn: () => api.get<{
      nome?: string;
      cnpj?: string;
      endereco?: string;
      telefone?: string;
      email?: string;
      logoUrl?: string;
      exibirLogoRelatorio?: boolean;
      exibirEnderecoRelatorio?: boolean;
      exibirContatoRelatorio?: boolean;
      logoLarguraRelatorio?: number;
      logoAlinhamentoRelatorio?: 'ESQUERDA' | 'CENTRO' | 'DIREITA';
      logoDeslocamentoYRelatorio?: number;
    }>('/configuracao/empresa'),
    staleTime: 5 * 60_000,
  });
}

export function useUsuarios() {
  return useQuery({
    queryKey: queryKeys.usuarios,
    queryFn: () => api.get<{ usuarios: { id: string; email: string; nome: string; papel: string; ativo: boolean; criado_em: string }[] }>('/auth/usuarios'),
    staleTime: 60_000,
  });
}

export function useCoordenadorias() {
  return useQuery({
    queryKey: queryKeys.coordenadorias,
    queryFn: () => api.get<{ id: string; nome: string; sigla: string }[]>('/coordenadorias'),
    staleTime: 5 * 60_000,
  });
}

export function useRecebimentoProcessos(repoId: string | null) {
  return useQuery({
    queryKey: queryKeys.recebimentoProcessos(repoId ?? ''),
    queryFn: () =>
      api.get<{ processos: { id: string; protocolo: string; interessado: string; setor_id: string | null; setor_nome: string | null; classificacao_id: string | null; classificacao_nome: string | null; volume_atual: number; volume_total: number; numero_caixas: number; caixa_nova: boolean; origem: string; ocr_confianca?: number | null; criado_em: string; apensos: { id: string; protocolo: string; interessado: string | null; volume_atual: number; volume_total: number; origem: string; criado_em: string }[] }[] }>(
        `/operacional/repositorios/${repoId}/recebimento-processos`,
      ),
    enabled: !!repoId,
    select: (data) => data.processos ?? [],
  });
}

export function useAvulsos(params: { busca?: string; pagina?: number; limite?: number }) {
  const { busca, pagina = 1, limite = 50 } = params;
  const queryParams: Record<string, string | number> = { pagina, limite };
  if (busca) queryParams.busca = busca;

  return useQuery({
    queryKey: queryKeys.avulsos(queryParams),
    queryFn: () => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(queryParams)) qs.set(k, String(v));
      return api.get<{ processos: { id: string; protocolo: string; interessado: string; setor_id: string | null; setor_nome: string | null; classificacao_id: string | null; classificacao_nome: string | null; volume_atual: number; volume_total: number; numero_caixas: number; caixa_nova: boolean; origem: string; ocr_confianca?: number | null; observacao: string; criado_em: string; apensos: { id: string; protocolo: string; interessado: string | null; volume_atual: number; volume_total: number; origem: string; criado_em: string }[] }[]; totalPaginas?: number }>(
        `/operacional/recebimento-avulsos?${qs.toString()}`,
      );
    },
  });
}

// ─── Auditoria ──────────────────────────────────────────────

export function useAuditoria(params: {
  pagina?: number; limite?: number; tabela?: string; operacao?: string;
  dataInicio?: string; dataFim?: string;
}) {
  const { pagina = 1, limite = 50, tabela, operacao, dataInicio, dataFim } = params;
  const queryParams: Record<string, string | number> = { pagina, limite };
  if (tabela) queryParams.tabela = tabela;
  if (operacao) queryParams.operacao = operacao;
  if (dataInicio) queryParams.dataInicio = dataInicio;
  if (dataFim) queryParams.dataFim = dataFim;

  return useQuery({
    queryKey: queryKeys.auditoria(queryParams),
    queryFn: () => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(queryParams)) qs.set(k, String(v));
      return api.get<{
        logs: { id: string; tabela: string; operacao: string; registro_id: string; dados_antigos?: Record<string, unknown>; dados_novos?: Record<string, unknown>; usuario_id?: string; criado_em: string }[];
        totalPaginas: number;
      }>(`/auditoria?${qs.toString()}`);
    },
  });
}

// ─── Produção ───────────────────────────────────────────────

export function useProducao(params: {
  pagina?: number; limite?: number; etapa?: string; colaborador?: string;
  origem?: string; dataInicio?: string; dataFim?: string; busca?: string;
}) {
  const { pagina = 1, limite = 25, etapa, colaborador, origem, dataInicio, dataFim, busca } = params;
  const queryParams: Record<string, string | number> = { pagina, limite };
  if (etapa) queryParams.etapa = etapa;
  if (colaborador) queryParams.colaborador = colaborador;
  if (origem) queryParams.origem = origem;
  if (dataInicio) queryParams.dataInicio = dataInicio;
  if (dataFim) queryParams.dataFim = dataFim;
  if (busca) queryParams.busca = busca;

  return useQuery({
    queryKey: queryKeys.producao(queryParams),
    queryFn: () => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(queryParams)) qs.set(k, String(v));
      return api.get<{
        registros: { id: string; quantidade: number; data_producao: string; etapa: string; tipo: string; origem_marcador: string; coordenadoria_marcador: string; funcao: string; colaborador_id: string; colaborador_nome: string; repositorio_ged: string; projeto: string; origem: 'LEGADO' | 'FLUXO'; coordenadoria_sigla: string }[];
        total: number; pagina: number; limite: number; totalPaginas: number;
        filtros: { colaboradores: { id: string; nome: string }[]; etapas: string[] };
      }>(`/operacional/producao?${qs.toString()}`);
    },
  });
}

// ─── Conhecimento Operacional ───────────────────────────────

export function useConhecimentoDocs(params: { busca?: string; categoria?: string; etapa?: string }) {
  const { busca, categoria, etapa } = params;
  const queryParams: Record<string, string> = {};
  if (busca?.trim()) queryParams.busca = busca.trim();
  if (categoria) queryParams.categoria = categoria;
  if (etapa) queryParams.etapa = etapa;

  return useQuery({
    queryKey: queryKeys.conhecimentoDocs(queryParams),
    queryFn: () => {
      const qs = new URLSearchParams(queryParams);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return api.get<{
        itens: { id: string; codigo: string; titulo: string; categoria: 'MANUAIS' | 'PROCEDIMENTOS_ETAPA' | 'CHECKLISTS_EXPLICADOS' | 'GLOSSARIO' | 'NORMAS_LEIS' | 'ATUALIZACOES_PROCESSO'; descricao: string; status: 'ATIVO' | 'INATIVO'; nivel_acesso: 'OPERADOR_ADMIN' | 'ADMIN'; versao_atual: number; etapas: EtapaFluxo[] }[];
      }>(`/operacional/conhecimento/documentos${suffix}`).then((data) => ({
        ...data,
        itens: (data.itens ?? []).map((item) => ({
          ...item,
          etapas: normalizeEtapas(item.etapas),
        })),
      }));
    },
  });
}

export function useConhecimentoDetalhe(id: string | null) {
  return useQuery({
    queryKey: queryKeys.conhecimentoDetalhe(id ?? ''),
    queryFn: () => api.get<{
      documento: { id: string; codigo: string; titulo: string; categoria: 'MANUAIS' | 'PROCEDIMENTOS_ETAPA' | 'CHECKLISTS_EXPLICADOS' | 'GLOSSARIO' | 'NORMAS_LEIS' | 'ATUALIZACOES_PROCESSO'; descricao: string; status: 'ATIVO' | 'INATIVO'; nivel_acesso: 'OPERADOR_ADMIN' | 'ADMIN'; versao_atual: number; etapas: EtapaFluxo[]; versao_atual_id?: string | null };
      etapas: EtapaFluxo[];
      versaoAtual: { id: string; versao: number; conteudo: string; resumo_alteracao: string; publicado_em: string; publicado_por_nome: string } | null;
      versoes: { id: string; versao: number; resumo_alteracao: string; publicado_em: string; publicado_por_nome: string }[];
    }>(`/operacional/conhecimento/documentos/${id}`).then((data) => ({
      ...data,
      etapas: normalizeEtapas(data.etapas),
      documento: {
        ...data.documento,
        etapas: normalizeEtapas(data.documento?.etapas),
      },
    })),
    enabled: !!id,
  });
}

function normalizeEtapas(value: unknown): EtapaFluxo[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is EtapaFluxo => typeof v === 'string' && v.length > 0);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inner = trimmed.slice(1, -1);
      if (!inner) return [];
      return inner.split(',').map((v) => v.trim().replace(/^"|"$/g, '')).filter((v): v is EtapaFluxo => v.length > 0);
    }
    return trimmed.split(',').map((v) => v.trim()).filter((v): v is EtapaFluxo => v.length > 0);
  }
  return [];
}

// ─── Glossário Dinâmico ─────────────────────────────────────

export interface GlossarioItem {
  id: string;
  termo: string;
  definicao: string;
  ativo: boolean;
  ordem: number;
}

export function useGlossario() {
  return useQuery({
    queryKey: queryKeys.glossario,
    queryFn: () => api.get<{ itens: GlossarioItem[] }>('/operacional/conhecimento/glossario'),
    staleTime: 5 * 60_000,
  });
}

export function useCriarGlossario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { termo: string; definicao: string; ordem?: number }) =>
      api.post<{ id: string }>('/operacional/conhecimento/glossario', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.glossario }),
  });
}

export function useAtualizarGlossario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; termo?: string; definicao?: string; ativo?: boolean; ordem?: number }) =>
      api.patch(`/operacional/conhecimento/glossario/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.glossario }),
  });
}

export function useExcluirGlossario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/operacional/conhecimento/glossario/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.glossario }),
  });
}

// ─── Validação de Duplicatas de Importação ───────────────────────

export function useValidarDuplicatasImportacao(fonteId: string) {
  return useQuery({
    queryKey: ['importacao-duplicatas', fonteId],
    queryFn: () => api.post<{
      fonte: { id: string; nome: string };
      total: number;
      novos: { quantidade: number; itens: Array<{ linha: number; dados: any; motivo: string }> };
      duplicados: { quantidade: number; itens: Array<{ linha: number; dados: any; motivo: string }> };
    }>(`/operacional/fontes-importacao/${fonteId}/validar-duplicatas`),
    enabled: !!fonteId,
  });
}

// ─── Leis e Normas Dinâmicas ────────────────────────────────

export interface LeiNormaItem {
  id: string;
  nome: string;
  descricao: string;
  referencia: string;
  url: string | null;
  ativo: boolean;
  ordem: number;
}

export function useLeisNormas() {
  return useQuery({
    queryKey: queryKeys.leisNormas,
    queryFn: () => api.get<{ itens: LeiNormaItem[] }>('/operacional/conhecimento/leis-normas'),
    staleTime: 5 * 60_000,
  });
}

export function useCriarLeiNorma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { nome: string; descricao: string; referencia?: string; url?: string; ordem?: number }) =>
      api.post<{ id: string }>('/operacional/conhecimento/leis-normas', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.leisNormas }),
  });
}

export function useAtualizarLeiNorma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; nome?: string; descricao?: string; referencia?: string; url?: string; ativo?: boolean; ordem?: number }) =>
      api.patch(`/operacional/conhecimento/leis-normas/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.leisNormas }),
  });
}

export function useExcluirLeiNorma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/operacional/conhecimento/leis-normas/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.leisNormas }),
  });
}

// ─── Importações Legado ─────────────────────────────────────

export function useImportacoesHistorico() {
  return useQuery({
    queryKey: queryKeys.importacoesHistorico,
    queryFn: () => api.get<{
      itens: { id: string; tipo: string; total_registros: number; registros_sucesso: number; registros_erro: number; detalhes_erros: unknown; criado_em: string; usuario_destino_id: string; usuario_destino_nome: string; executado_por: string; executado_por_nome: string }[];
    }>('/operacional/importacoes-legado?pagina=1&limite=20'),
  });
}
