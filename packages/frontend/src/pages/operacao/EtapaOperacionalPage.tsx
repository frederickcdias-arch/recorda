import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import type { StatusRepositorio, OrigemDocumentoRecebimento } from '@recorda/shared';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageState } from '../../components/ui/PageState';
import { useToastHelpers } from '../../components/ui/Toast';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { extractErrorMessage } from '../../utils/errors';
import { useRecebimento } from '../../hooks/useRecebimento';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useDebounce } from '../../hooks/useDebounce';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Pagination } from '../../components/ui/Pagination';
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

const ControleQualidadePanel = lazy(() =>
  import('./ControleQualidadePanel').then((module) => ({ default: module.ControleQualidadePanel }))
);

const RecebimentoAvulsosPanel = lazy(() =>
  import('./RecebimentoAvulsosPanel').then((module) => ({
    default: module.RecebimentoAvulsosPanel,
  }))
);

const RecebimentoOcrModal = lazy(() =>
  import('./RecebimentoOcrModal').then((module) => ({
    default: module.RecebimentoOcrModal,
  }))
);

const ChecklistModal = lazy(() =>
  import('./ChecklistModal').then((module) => ({
    default: module.ChecklistModal,
  }))
);

const AvancarEtapaModal = lazy(() =>
  import('./AvancarEtapaModal').then((module) => ({
    default: module.AvancarEtapaModal,
  }))
);

const BatchAddModal = lazy(() =>
  import('./BatchAddModal').then((module) => ({
    default: module.BatchAddModal,
  }))
);

const PdfPreviewModal = lazy(() =>
  import('./PdfPreviewModal').then((module) => ({
    default: module.PdfPreviewModal,
  }))
);

function PanelLoadingFallback({ title }: { title: string }): JSX.Element {
  return (
    <Card>
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-border-secondary)] border-t-[var(--color-brand-500)]" />
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">Carregando painel</p>
          <p className="text-sm text-[var(--color-text-tertiary)]">{title}</p>
        </div>
      </div>
    </Card>
  );
}

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
  const [etiquetaPdfFiles, setEtiquetaPdfFiles] = useState<File[]>([]);
  const [etiquetaPdfInputKey, setEtiquetaPdfInputKey] = useState(0);
  const [etiquetaPdfProcessando, setEtiquetaPdfProcessando] = useState(false);
  const [previewEtiquetasUrl, setPreviewEtiquetasUrl] = useState<string | null>(null);
  const [previewEtiquetasFilename, setPreviewEtiquetasFilename] = useState<string | null>(null);

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

  useEffect(() => {
    const params = new URLSearchParams();
    if (filtrosUrl.status) params.set('status', filtrosUrl.status);
    if (filtroBusca.trim()) params.set('busca', filtroBusca.trim());
    if (filtroUnidade) params.set('orgao', filtroUnidade);
    if (filtroDataInicio) params.set('dataInicio', filtroDataInicio);
    if (filtroDataFim) params.set('dataFim', filtroDataFim);

    const nextSearch = params.toString();
    const currentSearch = location.search.startsWith('?')
      ? location.search.slice(1)
      : location.search;

    if (nextSearch !== currentSearch) {
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
        },
        { replace: true }
      );
    }
  }, [
    filtroBusca,
    filtroUnidade,
    filtroDataInicio,
    filtroDataFim,
    filtrosUrl.status,
    location.pathname,
    location.search,
    navigate,
  ]);

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

    return (): void => {
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

  const invalidateRepos = (): void =>
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
    return (
      <div className="text-center text-[var(--color-text-secondary)] py-12">
        Etapa Operacional inválida.
      </div>
    );
  }

  const irProximaEtapa = (): void => {
    if (!etapaConfig.nextPath) return;
    navigate(`${etapaConfig.nextPath}${location.search}`);
  };

  const showSuccess = (texto: string): void => toast.success(texto);
  const showError = (texto: string): void => toast.error(texto);

  const handleFecharPreviewEtiquetas = (): void => {
    if (previewEtiquetasUrl) {
      URL.revokeObjectURL(previewEtiquetasUrl);
    }
    setPreviewEtiquetasUrl(null);
    setPreviewEtiquetasFilename(null);
  };

  const handleDownloadPreviewEtiquetas = (): void => {
    if (!previewEtiquetasUrl) return;

    const link = document.createElement('a');
    link.href = previewEtiquetasUrl;
    link.download = previewEtiquetasFilename ?? 'etiquetas-4-por-folha.pdf';
    link.click();
  };

  const handleCompactarEtiquetasPdf = async (): Promise<void> => {
    if (etiquetaPdfFiles.length === 0) {
      showError('Selecione um ou mais PDFs de etiquetas para processar.');
      return;
    }

    try {
      setEtiquetaPdfProcessando(true);
      const formData = new FormData();
      etiquetaPdfFiles.forEach((file) => formData.append('arquivo', file));

      const response = await api.fetchWithAuth('/operacional/etiquetas/compactar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error ?? 'Erro ao processar PDF de etiquetas.');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const baseName = etiquetaPdfFiles[0]!.name.toLowerCase().endsWith('.pdf')
        ? etiquetaPdfFiles[0]!.name.slice(0, -4)
        : etiquetaPdfFiles[0]!.name;
      const filename = `${baseName || 'etiquetas'}-4-por-folha.pdf`;

      if (previewEtiquetasUrl) {
        URL.revokeObjectURL(previewEtiquetasUrl);
      }
      setPreviewEtiquetasUrl(downloadUrl);
      setPreviewEtiquetasFilename(filename);
      setEtiquetaPdfFiles([]);
      setEtiquetaPdfInputKey((current) => current + 1);
      showSuccess('PDF processado. Confira a visualização antes de imprimir.');
    } catch (error) {
      showError(extractErrorMessage(error, 'Erro ao processar PDF de etiquetas'));
    } finally {
      setEtiquetaPdfProcessando(false);
    }
  };

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
          onClick: (): void => invalidateRepos(),
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
        <PageHeader
          title={etapaConfig.label}
          subtitle="Fila operacional."
          actions={
            etapaConfig.nextPath ? (
              <Button variant="secondary" size="sm" onClick={irProximaEtapa}>
                Ir para próxima etapa
              </Button>
            ) : undefined
          }
        />

        {/* Summary cards */}
        {totalGeral > 0 ? (
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl px-4 py-3">
              <p className="text-xs text-[var(--color-text-secondary)] font-medium">Total</p>
              <p className="text-2xl font-bold text-[var(--color-text-primary)] mt-1">
                {totalGeral}
              </p>
            </div>
            {Object.entries(contadores).map(([status, qtd]) => (
              <div
                key={status}
                className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl px-4 py-3"
              >
                <p className="text-xs text-[var(--color-text-secondary)] font-medium truncate">
                  <StatusBadge status={status} />
                </p>
                <p className="text-2xl font-bold text-[var(--color-text-primary)] mt-1">{qtd}</p>
              </div>
            ))}
          </div>
        ) : null}

        {etapa === 'recebimento' ? (
          <>
            {/* Sub-tabs: Repositórios | Avulsos */}
            <div className="overflow-x-auto border-b border-[var(--color-border-primary)]">
              <div className="flex min-w-max gap-1">
                <button
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    recebSubTab === 'repositorios'
                      ? 'border-primary-600 text-primary-700'
                      : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                  }`}
                  onClick={() => setRecebSubTab('repositorios')}
                >
                  Repositórios ({itens.length})
                </button>
                <button
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    recebSubTab === 'avulsos'
                      ? 'border-primary-600 text-primary-700'
                      : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                  }`}
                  onClick={() => setRecebSubTab('avulsos')}
                >
                  Avulsos
                </button>
              </div>
            </div>

            {recebSubTab === 'repositorios' ? (
              <div className="space-y-6 pb-24 md:pb-0">
                <Card>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                        Etiquetas de localização
                      </h2>
                      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                        Agrupa 4 etiquetas por folha, em layout vertical.
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div>
                        <label
                          htmlFor="etiquetaPdfFiles"
                          className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
                        >
                          PDFs de etiquetas
                        </label>
                        <input
                          id="etiquetaPdfFiles"
                          key={etiquetaPdfInputKey}
                          type="file"
                          accept="application/pdf,.pdf"
                          multiple
                          className="block w-full text-sm text-[var(--color-text-secondary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-bg-secondary)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--color-text-secondary)] hover:file:bg-[var(--color-border-primary)]"
                          onChange={(e) => setEtiquetaPdfFiles(Array.from(e.target.files ?? []))}
                        />
                        {etiquetaPdfFiles.length > 0 ? (
                          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                            {etiquetaPdfFiles.length} arquivo(s) selecionado(s).
                          </p>
                        ) : null}
                      </div>
                      <Button
                        fullWidth
                        className="sm:w-auto"
                        onClick={() => void handleCompactarEtiquetasPdf()}
                        loading={etiquetaPdfProcessando}
                        disabled={etiquetaPdfFiles.length === 0 || etiquetaPdfProcessando}
                      >
                        Gerar PDF 4 por folha
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card>
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
                    Criar Repositório
                  </h2>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
                      <label
                        htmlFor="novoRepositorioUnidade"
                        className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
                      >
                        Unidade
                      </label>
                      <select
                        id="novoRepositorioUnidade"
                        className="w-full h-11 px-3 border rounded-lg text-sm bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border-[var(--color-border-primary)]"
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
                      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                        <input
                          className="h-10 flex-1 rounded border border-[var(--color-border-primary)] px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-300"
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
                          className="h-10 rounded bg-primary-600 px-3 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                          onClick={() => void handleCriarUnidadeRapida()}
                          disabled={!novaUnidadeInput.trim() || processando}
                          title="Adicionar e selecionar unidade"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor="novoRepositorioProjeto"
                        className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
                      >
                        Projeto
                      </label>
                      <select
                        id="novoRepositorioProjeto"
                        className="w-full h-11 px-3 border rounded-lg text-sm bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border-[var(--color-border-primary)]"
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
                      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                        <input
                          className="h-10 flex-1 rounded border border-[var(--color-border-primary)] px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-300"
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
                          className="h-10 rounded bg-primary-600 px-3 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
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
                        <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                          Cadastro rápido disponível para administrador.
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label
                        htmlFor="novoRepositorioClassificacao"
                        className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
                      >
                        Classificação
                      </label>
                      <select
                        id="novoRepositorioClassificacao"
                        className="w-full h-11 px-3 border rounded-lg text-sm bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border-[var(--color-border-primary)]"
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
                    <div className="relative inline-block">
                      <Button
                        fullWidth
                        className="sm:w-auto"
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
                        Criar Repositório
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
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
                      <label
                        htmlFor="filtroUnidade"
                        className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
                      >
                        Unidade
                      </label>
                      <select
                        id="filtroUnidade"
                        className="w-full h-11 px-3 border border-[var(--color-border-primary)] rounded-lg text-sm bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]"
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
                        max={filtroDataFim || undefined}
                        onChange={(e) => {
                          setFiltroDataInicio(e.target.value);
                          setPagina(1);
                        }}
                      />
                    </div>
                    <div>
                      <Input
                        label="Data Final"
                        type="date"
                        value={filtroDataFim}
                        min={filtroDataInicio || undefined}
                        onChange={(e) => {
                          setFiltroDataFim(e.target.value);
                          setPagina(1);
                        }}
                      />
                    </div>
                  </div>
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-amber-900 font-medium">
                          {avulsosBuscaLoading
                            ? 'Buscando também nos avulsos...'
                            : avulsosBuscaItens.length > 0
                              ? `Também encontrado(s) ${avulsosBuscaItens.length} processo(s) avulso(s)`
                              : 'Nenhum avulso encontrado para este termo'}
                        </p>
                        {avulsosBuscaItens.length > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            fullWidth
                            className="sm:w-auto"
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
                      <div className="px-4 py-8 text-center text-[var(--color-text-secondary)] border border-[var(--color-border-primary)] rounded-lg">
                        Nenhum Repositório na Fila desta Etapa.
                      </div>
                    ) : (
                      itens.map((item) => (
                        <div
                          key={item.id_repositorio_recorda}
                          className={`border rounded-xl p-3 ${reposSelecionadosTermo.has(item.id_repositorio_recorda) ? 'bg-[var(--color-primary-50)] border-[var(--color-primary-300)]' : 'bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                                {item.id_repositorio_ged}
                              </p>
                              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                                {item.orgao}
                              </p>
                              <p className="text-xs text-[var(--color-text-tertiary)]">
                                {item.projeto}
                              </p>
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
                              aria-label={`Selecionar repositório ${item.id_repositorio_ged}`}
                            />
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <StatusBadge status={item.status_atual} />
                            <span
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium ${(item.total_processos ?? 0) > 0 ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]'}`}
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
                    <table className="min-w-full divide-y divide-[var(--color-border-primary)]">
                      <thead className="bg-[var(--color-bg-secondary)]">
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
                              aria-label="Selecionar todos os repositórios"
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                            ID GED
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                            Unidade
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                            Projeto
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                            Status
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-[var(--color-text-secondary)]">
                            Proc.
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                            Progresso
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                            Tempo
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)]">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-[var(--color-bg-primary)] divide-y divide-[var(--color-border-secondary)]">
                        {itens.length === 0 ? (
                          <tr>
                            <td
                              colSpan={9}
                              className="px-4 py-8 text-center text-[var(--color-text-secondary)]"
                            >
                              Nenhum Repositório na Fila desta Etapa.
                            </td>
                          </tr>
                        ) : (
                          itens.map((item) => (
                            <tr
                              key={item.id_repositorio_recorda}
                              className={`hover:bg-[var(--color-bg-secondary)] transition-colors ${reposSelecionadosTermo.has(item.id_repositorio_recorda) ? 'bg-[var(--color-primary-50)]' : ''}`}
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
                                  aria-label={`Selecionar repositório ${item.id_repositorio_ged}`}
                                />
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-[var(--color-text-primary)]">
                                {item.id_repositorio_ged}
                              </td>
                              <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                                {item.orgao}
                              </td>
                              <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                                {item.projeto}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge status={item.status_atual} />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${(item.total_processos ?? 0) > 0 ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]'}`}
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
              <Suspense fallback={<PanelLoadingFallback title="Recebimento de avulsos" />}>
                <RecebimentoAvulsosPanel onSuccess={showSuccess} onError={showError} />
              </Suspense>
            )}
          </>
        ) : null}

        {etapa === 'controle-qualidade' ? (
          <Suspense fallback={<PanelLoadingFallback title="Controle de Qualidade" />}>
            <ControleQualidadePanel
              repositoriosDisponiveis={itens}
              onSuccess={showSuccess}
              onError={showError}
              busy={processando}
              setBusy={setProcessando}
            />
          </Suspense>
        ) : etapa !== 'recebimento' ? (
          <Card>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
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
              <Button
                variant="secondary"
                fullWidth
                className="sm:w-auto"
                onClick={() => invalidateRepos()}
                loading={processando}
              >
                Atualizar
              </Button>
            </div>

            <div className="space-y-3 md:hidden">
              {itens.length === 0 ? (
                <div className="rounded-lg border border-[var(--color-border-primary)] px-4 py-8 text-center text-[var(--color-text-secondary)]">
                  Nenhum Repositório na Fila desta Etapa.
                </div>
              ) : (
                itens.map((item) => (
                  <div
                    key={item.id_repositorio_recorda}
                    className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {item.id_repositorio_ged}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                          {item.orgao}
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">{item.projeto}</p>
                      </div>
                      <StatusBadge status={item.status_atual} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${(item.total_processos ?? 0) > 0 ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]'}`}
                      >
                        {item.total_processos ?? 0}
                      </span>
                      {item.segundos_na_etapa != null ? (
                        <AgingBadge segundos={item.segundos_na_etapa} />
                      ) : null}
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
                    <div className="mt-3 flex justify-end">
                      <ActionMenu
                        disabled={processando}
                        items={[
                          {
                            label: 'Checklist',
                            onClick: () => void handleAbrirChecklist(item.id_repositorio_recorda),
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
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--color-border-primary)]">
                <thead className="bg-[var(--color-bg-secondary)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      ID GED
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Unidade
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Projeto
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Status
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-[var(--color-text-secondary)]">
                      Proc.
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Progresso
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Tempo
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)]">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-[var(--color-bg-primary)] divide-y divide-[var(--color-border-secondary)]">
                  {itens.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-8 text-center text-[var(--color-text-secondary)]"
                      >
                        Nenhum Repositório na Fila desta Etapa.
                      </td>
                    </tr>
                  ) : (
                    itens.map((item) => (
                      <tr
                        key={item.id_repositorio_recorda}
                        className="hover:bg-[var(--color-bg-secondary)] transition-colors"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-[var(--color-text-primary)]">
                          {item.id_repositorio_ged}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                          {item.orgao}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                          {item.projeto}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={item.status_atual} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${(item.total_processos ?? 0) > 0 ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]'}`}
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

        <Suspense
          fallback={checklistModalOpen ? <PanelLoadingFallback title="Checklist da etapa" /> : null}
        >
          <ChecklistModal
            open={checklistModalOpen}
            header={checklistHeader}
            itens={checklistItens}
            setItens={setChecklistItens}
            loading={processando}
            onClose={() => setChecklistModalOpen(false)}
            onConfirm={handleConcluirChecklist}
          />
        </Suspense>

        <Suspense
          fallback={
            avancarModalOpen ? <PanelLoadingFallback title="Confirmação de avanço" /> : null
          }
        >
          <AvancarEtapaModal
            open={avancarModalOpen}
            etapaDestino={etapaConfig.nextEtapaApi}
            docs={avancarDocs}
            confirmado={avancarConfirmado}
            setConfirmado={setAvancarConfirmado}
            loading={processando}
            onClose={() => setAvancarModalOpen(false)}
            onConfirm={handleConfirmarAvancar}
          />
        </Suspense>

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

        <Suspense
          fallback={batchAddModalOpen ? <PanelLoadingFallback title="Importação em lote" /> : null}
        >
          <BatchAddModal
            open={batchAddModalOpen}
            repositorios={itens}
            repoId={batchRepoId}
            setRepoId={setBatchRepoId}
            text={batchText}
            setText={setBatchText}
            loading={processando}
            onClose={() => setBatchAddModalOpen(false)}
            onConfirm={handleAdicionarEmLote}
          />
        </Suspense>

        <Suspense
          fallback={ocrModalOpen ? <PanelLoadingFallback title="Recebimento por OCR" /> : null}
        >
          <RecebimentoOcrModal
            open={ocrModalOpen}
            ocrRepo={ocrRepo}
            onClose={() => setOcrModalOpen(false)}
            recebTab={recebTab}
            setRecebTab={setRecebTab}
            recebProcessos={recebProcessos}
            ocrProcessando={ocrProcessando}
            ocrPreview={ocrPreview}
            onUploadImagemOCR={handleUploadImagemOCR}
            onProcessarOCR={handleProcessarOCR}
            setOcrPreview={setOcrPreview}
            setOcrImagemBase64={setOcrImagemBase64}
            apensoModalOpen={apensoModalOpen}
            setApensoModalOpen={setApensoModalOpen}
            apensoProcessoId={apensoProcessoId}
            setApensoProcessoId={setApensoProcessoId}
            setoresOptions={setoresOptions}
            novoSetorInput={novoSetorInput}
            setNovoSetorInput={setNovoSetorInput}
            docForm={docForm}
            setDocForm={setDocForm}
            emptyDocForm={EMPTY_DOC_FORM}
            onCriarSetor={handleCriarSetor}
            onSalvarProcessoRecebimento={handleSalvarProcessoRecebimento}
            onExcluirProcessoRecebimento={handleExcluirProcessoRecebimento}
            onAdicionarApenso={handleAdicionarApenso}
            onExcluirApenso={handleExcluirApenso}
          />
        </Suspense>

        <Suspense
          fallback={
            previewTermoUrl ? <PanelLoadingFallback title="Pré-visualização do termo" /> : null
          }
        >
          <PdfPreviewModal
            open={!!previewTermoUrl}
            title="Termo de Recebimento"
            iframeId="termo-preview-iframe"
            src={previewTermoUrl}
            onDownload={handleDownloadTermo}
            onClose={() => {
              if (previewTermoUrl) URL.revokeObjectURL(previewTermoUrl);
              setPreviewTermoUrl(null);
              setPreviewTermoReportId(null);
            }}
          />
        </Suspense>

        <Suspense
          fallback={
            previewEtiquetasUrl ? (
              <PanelLoadingFallback title="Pré-visualização das etiquetas" />
            ) : null
          }
        >
          <PdfPreviewModal
            open={!!previewEtiquetasUrl}
            title="Pré-visualização das Etiquetas"
            iframeId="etiquetas-preview-iframe"
            src={previewEtiquetasUrl}
            onDownload={handleDownloadPreviewEtiquetas}
            onClose={handleFecharPreviewEtiquetas}
          />
        </Suspense>
      </div>
    </PageState>
  );
}
