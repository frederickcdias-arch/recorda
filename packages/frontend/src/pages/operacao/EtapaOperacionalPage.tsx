import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { StatusRepositorio, OrigemDocumentoRecebimento } from '@recorda/shared';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageState } from '../../components/ui/PageState';
import { useToastHelpers } from '../../components/ui/Toast';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { extractErrorMessage } from '../../utils/errors';
import { useRecebimento } from '../../hooks/useRecebimento';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useDebounce } from '../../hooks/useDebounce';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ControleQualidadePanel } from './ControleQualidadePanel';
import { Pagination } from '../../components/ui/Pagination';
import { RecebimentoAvulsosPanel } from './RecebimentoAvulsosPanel';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ProgressIndicator } from '../../components/ui/ProgressIndicator';
import { AgingBadge } from '../../components/ui/AgingBadge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import {
  useRepositorios,
  useCreateRepositorio,
  useDeleteRepositorio,
  useAvancarEtapa,
  useBatchProcessos,
  useRegistrarProducao,
  useGerarRelatorioRecebimento,
  useGerarRelatorioProducao,
  useCriarChecklist,
  useConcluirChecklist,
  useOrgaosRecebimento,
  useProjetosConfiguracao,
  useCreateProjetoConfiguracao,
  useCriarOrgaoRecebimento,
  useQueryClient,
  queryKeys,
} from '../../hooks/useQueries';
import { useUltimoIdRepositorioGed } from '../../hooks/useUltimoIdRepositorioGed';

type EtapaSlug = 'recebimento' | 'controle-qualidade';

type EtapaApi = 'RECEBIMENTO' | 'CONTROLE_QUALIDADE';

type ResultadoChecklist = 'CONFORME' | 'NAO_CONFORME_COM_TRATATIVA';

interface RepositorioItem {
  id_repositorio_recorda: string;
  id_repositorio_ged: string;
  orgao: string;
  projeto: string;
  status_atual: string;
  etapa_atual: string;
  total_processos?: number;
  checklist_concluido?: boolean;
  checklist_aberto?: boolean;
  producao_registrada?: boolean;
  total_relatorios?: number;
  segundos_na_etapa?: number;
}

interface ChecklistResumo {
  id: string;
  etapa: EtapaApi;
  status: 'ABERTO' | 'CONCLUIDO';
  ativo: boolean;
}

interface ChecklistItem {
  id: string;
  codigo: string;
  descricao: string;
  obrigatorio: boolean;
  ordem: number;
  resultado: ResultadoChecklist | null;
  observacao: string | null;
}

interface ChecklistDetalheResponse {
  checklist: {
    id: string;
    etapa: EtapaApi;
    status: 'ABERTO' | 'CONCLUIDO';
  };
  itens: ChecklistItem[];
}

interface DocumentoRecebimentoItem {
  id: string;
  processo: string;
  interessado: string;
  numero_caixas: number;
  volume: string;
  caixa_nova: boolean;
  origem: OrigemDocumentoRecebimento;
  ocr_confianca?: number | null;
  criado_em: string;
}

interface AvulsoBuscaItem {
  id: string;
  protocolo: string;
  interessado: string;
}

interface EtapaConfig {
  label: string;
  etapaApi: EtapaApi;
  nextPath?: string;
  nextEtapaApi?: EtapaApi;
  nextStatus?: StatusRepositorio;
  prevEtapaApi?: EtapaApi;
  prevStatus?: StatusRepositorio;
}

const ETAPA_MAP: Record<EtapaSlug, EtapaConfig> = {
  recebimento: {
    label: 'Recebimento',
    etapaApi: 'RECEBIMENTO',
    nextPath: '/operacao/controle-qualidade',
    nextEtapaApi: 'CONTROLE_QUALIDADE',
    nextStatus: 'AGUARDANDO_CQ_LOTE',
  },
  'controle-qualidade': {
    label: 'Controle de Qualidade',
    etapaApi: 'CONTROLE_QUALIDADE',
    prevEtapaApi: 'RECEBIMENTO',
    prevStatus: 'RECEBIDO',
  },
};

function isEtapaSlug(value: string | undefined): value is EtapaSlug {
  return Boolean(value && value in ETAPA_MAP);
}

export function EtapaOperacionalPage(): JSX.Element {
  const { etapa } = useParams<{ etapa: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'administrador';

  const toast = useToastHelpers();
  const queryClient = useQueryClient();
  const [processando, setProcessando] = useState(false);
  const [processandoCsv, setProcessandoCsv] = useState(false);

  const [pagina, setPagina] = useState(1);
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroUnidade, setFiltroUnidade] = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');

  const [novoRepositorio, setNovoRepositorio] = useState({
    idRepositorioGed: '',
    orgao: '',
    projeto: '',
    classificacaoId: '',
    idGedEditado: false,
  });
  const [novaUnidadeInput, setNovaUnidadeInput] = useState('');
  const [novoProjetoInput, setNovoProjetoInput] = useState('');

  const [checklistModalOpen, setChecklistModalOpen] = useState(false);
  const [checklistId, setChecklistId] = useState('');
  const [checklistHeader, setChecklistHeader] = useState<
    ChecklistDetalheResponse['checklist'] | null
  >(null);
  const [checklistItens, setChecklistItens] = useState<ChecklistItem[]>([]);
  const [avancarModalOpen, setAvancarModalOpen] = useState(false);
  const [avancarRepoId, setAvancarRepoId] = useState('');
  const [avancarDocs, setAvancarDocs] = useState<DocumentoRecebimentoItem[]>([]);
  const [avancarConfirmado, setAvancarConfirmado] = useState(false);
  const confirmDialog = useConfirmDialog();
  const [recebSubTab, setRecebSubTab] = useState<'repositorios' | 'avulsos'>('repositorios');
  const [reposSelecionadosTermo, setReposSelecionadosTermo] = useState<Set<string>>(new Set());
  const [batchAddModalOpen, setBatchAddModalOpen] = useState(false);
  const [batchRepoId, setBatchRepoId] = useState('');
  const [batchText, setBatchText] = useState('');
  const [previewTermoUrl, setPreviewTermoUrl] = useState<string | null>(null);
  const [previewTermoReportId, setPreviewTermoReportId] = useState<string | null>(null);
  const [avulsosBuscaLoading, setAvulsosBuscaLoading] = useState(false);
  const [avulsosBuscaItens, setAvulsosBuscaItens] = useState<AvulsoBuscaItem[]>([]);

  const {
    ocrModalOpen,
    setOcrModalOpen,
    ocrRepo,
    setOcrImagemBase64,
    ocrPreview,
    setOcrPreview,
    ocrProcessando,
    recebProcessos,
    recebTab,
    setRecebTab,
    apensoModalOpen,
    setApensoModalOpen,
    apensoProcessoId,
    setApensoProcessoId,
    setoresOptions,
    classificacoesOptions,
    novoSetorInput,
    setNovoSetorInput,
    docForm,
    setDocForm,
    EMPTY_DOC_FORM,
    handleOpenOCRModal,
    handleUploadImagemOCR,
    handleProcessarOCR,
    handleSalvarProcessoRecebimento,
    handleExcluirProcessoRecebimento,
    handleAdicionarApenso,
    handleExcluirApenso,
    handleCriarSetor,
    confirmDialog: recebimentoConfirmDialog,
  } = useRecebimento();

  const etapaConfig = useMemo(() => {
    if (!isEtapaSlug(etapa)) return null;
    return ETAPA_MAP[etapa];
  }, [etapa]);

  const filtrosUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      status: params.get('status') ?? '',
      busca: params.get('busca') ?? '',
      orgao: params.get('orgao') ?? '',
      dataInicio: params.get('dataInicio') ?? '',
      dataFim: params.get('dataFim') ?? '',
    };
  }, [location.search]);

  useEffect(() => {
    setFiltroBusca(filtrosUrl.busca);
    setFiltroUnidade(filtrosUrl.orgao);
    setFiltroDataInicio(filtrosUrl.dataInicio);
    setFiltroDataFim(filtrosUrl.dataFim);
  }, [filtrosUrl.busca, filtrosUrl.orgao, filtrosUrl.dataInicio, filtrosUrl.dataFim]);

  const debouncedBusca = useDebounce(filtroBusca.trim(), 300);

  useEffect(() => {
    if (etapa !== 'recebimento' || !debouncedBusca) {
      setAvulsosBuscaItens([]);
      setAvulsosBuscaLoading(false);
      return;
    }

    let ativo = true;
    setAvulsosBuscaLoading(true);

    void api
      .get<{ processos: AvulsoBuscaItem[] }>(
        `/operacional/recebimento-avulsos?busca=${encodeURIComponent(debouncedBusca)}&pagina=1&limite=5`
      )
      .then((data) => {
        if (!ativo) return;
        setAvulsosBuscaItens(data.processos ?? []);
      })
      .catch(() => {
        if (!ativo) return;
        setAvulsosBuscaItens([]);
      })
      .finally(() => {
        if (!ativo) return;
        setAvulsosBuscaLoading(false);
      });

    return () => {
      ativo = false;
    };
  }, [debouncedBusca, etapa]);

  const repoQuery = useRepositorios({
    etapa: etapaConfig?.etapaApi,
    status: filtrosUrl.status || undefined,
    orgao: filtroUnidade || undefined,
    dataInicio: filtroDataInicio || undefined,
    dataFim: filtroDataFim || undefined,
    busca: debouncedBusca || undefined,
    pagina,
    limite: 50,
  });

  const itens = (repoQuery.data?.itens ?? []) as RepositorioItem[];
  const totalPaginas = repoQuery.data?.totalPaginas ?? 1;
  const contadores =
    (repoQuery.data as { contadores?: Record<string, number> } | undefined)?.contadores ?? {};
  const totalGeral = Object.values(contadores).reduce((a, b) => a + b, 0);
  const carregando = repoQuery.isLoading;
  const erro = repoQuery.error
    ? {
        message: 'Erro ao carregar Fila Operacional',
        details: repoQuery.error instanceof Error ? repoQuery.error.message : 'Falha desconhecida',
      }
    : null;

  const invalidateRepos = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.repositoriosAll });

  const createRepo = useCreateRepositorio();
  const deleteRepo = useDeleteRepositorio();
  const avancarEtapa = useAvancarEtapa();
  const batchProcessos = useBatchProcessos();
  const registrarProducao = useRegistrarProducao();
  const gerarRelRecebimento = useGerarRelatorioRecebimento();
  const gerarRelProducao = useGerarRelatorioProducao();
  const criarChecklist = useCriarChecklist();
  const concluirChecklist = useConcluirChecklist();
  const orgaosQuery = useOrgaosRecebimento();
  const projetosQuery = useProjetosConfiguracao();
  const createProjeto = useCreateProjetoConfiguracao();
  const createOrgao = useCriarOrgaoRecebimento();
  const orgaosOptions = orgaosQuery.data ?? [];
  const projetosOptions = projetosQuery.data ?? [];

  const { data: ultimoIdGed, isFetching: buscandoIdGed } = useUltimoIdRepositorioGed(
    novoRepositorio.orgao,
    novoRepositorio.projeto
  );

  // Sugere o proximo ID GED automaticamente ao selecionar unidade/projeto,
  // enquanto o usuario nao tiver editado o campo manualmente.
  useEffect(() => {
    if (!novoRepositorio.orgao || !novoRepositorio.projeto || novoRepositorio.idGedEditado) {
      return;
    }

    if (!ultimoIdGed) {
      const anoAtual = String(new Date().getFullYear());
      setNovoRepositorio((prev) => ({ ...prev, idRepositorioGed: `000001/${anoAtual}` }));
      return;
    }

    const match = ultimoIdGed.match(/(\d{1,6})\/(\d{4})/);
    if (!match) return;

    const numeroAtual = Number(match[1]);
    if (Number.isNaN(numeroAtual)) return;

    const proximoNumero = String(numeroAtual + 1).padStart(6, '0');
    const ano = match[2];
    setNovoRepositorio((prev) => ({ ...prev, idRepositorioGed: `${proximoNumero}/${ano}` }));
  }, [novoRepositorio.orgao, novoRepositorio.projeto, novoRepositorio.idGedEditado, ultimoIdGed]);

  if (!etapaConfig) {
    return <div className="text-center text-gray-600 py-12">Etapa Operacional inválida.</div>;
  }

  const irProximaEtapa = (): void => {
    if (!etapaConfig.nextPath) return;
    navigate(etapaConfig.nextPath);
  };

  const showSuccess = (texto: string): void => toast.success(texto);
  const showError = (texto: string): void => toast.error(texto);

  const handleCriarUnidadeRapida = async (): Promise<void> => {
    const nomeUnidade = novaUnidadeInput.trim();
    if (!nomeUnidade) return;

    const existente = orgaosOptions.find(
      (o) => o.nome.trim().toLowerCase() === nomeUnidade.toLowerCase()
    );
    if (existente) {
      setNovoRepositorio((prev) => ({ ...prev, orgao: existente.nome, idGedEditado: false }));
      setNovaUnidadeInput('');
      showSuccess('Unidade já existente e selecionada.');
      return;
    }

    try {
      setProcessando(true);
      const created = await createOrgao.mutateAsync(nomeUnidade);
      setNovoRepositorio((prev) => ({ ...prev, orgao: created.nome, idGedEditado: false }));
      setNovaUnidadeInput('');
      showSuccess('Unidade cadastrada e selecionada com sucesso.');
      if (orgaosQuery.refetch) await orgaosQuery.refetch();
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao cadastrar unidade'));
    } finally {
      setProcessando(false);
    }
  };

  const handleCriarProjetoRapido = async (): Promise<void> => {
    const nomeProjeto = novoProjetoInput.trim();
    if (!nomeProjeto) return;

    const existente = projetosOptions.find(
      (p) => p.nome.trim().toLowerCase() === nomeProjeto.toLowerCase()
    );
    if (existente) {
      setNovoRepositorio((prev) => ({ ...prev, projeto: existente.nome, idGedEditado: false }));
      setNovoProjetoInput('');
      showSuccess('Projeto já existente e selecionado.');
      return;
    }

    if (!isAdmin) {
      showError('Somente administradores podem cadastrar projeto rápido.');
      return;
    }

    try {
      setProcessando(true);
      const projetoCriado = await createProjeto.mutateAsync({ nome: nomeProjeto, ativo: true });
      const nomeCriado = (projetoCriado as { nome?: string }).nome ?? nomeProjeto;
      setNovoRepositorio((prev) => ({ ...prev, projeto: nomeCriado, idGedEditado: false }));
      setNovoProjetoInput('');
      showSuccess('Projeto cadastrado e selecionado com sucesso.');
      if (projetosQuery.refetch) await projetosQuery.refetch();
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao cadastrar projeto'));
    } finally {
      setProcessando(false);
    }
  };

  const handleCriarRepositorio = async (): Promise<void> => {
    if (
      !novoRepositorio.idRepositorioGed ||
      !novoRepositorio.orgao ||
      !novoRepositorio.projeto ||
      !novoRepositorio.classificacaoId
    ) {
      showError('Preencha todos os campos obrigatórios para criar o repositório.');
      return;
    }

    try {
      setProcessando(true);
      await createRepo.mutateAsync({
        idRepositorioGed: novoRepositorio.idRepositorioGed,
        orgao: novoRepositorio.orgao,
        projeto: novoRepositorio.projeto,
        classificacaoId: novoRepositorio.classificacaoId,
      });
      showSuccess('Repositório criado com sucesso.');
      setNovoRepositorio((prev) => ({
        ...prev,
        idRepositorioGed: '',
        orgao: '',
        projeto: '',
        classificacaoId: '',
        idGedEditado: false,
      }));
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao Criar Repositório'));
    } finally {
      setProcessando(false);
    }
  };

  const handleOpenAvancar = async (repositorioId: string): Promise<void> => {
    if (!etapaConfig.nextEtapaApi || !etapaConfig.nextStatus) {
      showError('Esta etapa não possui próxima etapa configurada.');
      return;
    }
    setAvancarRepoId(repositorioId);
    setAvancarDocs([]);
    setAvancarConfirmado(false);
    try {
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.documentosRecebimento(repositorioId),
        queryFn: () =>
          api.get<{ itens: DocumentoRecebimentoItem[] }>(
            `/operacional/repositorios/${repositorioId}/documentos-recebimento`
          ),
        staleTime: 0,
      });
      setAvancarDocs(data.itens ?? []);
    } catch {
      // continue - backend will validate
    }
    setAvancarModalOpen(true);
  };

  const handleConfirmarAvancar = async (): Promise<void> => {
    if (!avancarRepoId) {
      showError('Repositório não selecionado.');
      return;
    }
    if (!etapaConfig.nextEtapaApi || !etapaConfig.nextStatus) return;

    try {
      setProcessando(true);
      await avancarEtapa.mutateAsync({
        id: avancarRepoId,
        etapaDestino: etapaConfig.nextEtapaApi!,
        statusDestino: etapaConfig.nextStatus!,
      });
      showSuccess(`Repositório avançado para ${etapaConfig.nextEtapaApi}.`);
      setAvancarModalOpen(false);
      setAvancarRepoId('');
      invalidateRepos();
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao Avançar Etapa'));
    } finally {
      setProcessando(false);
    }
  };

  const handleDevolverEtapaAnterior = async (repositorioId: string): Promise<void> => {
    if (!etapaConfig.prevEtapaApi || !etapaConfig.prevStatus) {
      showError('Esta etapa não possui etapa anterior configurada.');
      return;
    }
    try {
      setProcessando(true);
      await avancarEtapa.mutateAsync({
        id: repositorioId,
        etapaDestino: etapaConfig.prevEtapaApi!,
        statusDestino: etapaConfig.prevStatus!,
      });
      showSuccess(`Repositório devolvido para ${etapaConfig.prevEtapaApi}.`);
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao Devolver para Etapa Anterior'));
    } finally {
      setProcessando(false);
    }
  };

  const handleAdicionarEmLote = async (): Promise<void> => {
    if (!batchRepoId || !batchText.trim()) {
      showError('Selecione um repositório e informe os dados.');
      return;
    }

    try {
      setProcessando(true);
      const lines = batchText.split('\n').filter((l) => l.trim());
      const processos = lines
        .map((line) => {
          const parts = line.split('\t').map((p) => p.trim());
          return {
            protocolo: parts[0] || '',
            interessado: parts[1] || '',
            setorId: null,
            volumeAtual: 1,
            volumeTotal: 0,
            origem: 'MANUAL' as const,
            ocrConfianca: null,
          };
        })
        .filter((p) => p.protocolo && p.interessado);

      if (processos.length === 0) {
        showError(
          'Nenhum processo válido. Formato esperado: protocolo (TAB) interessado, um por linha.'
        );
        return;
      }

      await batchProcessos.mutateAsync({ repoId: batchRepoId, processos });
      showSuccess(`${processos.length} processo(s) adicionado(s) com sucesso.`);
      setBatchAddModalOpen(false);
      setBatchRepoId('');
      setBatchText('');
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao Adicionar Processos em Lote'));
    } finally {
      setProcessando(false);
    }
  };

  const handleRegistrarProducao = async (repositorioId: string): Promise<void> => {
    try {
      setProcessando(true);
      // Buscar checklist concluido mais recente da etapa atual para vincular
      // Force fresh fetch — cached data may still show checklist as ABERTO
      await queryClient.invalidateQueries({
        queryKey: queryKeys.checklistsRepo(repositorioId, etapaConfig.etapaApi),
      });
      const checklistsData = await queryClient.fetchQuery({
        queryKey: queryKeys.checklistsRepo(repositorioId, etapaConfig.etapaApi),
        queryFn: () =>
          api.get<{ itens: ChecklistResumo[] }>(
            `/operacional/repositorios/${repositorioId}/checklists?etapa=${etapaConfig.etapaApi}`
          ),
        staleTime: 0,
      });
      const checklistConcluido = checklistsData.itens?.find((c) => c.status === 'CONCLUIDO');
      if (!checklistConcluido) {
        showError('Conclua o checklist da etapa antes de registrar produção.');
        return;
      }

      await registrarProducao.mutateAsync({
        repoId: repositorioId,
        etapa: etapaConfig.etapaApi,
        checklistId: checklistConcluido.id,
        quantidade: 1,
      });
      showSuccess('Produção registrada com sucesso.');
      invalidateRepos();
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao Registrar Produção'));
    } finally {
      setProcessando(false);
    }
  };

  const handleGerarRelatorioRecebimento = async (repositorioIds: string[]): Promise<void> => {
    try {
      setProcessando(true);
      const report = await gerarRelRecebimento.mutateAsync(repositorioIds);
      const response = await api.fetchWithAuth(`/api/operacional/relatorios/${report.id}/download`);
      if (!response.ok) throw new Error('Erro ao carregar PDF');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      setPreviewTermoReportId(report.id);
      setPreviewTermoUrl(blobUrl);
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao gerar Termo de Recebimento'));
    } finally {
      setProcessando(false);
    }
  };

  const handleGerarRelatorioRecebimentoCsv = async (repositorioIds: string[]): Promise<void> => {
    try {
      setProcessandoCsv(true);
      const report = await gerarRelRecebimento.mutateAsync(repositorioIds);
      await api.download(
        `/api/operacional/relatorios/${report.id}/download?formato=csv`,
        `termo-recebimento-${report.id}.csv`
      );
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao gerar CSV de Recebimento'));
    } finally {
      setProcessandoCsv(false);
    }
  };

  const handleDownloadTermo = async (): Promise<void> => {
    if (!previewTermoReportId) return;
    try {
      await api.download(
        `/api/operacional/relatorios/${previewTermoReportId}/download`,
        `termo-recebimento-${previewTermoReportId}.pdf`
      );
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao baixar Termo'));
    }
  };

  const handleGerarRelatorioProducao = async (repositorioId: string): Promise<void> => {
    try {
      setProcessando(true);
      await gerarRelProducao.mutateAsync(repositorioId);
      showSuccess('Relatório de Produção gerado com sucesso.');
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao gerar Relatório de Produção'));
    } finally {
      setProcessando(false);
    }
  };

  const handleOpenExcluir = (repositorioId: string): void => {
    confirmDialog.confirm({
      title: 'Excluir Repositório',
      message: 'Tem certeza que deseja excluir este repositório? Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        try {
          setProcessando(true);
          await deleteRepo.mutateAsync(repositorioId);
          showSuccess('Repositório excluído com sucesso.');
        } catch (error) {
          showError(extractErrorMessage(error, 'Erro ao Excluir Repositório'));
        } finally {
          setProcessando(false);
        }
      },
    });
  };

  const loadChecklist = async (id: string): Promise<void> => {
    const data = await queryClient.fetchQuery({
      queryKey: queryKeys.checklistDetalhe(id),
      queryFn: () => api.get<ChecklistDetalheResponse>(`/operacional/checklists/${id}`),
      staleTime: 10_000,
    });
    setChecklistId(id);
    setChecklistHeader(data.checklist);
    setChecklistItens(data.itens ?? []);
    setChecklistModalOpen(true);
  };

  const handleAbrirChecklist = async (repositorioId: string): Promise<void> => {
    try {
      setProcessando(true);
      const created = await criarChecklist.mutateAsync({
        repoId: repositorioId,
        etapa: etapaConfig.etapaApi,
      });
      await loadChecklist(created.id);
      showSuccess('Checklist aberto.');
    } catch (error) {
      const message = extractErrorMessage(error, 'Erro ao Abrir Checklist');
      const status =
        error && typeof error === 'object' && 'status' in error
          ? (error as { status: number }).status
          : 0;
      if (status === 409 || message.toLowerCase().includes('existe checklist ativo')) {
        try {
          const list = await queryClient.fetchQuery({
            queryKey: queryKeys.checklistsRepo(repositorioId, etapaConfig.etapaApi, true),
            queryFn: () =>
              api.get<{ itens: ChecklistResumo[] }>(
                `/operacional/repositorios/${repositorioId}/checklists?etapa=${etapaConfig.etapaApi}&ativo=true`
              ),
            staleTime: 5_000,
          });
          const checklistAtivo = list.itens?.[0];
          if (checklistAtivo) {
            await loadChecklist(checklistAtivo.id);
            setChecklistModalOpen(true);
            return;
          }
        } catch {
          // fallback handled below
        }
      }
      showError(message);
    } finally {
      setProcessando(false);
    }
  };

  const handleConcluirChecklist = async (): Promise<void> => {
    if (!checklistId) return;

    // Validate: all obligatory items must have a resultado
    const obrigatoriosSemResultado = checklistItens.filter((it) => it.obrigatorio && !it.resultado);
    if (obrigatoriosSemResultado.length > 0) {
      showError(
        `Preencha todos os itens obrigatórios antes de concluir. (${obrigatoriosSemResultado.length} pendente${obrigatoriosSemResultado.length > 1 ? 's' : ''})`
      );
      return;
    }

    // Validate: non-conforme items must have observação
    const naoConformeSemObs = checklistItens.filter(
      (it) => it.resultado === 'NAO_CONFORME_COM_TRATATIVA' && !it.observacao?.trim()
    );
    if (naoConformeSemObs.length > 0) {
      showError('Itens "Não conforme" precisam de observação.');
      return;
    }

    try {
      setProcessando(true);
      const itensParaSalvar = checklistItens
        .filter((it) => it.resultado)
        .map((it) => ({
          modeloId: it.id,
          resultado: it.resultado!,
          observacao: it.observacao ?? '',
        }));

      await concluirChecklist.mutateAsync({
        checklistId,
        observacao: '',
        itens: itensParaSalvar,
      });
      showSuccess('Checklist concluído com sucesso.');
      setChecklistModalOpen(false);
      invalidateRepos();
      void queryClient.invalidateQueries({ queryKey: ['checklists'] });
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao Concluir Checklist'));
    } finally {
      setProcessando(false);
    }
  };

  const erroComAcao = erro
    ? {
        ...erro,
        action: {
          label: 'Tentar novamente',
          onClick: () => invalidateRepos(),
        },
      }
    : null;

  return (
    <PageState
      loading={carregando}
      loadingMessage="Carregando Fila Operacional..."
      error={erroComAcao}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{etapaConfig.label}</h1>
            <p className="text-sm text-gray-500 mt-1">Gestão operacional por etapa.</p>
          </div>
          {etapaConfig.nextPath ? (
            <Button variant="secondary" size="sm" onClick={irProximaEtapa}>
              Ir para próxima etapa
            </Button>
          ) : null}
        </div>

        {/* Summary cards */}
        {totalGeral > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 uppercase font-medium">Total</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalGeral}</p>
            </div>
            {Object.entries(contadores).map(([status, qtd]) => (
              <div key={status} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 uppercase font-medium truncate">
                  <StatusBadge status={status} />
                </p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{qtd}</p>
              </div>
            ))}
          </div>
        ) : null}

        {etapa === 'recebimento' ? (
          <>
            {/* Sub-tabs: Repositórios | Avulsos */}
            <div className="flex gap-1 border-b border-gray-200">
              <button
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  recebSubTab === 'repositorios'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setRecebSubTab('repositorios')}
              >
                Repositórios ({itens.length})
              </button>
              <button
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  recebSubTab === 'avulsos'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setRecebSubTab('avulsos')}
              >
                Avulsos
              </button>
            </div>

            {recebSubTab === 'repositorios' ? (
              <div className="space-y-6 pb-24 md:pb-0">
                <Card>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Criar repositório</h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Input
                      label="ID GED"
                      value={novoRepositorio.idRepositorioGed}
                      onChange={(e) =>
                        setNovoRepositorio((p) => ({
                          ...p,
                          idRepositorioGed: e.target.value,
                          idGedEditado: true,
                        }))
                      }
                      helperText={
                        buscandoIdGed
                          ? 'Buscando sugestão...'
                          : !novoRepositorio.idGedEditado &&
                              novoRepositorio.orgao &&
                              novoRepositorio.projeto
                            ? 'Sugerido automaticamente. Você pode editar.'
                            : undefined
                      }
                    />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unidade
                      </label>
                      <select
                        className="w-full h-11 px-3 border rounded-lg text-sm"
                        value={novoRepositorio.orgao}
                        onChange={(e) =>
                          setNovoRepositorio((p) => ({
                            ...p,
                            orgao: e.target.value,
                            idGedEditado: false,
                          }))
                        }
                      >
                        <option value="">— Selecione —</option>
                        {orgaosOptions.map((o) => (
                          <option key={o.id} value={o.nome}>
                            {o.nome}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-1 mt-1">
                        <input
                          className="flex-1 h-10 px-3 border rounded text-sm"
                          placeholder="Nova unidade..."
                          value={novaUnidadeInput}
                          onChange={(e) => setNovaUnidadeInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleCriarUnidadeRapida();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="h-10 px-3 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                          onClick={() => void handleCriarUnidadeRapida()}
                          disabled={!novaUnidadeInput.trim() || processando}
                          title="Adicionar e selecionar unidade"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Projeto
                      </label>
                      <select
                        className="w-full h-11 px-3 border rounded-lg text-sm"
                        value={novoRepositorio.projeto}
                        onChange={(e) =>
                          setNovoRepositorio((p) => ({
                            ...p,
                            projeto: e.target.value,
                            idGedEditado: false,
                          }))
                        }
                      >
                        <option value="">— Selecione —</option>
                        {projetosOptions.map((o) => (
                          <option key={o.id} value={o.nome}>
                            {o.nome}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-1 mt-1">
                        <input
                          className="flex-1 h-10 px-3 border rounded text-sm"
                          placeholder="Novo projeto..."
                          value={novoProjetoInput}
                          onChange={(e) => setNovoProjetoInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleCriarProjetoRapido();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="h-10 px-3 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                          onClick={() => void handleCriarProjetoRapido()}
                          disabled={!novoProjetoInput.trim() || processando}
                          title={
                            isAdmin
                              ? 'Cadastrar e selecionar projeto'
                              : 'Apenas administrador pode cadastrar projeto'
                          }
                        >
                          Adicionar
                        </button>
                      </div>
                      {!isAdmin ? (
                        <p className="mt-1 text-[11px] text-gray-500">
                          Cadastro rápido disponível para administrador.
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Classificação
                      </label>
                      <select
                        className="w-full h-11 px-3 border rounded-lg text-sm"
                        value={novoRepositorio.classificacaoId}
                        onChange={(e) =>
                          setNovoRepositorio((p) => ({ ...p, classificacaoId: e.target.value }))
                        }
                      >
                        <option value="">— Selecione —</option>
                        {classificacoesOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <Button
                        onClick={() => {
                          void handleCriarRepositorio();
                        }}
                        loading={processando}
                        disabled={
                          !novoRepositorio.idRepositorioGed ||
                          !novoRepositorio.orgao ||
                          !novoRepositorio.projeto ||
                          !novoRepositorio.classificacaoId ||
                          processando
                        }
                        title={
                          !novoRepositorio.idRepositorioGed
                            ? 'Preencha o ID GED.'
                            : !novoRepositorio.orgao
                              ? 'Selecione a Unidade.'
                              : !novoRepositorio.projeto
                                ? 'Selecione o Projeto.'
                                : !novoRepositorio.classificacaoId
                                  ? 'Selecione a Classificação.'
                                  : processando
                                    ? 'Processando...'
                                    : ''
                        }
                      >
                        Criar repositório
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-4">
                    <div>
                      <Input
                        label="Buscar"
                        value={filtroBusca}
                        onChange={(e) => {
                          setFiltroBusca(e.target.value);
                          setPagina(1);
                        }}
                        placeholder="ID GED, unidade, projeto ou processo"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unidade
                      </label>
                      <select
                        className="w-full h-11 px-3 border rounded-lg text-sm"
                        value={filtroUnidade}
                        onChange={(e) => {
                          setFiltroUnidade(e.target.value);
                          setPagina(1);
                        }}
                      >
                        <option value="">— Todas —</option>
                        {orgaosOptions.map((o) => (
                          <option key={o.id} value={o.nome}>
                            {o.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Input
                        label="Data Início"
                        type="date"
                        value={filtroDataInicio}
                        onChange={(e) => {
                          setFiltroDataInicio(e.target.value);
                          setPagina(1);
                        }}
                      />
                    </div>
                    <div>
                      <Input
                        label="Data Fim"
                        type="date"
                        value={filtroDataFim}
                        onChange={(e) => {
                          setFiltroDataFim(e.target.value);
                          setPagina(1);
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center mb-4">
                    <Button
                      className="w-full md:w-auto"
                      variant="secondary"
                      onClick={() => invalidateRepos()}
                      loading={processando}
                    >
                      Atualizar
                    </Button>
                    <Button
                      className="w-full md:w-auto"
                      variant="outline"
                      onClick={() => {
                        setBatchRepoId('');
                        setBatchText('');
                        setBatchAddModalOpen(true);
                      }}
                    >
                      Adicionar em Lote
                    </Button>
                    {reposSelecionadosTermo.size > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="w-full md:w-auto"
                          variant="outline"
                          onClick={() =>
                            void handleGerarRelatorioRecebimento(Array.from(reposSelecionadosTermo))
                          }
                          loading={processando}
                        >
                          Gerar Termo ({reposSelecionadosTermo.size})
                        </Button>
                        <Button
                          className="w-full md:w-auto"
                          variant="secondary"
                          onClick={() =>
                            void handleGerarRelatorioRecebimentoCsv(
                              Array.from(reposSelecionadosTermo)
                            )
                          }
                          loading={processandoCsv}
                        >
                          Gerar CSV ({reposSelecionadosTermo.size})
                        </Button>
                      </div>
                    )}
                  </div>

                  {debouncedBusca ? (
                    <div className="mb-4 p-3 border rounded-lg bg-amber-50 border-amber-200">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-amber-900 font-medium">
                          {avulsosBuscaLoading
                            ? 'Buscando também nos avulsos...'
                            : avulsosBuscaItens.length > 0
                              ? `Também encontrado(s) ${avulsosBuscaItens.length} processo(s) avulso(s)`
                              : 'Nenhum avulso encontrado para este termo'}
                        </p>
                        {avulsosBuscaItens.length > 0 ? (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => setRecebSubTab('avulsos')}
                          >
                            Ver avulsos
                          </Button>
                        ) : null}
                      </div>
                      {avulsosBuscaItens.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {avulsosBuscaItens.map((item) => (
                            <p key={item.id} className="text-xs text-amber-800">
                              {item.protocolo} - {item.interessado}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="md:hidden space-y-3">
                    {itens.length === 0 ? (
                      <div className="px-4 py-8 text-center text-gray-500 border rounded-lg">
                        Nenhum Repositório na Fila desta Etapa.
                      </div>
                    ) : (
                      itens.map((item) => (
                        <div
                          key={item.id_repositorio_recorda}
                          className={`border rounded-xl p-3 ${reposSelecionadosTermo.has(item.id_repositorio_recorda) ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                {item.id_repositorio_ged}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">{item.orgao}</p>
                              <p className="text-xs text-gray-500">{item.projeto}</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={reposSelecionadosTermo.has(item.id_repositorio_recorda)}
                              onChange={() => {
                                setReposSelecionadosTermo((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(item.id_repositorio_recorda))
                                    next.delete(item.id_repositorio_recorda);
                                  else next.add(item.id_repositorio_recorda);
                                  return next;
                                });
                              }}
                              className="mt-1 rounded h-5 w-5"
                            />
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <StatusBadge status={item.status_atual} />
                            <span
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${(item.total_processos ?? 0) > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}
                            >
                              {item.total_processos ?? 0}
                            </span>
                          </div>
                          <div className="mt-3">
                            <ProgressIndicator
                              steps={[
                                {
                                  label: 'CK',
                                  done: !!item.checklist_concluido,
                                  active: !!item.checklist_aberto,
                                },
                                { label: 'Prod', done: !!item.producao_registrada },
                                { label: 'Rel', done: (item.total_relatorios ?? 0) > 0 },
                              ]}
                            />
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <div>
                              {item.segundos_na_etapa != null ? (
                                <AgingBadge segundos={item.segundos_na_etapa} />
                              ) : null}
                            </div>
                            <ActionMenu
                              disabled={processando}
                              items={[
                                {
                                  label: 'Checklist',
                                  onClick: () =>
                                    void handleAbrirChecklist(item.id_repositorio_recorda),
                                },
                                {
                                  label: 'OCR / Docs',
                                  onClick: () => void handleOpenOCRModal(item),
                                },
                                {
                                  label: 'Gerar Termo',
                                  onClick: () =>
                                    void handleGerarRelatorioRecebimento([
                                      item.id_repositorio_recorda,
                                    ]),
                                },
                                {
                                  label: 'Registrar Produção',
                                  onClick: () =>
                                    void handleRegistrarProducao(item.id_repositorio_recorda),
                                },
                                {
                                  label: 'Avançar Etapa',
                                  onClick: () =>
                                    void handleOpenAvancar(item.id_repositorio_recorda),
                                  hidden: !etapaConfig.nextEtapaApi,
                                },
                                {
                                  label: 'Excluir',
                                  onClick: () => handleOpenExcluir(item.id_repositorio_recorda),
                                  variant: 'danger',
                                  hidden: !isAdmin,
                                },
                              ]}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-3 text-left w-10">
                            <input
                              type="checkbox"
                              checked={
                                reposSelecionadosTermo.size === itens.length && itens.length > 0
                              }
                              onChange={() => {
                                if (reposSelecionadosTermo.size === itens.length) {
                                  setReposSelecionadosTermo(new Set());
                                } else {
                                  setReposSelecionadosTermo(
                                    new Set(itens.map((i) => i.id_repositorio_recorda))
                                  );
                                }
                              }}
                              className="rounded"
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                            ID GED
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                            Unidade
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                            Projeto
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                            Status
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                            Proc.
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                            Progresso
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                            Tempo
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {itens.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                              Nenhum Repositório na Fila desta Etapa.
                            </td>
                          </tr>
                        ) : (
                          itens.map((item) => (
                            <tr
                              key={item.id_repositorio_recorda}
                              className={`hover:bg-gray-50 transition-colors ${reposSelecionadosTermo.has(item.id_repositorio_recorda) ? 'bg-blue-50' : ''}`}
                            >
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  checked={reposSelecionadosTermo.has(item.id_repositorio_recorda)}
                                  onChange={() => {
                                    setReposSelecionadosTermo((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(item.id_repositorio_recorda))
                                        next.delete(item.id_repositorio_recorda);
                                      else next.add(item.id_repositorio_recorda);
                                      return next;
                                    });
                                  }}
                                  className="rounded"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {item.id_repositorio_ged}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">{item.orgao}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{item.projeto}</td>
                              <td className="px-4 py-3">
                                <StatusBadge status={item.status_atual} />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${(item.total_processos ?? 0) > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}
                                >
                                  {item.total_processos ?? 0}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <ProgressIndicator
                                  steps={[
                                    {
                                      label: 'CK',
                                      done: !!item.checklist_concluido,
                                      active: !!item.checklist_aberto,
                                    },
                                    { label: 'Prod', done: !!item.producao_registrada },
                                    { label: 'Rel', done: (item.total_relatorios ?? 0) > 0 },
                                  ]}
                                />
                              </td>
                              <td className="px-4 py-3">
                                {item.segundos_na_etapa != null ? (
                                  <AgingBadge segundos={item.segundos_na_etapa} />
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <ActionMenu
                                  disabled={processando}
                                  items={[
                                    {
                                      label: 'Checklist',
                                      onClick: () =>
                                        void handleAbrirChecklist(item.id_repositorio_recorda),
                                    },
                                    {
                                      label: 'OCR / Docs',
                                      onClick: () => void handleOpenOCRModal(item),
                                    },
                                    {
                                      label: 'Gerar Termo',
                                      onClick: () =>
                                        void handleGerarRelatorioRecebimento([
                                          item.id_repositorio_recorda,
                                        ]),
                                    },
                                    {
                                      label: 'Registrar Produção',
                                      onClick: () =>
                                        void handleRegistrarProducao(item.id_repositorio_recorda),
                                    },
                                    {
                                      label: 'Avançar Etapa',
                                      onClick: () =>
                                        void handleOpenAvancar(item.id_repositorio_recorda),
                                      hidden: !etapaConfig.nextEtapaApi,
                                    },
                                    {
                                      label: 'Excluir',
                                      onClick: () => handleOpenExcluir(item.id_repositorio_recorda),
                                      variant: 'danger',
                                      hidden: !isAdmin,
                                    },
                                  ]}
                                />
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    pagina={pagina}
                    totalPaginas={totalPaginas}
                    onChange={setPagina}
                    disabled={carregando}
                  />
                </Card>
              </div>
            ) : (
              <RecebimentoAvulsosPanel onSuccess={showSuccess} onError={showError} />
            )}
          </>
        ) : null}

        {etapa === 'controle-qualidade' ? (
          <ControleQualidadePanel
            repositoriosDisponiveis={itens}
            onSuccess={showSuccess}
            onError={showError}
            busy={processando}
            setBusy={setProcessando}
          />
        ) : etapa !== 'recebimento' ? (
          <Card>
            <div className="flex gap-3 items-end mb-4">
              <div className="w-full md:w-80">
                <Input
                  label="Buscar"
                  value={filtroBusca}
                  onChange={(e) => {
                    setFiltroBusca(e.target.value);
                    setPagina(1);
                  }}
                  placeholder="ID GED, unidade ou projeto"
                />
              </div>
              <Button variant="secondary" onClick={() => invalidateRepos()} loading={processando}>
                Atualizar
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      ID GED
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      Unidade
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      Projeto
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                      Proc.
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      Progresso
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      Tempo
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {itens.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        Nenhum Repositório na Fila desta Etapa.
                      </td>
                    </tr>
                  ) : (
                    itens.map((item) => (
                      <tr
                        key={item.id_repositorio_recorda}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {item.id_repositorio_ged}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{item.orgao}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{item.projeto}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={item.status_atual} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${(item.total_processos ?? 0) > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}
                          >
                            {item.total_processos ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ProgressIndicator
                            steps={[
                              {
                                label: 'CK',
                                done: !!item.checklist_concluido,
                                active: !!item.checklist_aberto,
                              },
                              { label: 'Prod', done: !!item.producao_registrada },
                              { label: 'Rel', done: (item.total_relatorios ?? 0) > 0 },
                            ]}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {item.segundos_na_etapa != null ? (
                            <AgingBadge segundos={item.segundos_na_etapa} />
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ActionMenu
                            disabled={processando}
                            items={[
                              {
                                label: 'Checklist',
                                onClick: () =>
                                  void handleAbrirChecklist(item.id_repositorio_recorda),
                              },
                              {
                                label: 'Rel. Produção',
                                onClick: () =>
                                  void handleGerarRelatorioProducao(item.id_repositorio_recorda),
                              },
                              {
                                label: 'Registrar Produção',
                                onClick: () =>
                                  void handleRegistrarProducao(item.id_repositorio_recorda),
                              },
                              {
                                label: 'Avançar Etapa',
                                onClick: () => void handleOpenAvancar(item.id_repositorio_recorda),
                                hidden: !etapaConfig.nextEtapaApi,
                              },
                              {
                                label: 'Devolver',
                                onClick: () =>
                                  void handleDevolverEtapaAnterior(item.id_repositorio_recorda),
                                hidden: !etapaConfig.prevEtapaApi,
                              },
                              {
                                label: 'Excluir',
                                onClick: () => handleOpenExcluir(item.id_repositorio_recorda),
                                variant: 'danger',
                                hidden: !isAdmin,
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              pagina={pagina}
              totalPaginas={totalPaginas}
              onChange={setPagina}
              disabled={carregando}
            />
          </Card>
        ) : null}

        {checklistModalOpen && checklistHeader
          ? (() => {
              const preenchidos = checklistItens.filter((it) => it.resultado).length;
              const totalItens = checklistItens.length;
              const obrigatorios = checklistItens.filter((it) => it.obrigatorio).length;
              const obrigatoriosPreenchidos = checklistItens.filter(
                (it) => it.obrigatorio && it.resultado
              ).length;
              const todosObrigatoriosOk = obrigatoriosPreenchidos === obrigatorios;

              return (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-fade-in">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col animate-scale-in">
                    <div className="px-5 py-3 sm:px-6 sm:py-4 border-b flex items-center justify-between shrink-0">
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                          Checklist — {checklistHeader.etapa}
                        </h3>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {preenchidos}/{totalItens} preenchidos
                          {obrigatorios > 0
                            ? ` · ${obrigatoriosPreenchidos}/${obrigatorios} obrigatórios`
                            : ''}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        icon="x"
                        iconOnly
                        onClick={() => setChecklistModalOpen(false)}
                      />
                    </div>

                    <div className="flex-1 overflow-auto p-5 sm:p-6 space-y-2">
                      {checklistItens.map((item, idx) => {
                        const preenchido = !!item.resultado;
                        const naoConforme = item.resultado === 'NAO_CONFORME_COM_TRATATIVA';
                        return (
                          <div
                            key={item.id}
                            className={`border rounded-lg px-4 py-3 transition-colors ${preenchido ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'}`}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${preenchido ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}
                              >
                                {idx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-medium text-gray-900">
                                    {item.descricao}
                                  </span>
                                  {item.obrigatorio ? (
                                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                                      Obrigatório
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <select
                                    className={`h-9 px-3 border rounded-lg text-sm flex-shrink-0 sm:w-56 ${!preenchido && item.obrigatorio ? 'border-blue-300' : 'border-gray-300'}`}
                                    value={item.resultado ?? ''}
                                    onChange={(e) => {
                                      const value = e.target.value as ResultadoChecklist;
                                      setChecklistItens((prev) =>
                                        prev.map((it) =>
                                          it.id === item.id
                                            ? { ...it, resultado: value || null }
                                            : it
                                        )
                                      );
                                    }}
                                  >
                                    <option value="">— Selecione —</option>
                                    <option value="CONFORME">Conforme</option>
                                    <option value="NAO_CONFORME_COM_TRATATIVA">
                                      Não conforme c/ tratativa
                                    </option>
                                  </select>
                                  {naoConforme ? (
                                    <input
                                      type="text"
                                      className="h-9 px-3 border border-gray-300 rounded-lg text-sm flex-1"
                                      placeholder="Observação (obrigatória para não conforme)"
                                      value={item.observacao ?? ''}
                                      onChange={(e) =>
                                        setChecklistItens((prev) =>
                                          prev.map((it) =>
                                            it.id === item.id
                                              ? { ...it, observacao: e.target.value }
                                              : it
                                          )
                                        )
                                      }
                                    />
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="px-5 py-3 sm:px-6 sm:py-4 border-t flex items-center justify-between shrink-0">
                      <p className="text-xs text-gray-500">
                        {todosObrigatoriosOk
                          ? 'Todos os itens obrigatórios preenchidos.'
                          : `Faltam ${obrigatorios - obrigatoriosPreenchidos} item(ns) obrigatório(s).`}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setChecklistModalOpen(false)}>
                          Cancelar
                        </Button>
                        <Button
                          onClick={() => void handleConcluirChecklist()}
                          loading={processando}
                          disabled={!todosObrigatoriosOk}
                        >
                          Concluir Checklist
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          : null}

        {avancarModalOpen ? (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col animate-scale-in">
              <div className="px-6 py-4 border-b shrink-0">
                <h3 className="text-lg font-semibold text-gray-900">
                  Avançar para {etapaConfig.nextEtapaApi}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Verifique os documentos e confirme o avanço.
                </p>
              </div>

              <div className="flex-1 overflow-auto px-6 py-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">
                  Processos no repositório ({avancarDocs.length})
                </h4>
                {avancarDocs.length === 0 ? (
                  <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                    Nenhum Processo cadastrado neste Repositório.
                  </p>
                ) : (
                  <div className="overflow-x-auto max-h-56 overflow-y-auto border rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                            #
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                            Protocolo
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                            Interessado
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                            Vol.
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {avancarDocs.map((doc, idx) => (
                          <tr key={doc.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">{doc.processo}</td>
                            <td className="px-3 py-2 text-sm text-gray-700">{doc.interessado}</td>
                            <td className="px-3 py-2 text-sm text-gray-700">{doc.volume}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {avancarDocs.length > 0 ? (
                  <label className="flex items-start gap-3 mt-4 p-3 border rounded-lg cursor-pointer hover:bg-blue-50/50 transition-colors">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={avancarConfirmado}
                      onChange={(e) => setAvancarConfirmado(e.target.checked)}
                    />
                    <span className="text-sm text-gray-700">
                      Confirmo que todos os <strong>{avancarDocs.length} documento(s)</strong>{' '}
                      listados acima estão presentes no <strong>físico</strong> e no{' '}
                      <strong>GED</strong>.
                    </span>
                  </label>
                ) : null}
              </div>

              <div className="px-6 py-4 border-t flex items-center justify-between shrink-0">
                <p className="text-xs text-gray-500">
                  {avancarDocs.length === 0
                    ? 'Sem processos cadastrados.'
                    : !avancarConfirmado
                      ? 'Marque a confirmação para prosseguir.'
                      : 'Pronto para avançar.'}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setAvancarModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => void handleConfirmarAvancar()}
                    loading={processando}
                    disabled={avancarDocs.length > 0 && !avancarConfirmado}
                  >
                    Confirmar Avanço
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <ConfirmDialog
          state={confirmDialog.state}
          loading={confirmDialog.loading}
          onConfirm={() => void confirmDialog.handleConfirm()}
          onCancel={confirmDialog.close}
        />
        <ConfirmDialog
          state={recebimentoConfirmDialog.state}
          loading={recebimentoConfirmDialog.loading}
          onConfirm={() => void recebimentoConfirmDialog.handleConfirm()}
          onCancel={recebimentoConfirmDialog.close}
        />

        {/* Modal: Adicionar em Lote */}
        {batchAddModalOpen ? (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col animate-scale-in">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Importação em Lote</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Formato: protocolo (TAB) interessado — um por linha.
                </p>
              </div>

              <div className="px-6 py-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Repositório</label>
                <select
                  className="w-full h-9 px-3 border rounded-lg text-sm"
                  value={batchRepoId}
                  onChange={(e) => setBatchRepoId(e.target.value)}
                >
                  <option value="">— Selecione —</option>
                  {itens.map((repo) => (
                    <option key={repo.id_repositorio_recorda} value={repo.id_repositorio_recorda}>
                      {repo.id_repositorio_ged} — {repo.orgao}
                    </option>
                  ))}
                </select>
              </div>

              <div className="px-6 py-3 flex-1 overflow-auto">
                <label className="block text-sm font-medium text-gray-700 mb-1">Dados</label>
                <textarea
                  className="w-full h-64 px-3 py-2 border rounded-lg text-sm font-mono"
                  placeholder="502824/2021&#9;JBS S/A&#10;502825/2021&#9;Prefeitura Municipal"
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Separe protocolo e interessado com TAB.
                </p>
              </div>

              <div className="px-6 py-4 border-t flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setBatchAddModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => void handleAdicionarEmLote()}
                  loading={processando}
                  disabled={!batchRepoId || !batchText.trim()}
                >
                  Adicionar
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {ocrModalOpen && ocrRepo ? (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-fade-in">
            <div className="bg-white w-full h-[95vh] sm:h-auto sm:max-h-[92vh] sm:max-w-6xl rounded-t-xl sm:rounded-xl shadow-xl overflow-hidden flex flex-col animate-scale-in">
              <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Recebimento — Processos</h3>
                  <p className="text-sm text-gray-500">
                    ID GED: {ocrRepo.id_repositorio_ged} · {ocrRepo.orgao}
                  </p>
                </div>
                <Button variant="ghost" icon="x" iconOnly onClick={() => setOcrModalOpen(false)} />
              </div>

              {/* Tabs */}
              <div className="px-6 pt-3 border-b shrink-0 flex gap-4">
                <button
                  className={`pb-2 text-sm font-medium border-b-2 ${recebTab === 'processos' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setRecebTab('processos')}
                >
                  Processos ({recebProcessos.length})
                </button>
                <button
                  className={`pb-2 text-sm font-medium border-b-2 ${recebTab === 'ocr' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setRecebTab('ocr')}
                >
                  Novo Processo
                </button>
              </div>

              <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-4 sm:space-y-5">
                {recebTab === 'ocr' ? (
                  <>
                    {/* OCR Upload */}
                    <Card>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">
                        Imagem do Protocolo
                      </h4>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          onChange={(e) => void handleUploadImagemOCR(e.target.files?.[0] ?? null)}
                          className="block w-full sm:flex-1 text-sm text-gray-700"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => void handleProcessarOCR()}
                            loading={ocrProcessando}
                          >
                            Processar OCR
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setOcrImagemBase64('');
                              setOcrPreview(null);
                            }}
                            disabled={ocrProcessando}
                          >
                            Limpar
                          </Button>
                        </div>
                      </div>
                      {ocrPreview ? (
                        <p className="mt-2 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 inline-block">
                          Confiança OCR: {(ocrPreview.confianca * 100).toFixed(1)}%
                        </p>
                      ) : null}
                    </Card>

                    {/* Formulário simplificado */}
                    <Card>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">
                        Cadastro de Documento
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tipo de cadastro
                          </label>
                          <select
                            className="w-full h-9 px-3 border rounded-lg text-sm"
                            value={apensoModalOpen ? 'APENSO' : 'PROCESSO'}
                            onChange={(e) => {
                              const apenso = e.target.value === 'APENSO';
                              setApensoModalOpen(apenso);
                              if (!apenso) setApensoProcessoId('');
                            }}
                          >
                            <option value="PROCESSO">Edital/Processo</option>
                            <option value="APENSO">Apenso Cadastrado</option>
                          </select>
                        </div>
                        {apensoModalOpen ? (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Processo Principal
                            </label>
                            <select
                              className="w-full h-9 px-3 border rounded-lg text-sm"
                              value={apensoProcessoId}
                              onChange={(e) => setApensoProcessoId(e.target.value)}
                            >
                              <option value="">— Selecione —</option>
                              {recebProcessos.map((proc) => (
                                <option key={proc.id} value={proc.id}>
                                  {proc.protocolo} - {proc.interessado}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        <Input
                          label="Protocolo *"
                          value={docForm.protocolo}
                          onChange={(e) => setDocForm((p) => ({ ...p, protocolo: e.target.value }))}
                          placeholder="Ex: 502824/2021"
                        />
                        <Input
                          label="Interessado *"
                          value={docForm.interessado}
                          onChange={(e) =>
                            setDocForm((p) => ({ ...p, interessado: e.target.value }))
                          }
                          placeholder="Ex: JBS S/A"
                        />

                        {/* Setor - creatable selector */}
                        {!apensoModalOpen ? (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Setor (quem enviou)
                            </label>
                            <div className="flex gap-1">
                              <select
                                className="flex-1 h-9 px-3 border rounded-lg text-sm"
                                value={docForm.setorId}
                                onChange={(e) =>
                                  setDocForm((p) => ({ ...p, setorId: e.target.value }))
                                }
                              >
                                <option value="">— Selecione —</option>
                                {setoresOptions.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.nome}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex gap-1 mt-1">
                              <input
                                type="text"
                                className="flex-1 h-8 px-2 border rounded text-xs"
                                placeholder="Novo setor..."
                                value={novoSetorInput}
                                onChange={(e) => setNovoSetorInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleCriarSetor();
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="h-8 px-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                onClick={() => void handleCriarSetor()}
                                disabled={!novoSetorInput.trim()}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ) : null}

                        <div className="flex gap-3">
                          <div className="flex-1">
                            <Input
                              label="Volume"
                              type="number"
                              min={1}
                              value={String(docForm.volumeAtual)}
                              onChange={(e) =>
                                setDocForm((p) => ({
                                  ...p,
                                  volumeAtual: Math.max(Number(e.target.value || 1), 1),
                                }))
                              }
                            />
                          </div>
                          <span className="self-end pb-2 text-gray-500 text-sm">de</span>
                          <div className="flex-1">
                            <Input
                              label="Total"
                              type="number"
                              min={0}
                              value={String(docForm.volumeTotal)}
                              onChange={(e) =>
                                setDocForm((p) => ({
                                  ...p,
                                  volumeTotal: Math.max(Number(e.target.value || 0), 0),
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        {apensoModalOpen ? (
                          <Button
                            onClick={() => void handleAdicionarApenso()}
                            loading={ocrProcessando}
                          >
                            Salvar Apenso
                          </Button>
                        ) : (
                          <Button
                            onClick={() => void handleSalvarProcessoRecebimento()}
                            loading={ocrProcessando}
                          >
                            Salvar Processo
                          </Button>
                        )}
                        {apensoModalOpen ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setApensoModalOpen(false);
                              setApensoProcessoId('');
                              setDocForm({ ...EMPTY_DOC_FORM });
                            }}
                          >
                            Cancelar Apenso
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setDocForm({ ...EMPTY_DOC_FORM });
                              setOcrPreview(null);
                              setOcrImagemBase64('');
                            }}
                          >
                            Limpar Formulário
                          </Button>
                        )}
                      </div>
                    </Card>
                  </>
                ) : (
                  /* Tab Processos */
                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-900">
                        Processos registrados ({recebProcessos.length})
                      </h4>
                      <Button
                        size="sm"
                        onClick={() => {
                          setDocForm({ ...EMPTY_DOC_FORM });
                          setApensoModalOpen(false);
                          setApensoProcessoId('');
                          setRecebTab('ocr');
                        }}
                      >
                        + Novo Processo
                      </Button>
                    </div>

                    {recebProcessos.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-8">
                        Nenhum Processo registrado.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {recebProcessos.map((proc) => (
                          <div key={proc.id} className="border rounded-lg overflow-hidden">
                            {/* Processo principal */}
                            <div className="bg-blue-50 px-3 py-3">
                              {/* Protocolo + Volume */}
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-base text-blue-900">
                                  {proc.protocolo}
                                </span>
                                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded whitespace-nowrap">
                                  Vol. {proc.volume_atual}
                                  {proc.volume_total > 0 ? `/${proc.volume_total}` : ''}
                                </span>
                              </div>
                              {/* Origem + Interessado */}
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                  {proc.origem}
                                </span>
                                <span className="text-sm text-gray-800">{proc.interessado}</span>
                              </div>
                              {/* Setor e Classificação */}
                              {(proc.setor_nome || proc.classificacao_nome) && (
                                <p className="text-xs text-gray-500">
                                  {proc.setor_nome && <>Setor: {proc.setor_nome}</>}
                                  {proc.setor_nome && proc.classificacao_nome && ' · '}
                                  {proc.classificacao_nome && (
                                    <>Classif: {proc.classificacao_nome}</>
                                  )}
                                </p>
                              )}
                              {/* Botões em linha separada */}
                              <div className="flex gap-2 mt-2 pt-2 border-t border-blue-100">
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() => {
                                    setApensoProcessoId(proc.id);
                                    setApensoModalOpen(true);
                                    setDocForm({ ...EMPTY_DOC_FORM });
                                    setRecebTab('ocr');
                                  }}
                                >
                                  + Apenso
                                </Button>
                                <Button
                                  size="xs"
                                  variant="danger"
                                  onClick={() => handleExcluirProcessoRecebimento(proc.id)}
                                  disabled={ocrProcessando}
                                >
                                  Excluir
                                </Button>
                              </div>
                            </div>

                            {/* Apensos */}
                            {proc.apensos.length > 0 && (
                              <div className="border-t bg-gray-50">
                                {proc.apensos.map((ap) => (
                                  <div key={ap.id} className="px-3 py-2 border-b last:border-b-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-xs text-gray-400">↳</span>
                                      <span className="font-semibold text-sm text-gray-800">
                                        {ap.protocolo}
                                      </span>
                                      <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded whitespace-nowrap">
                                        Vol. {ap.volume_atual}
                                        {ap.volume_total > 0 ? `/${ap.volume_total}` : ''}
                                      </span>
                                    </div>
                                    {ap.interessado && (
                                      <p className="text-xs text-gray-600 ml-4 mb-1">
                                        {ap.interessado}
                                      </p>
                                    )}
                                    <div className="ml-4">
                                      <Button
                                        size="xs"
                                        variant="danger"
                                        onClick={() => handleExcluirApenso(ap.id)}
                                        disabled={ocrProcessando}
                                      >
                                        Excluir
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}
              </div>

              <div className="px-6 py-3 border-t flex justify-end shrink-0">
                <Button variant="secondary" onClick={() => setOcrModalOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Preview Termo de Recebimento */}
        {previewTermoUrl ? (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-scale-in">
              <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
                <h3 className="text-lg font-semibold text-gray-900">Termo de Recebimento</h3>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const iframe = document.getElementById(
                        'termo-preview-iframe'
                      ) as HTMLIFrameElement | null;
                      if (iframe?.contentWindow) iframe.contentWindow.print();
                    }}
                  >
                    Imprimir
                  </Button>
                  <Button size="sm" onClick={() => void handleDownloadTermo()}>
                    Baixar PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (previewTermoUrl) URL.revokeObjectURL(previewTermoUrl);
                      setPreviewTermoUrl(null);
                      setPreviewTermoReportId(null);
                    }}
                  >
                    Fechar
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <iframe
                  id="termo-preview-iframe"
                  src={previewTermoUrl}
                  className="w-full h-full border-0"
                  title="Preview do Termo de Recebimento"
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PageState>
  );
}
