import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { api } from '../../services/api';
import {
  useAvaliarDocumentoCQ, useAprovarTodosCQ, useConcluirCQ, useDevolverCQ,
  useGerarTermoCorrecao, useGerarTermoDevolucao, useGerarTermoDevolucaoMulti, useQueryClient, queryKeys,
} from '../../hooks/useQueries';

interface RepositorioItem {
  id_repositorio_recorda: string;
  id_repositorio_ged: string;
  orgao: string;
  projeto: string;
  status_atual: string;
  etapa_atual: string;
}

interface CQDocItem {
  processo_id: string;
  protocolo: string;
  interessado: string;
  volume: string;
  processo_obs: string | null;
  resultado: 'PENDENTE' | 'APROVADO' | 'REPROVADO';
  observacao: string | null;
  avaliador_nome: string | null;
  data_avaliacao: string | null;
  is_apenso: boolean;
  processo_principal_id: string | null;
}

type FiltroStatus = 'TODOS' | 'PENDENTE' | 'APROVADO' | 'REPROVADO';

interface CQResumo {
  total: number;
  aprovados: number;
  reprovados: number;
  pendentes: number;
}

interface ControleQualidadePanelProps {
  repositoriosDisponiveis: RepositorioItem[];
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  busy?: boolean;
  setBusy: (value: boolean) => void;
}

export function ControleQualidadePanel({
  repositoriosDisponiveis,
  onSuccess,
  onError,
  busy = false,
  setBusy,
}: ControleQualidadePanelProps): JSX.Element {
  const [repoSelecionadoId, setRepoSelecionadoId] = useState('');
  const [docs, setDocs] = useState<CQDocItem[]>([]);
  const [resumo, setResumo] = useState<CQResumo>({ total: 0, aprovados: 0, reprovados: 0, pendentes: 0 });
  const [obsPorDoc, setObsPorDoc] = useState<Record<string, string>>({});
  const [ultimoRelatorioId, setUltimoRelatorioId] = useState('');
  const [reposSelecionadosDev, setReposSelecionadosDev] = useState<Set<string>>(new Set());
  const [previewDevolucaoUrl, setPreviewDevolucaoUrl] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('TODOS');
  const [busca, setBusca] = useState('');
  const [reprovandoId, setReprovandoId] = useState<string | null>(null);
  const [confirmConcluir, setConfirmConcluir] = useState(false);
  const obsInputRef = useRef<HTMLInputElement>(null);
  const [filtroRepo, setFiltroRepo] = useState<string>('TODOS');
  const [buscaRepo, setBuscaRepo] = useState('');

  const avaliarMut = useAvaliarDocumentoCQ();
  const aprovarTodosMut = useAprovarTodosCQ();
  const concluirMut = useConcluirCQ();
  const devolverMut = useDevolverCQ();
  const termoCorrecaoMut = useGerarTermoCorrecao();
  const termoDevolucaoMut = useGerarTermoDevolucao();
  const termoDevolucaoMultiMut = useGerarTermoDevolucaoMulti();
  const queryClient = useQueryClient();

  const repoSelecionado = repositoriosDisponiveis.find((r) => r.id_repositorio_recorda === repoSelecionadoId);
  const isConcluido = repoSelecionado?.status_atual === 'CQ_APROVADO' || repoSelecionado?.status_atual === 'CQ_REPROVADO';

  const carregarAvaliacoes = useCallback(async (repoId: string) => {
    try {
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.cqAvaliacoes(repoId),
        queryFn: () => api.get<{ itens: CQDocItem[]; resumo: CQResumo }>(`/operacional/repositorios/${repoId}/cq-avaliacoes`),
        staleTime: 0,
      });
      setDocs(data.itens ?? []);
      setResumo(data.resumo ?? { total: 0, aprovados: 0, reprovados: 0, pendentes: 0 });
    } catch {
      setDocs([]);
      setResumo({ total: 0, aprovados: 0, reprovados: 0, pendentes: 0 });
    }
  }, [queryClient]);

  useEffect(() => {
    if (!repoSelecionadoId) {
      setDocs([]);
      setResumo({ total: 0, aprovados: 0, reprovados: 0, pendentes: 0 });
      setObsPorDoc({});
      return;
    }
    void carregarAvaliacoes(repoSelecionadoId);
  }, [repoSelecionadoId, carregarAvaliacoes]);

  const handleAvaliar = async (processoId: string, resultado: 'APROVADO' | 'REPROVADO'): Promise<void> => {
    if (!repoSelecionadoId) return;
    if (resultado === 'REPROVADO' && reprovandoId !== processoId) {
      setReprovandoId(processoId);
      setTimeout(() => obsInputRef.current?.focus(), 50);
      return;
    }
    try {
      setBusy(true);
      await avaliarMut.mutateAsync({
        repoId: repoSelecionadoId,
        processoId,
        resultado,
        observacao: resultado === 'REPROVADO' ? (obsPorDoc[processoId] || undefined) : undefined,
      });
      setReprovandoId(null);
      await carregarAvaliacoes(repoSelecionadoId);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao Avaliar Documento.');
    } finally {
      setBusy(false);
    }
  };

  const handleAprovarTodos = async (): Promise<void> => {
    if (!repoSelecionadoId) return;
    try {
      setBusy(true);
      await aprovarTodosMut.mutateAsync(repoSelecionadoId);
      await carregarAvaliacoes(repoSelecionadoId);
      onSuccess('Todos os documentos aprovados.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao Aprovar Todos.');
    } finally {
      setBusy(false);
    }
  };

  const handleConcluir = async (): Promise<void> => {
    if (!repoSelecionadoId) return;
    setConfirmConcluir(false);
    try {
      setBusy(true);
      const result = await concluirMut.mutateAsync(repoSelecionadoId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
      onSuccess(result.reprovados > 0
        ? `CQ concluÃ­do com ${result.reprovados} reprovaÃ§Ã£o(Ãµes). Gere o Termo de CorreÃ§Ã£o.`
        : 'CQ concluÃ­do â€” todos aprovados! Gere o Termo de DevoluÃ§Ã£o.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao Concluir CQ.');
    } finally {
      setBusy(false);
    }
  };

  const handleDevolver = async (): Promise<void> => {
    if (!repoSelecionadoId) return;
    try {
      setBusy(true);
      await devolverMut.mutateAsync(repoSelecionadoId);
      await carregarAvaliacoes(repoSelecionadoId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.repositoriosAll });
      onSuccess('Repositório retornado para Recebimento.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao Devolver.');
    } finally {
      setBusy(false);
    }
  };

  const handleTermoCorrecao = async (): Promise<void> => {
    if (!repoSelecionadoId) return;
    try {
      setBusy(true);
      const rel = await termoCorrecaoMut.mutateAsync(repoSelecionadoId);
      setUltimoRelatorioId(rel.id);
      onSuccess('Termo de CorreÃ§Ã£o gerado.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao gerar Termo de CorreÃ§Ã£o.');
    } finally {
      setBusy(false);
    }
  };

  const handleTermoDevolucao = async (): Promise<void> => {
    if (!repoSelecionadoId) return;
    try {
      setBusy(true);
      const rel = await termoDevolucaoMut.mutateAsync(repoSelecionadoId);
      setUltimoRelatorioId(rel.id);
      onSuccess('Termo de DevoluÃ§Ã£o gerado.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao gerar Termo de DevoluÃ§Ã£o.');
    } finally {
      setBusy(false);
    }
  };

  const handleTermoDevolucaoMulti = async (): Promise<void> => {
    const ids = Array.from(reposSelecionadosDev);
    if (ids.length === 0) return;
    try {
      setBusy(true);
      const rel = await termoDevolucaoMultiMut.mutateAsync(ids);
      const token = localStorage.getItem('recorda_access_token') ?? sessionStorage.getItem('recorda_access_token') ?? '';
      setPreviewDevolucaoUrl(`/api/operacional/relatorios/${rel.id}/download?token=${encodeURIComponent(token)}`);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao gerar Termo de DevoluÃ§Ã£o.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadDevolucao = async (): Promise<void> => {
    if (!previewDevolucaoUrl) return;
    try {
      const id = previewDevolucaoUrl.split('/relatorios/')[1]?.split('/download')[0] ?? '';
      await api.download(`/api/operacional/relatorios/${id}/download`, `termo-devolucao-${id}.pdf`);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao baixar Termo.');
    }
  };

  const reposAprovados = repositoriosDisponiveis.filter((r) => r.status_atual === 'CQ_APROVADO');

  const handleDownload = async (): Promise<void> => {
    if (!ultimoRelatorioId) return;
    try {
      setBusy(true);
      await api.download(`/api/operacional/relatorios/${ultimoRelatorioId}/download`, `termo-${ultimoRelatorioId}.pdf`);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao Baixar PDF.');
    } finally {
      setBusy(false);
    }
  };

  const resultadoBadge = (resultado: string): JSX.Element => {
    if (resultado === 'APROVADO') return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">âœ“ Aprovado</span>;
    if (resultado === 'REPROVADO') return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">âœ— Reprovado</span>;
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">Pendente</span>;
  };

  const docsFiltrados = docs.filter((doc) => {
    const matchStatus = filtroStatus === 'TODOS' || doc.resultado === filtroStatus;
    const matchBusca = busca === '' ||
      doc.protocolo.toLowerCase().includes(busca.toLowerCase()) ||
      (doc.interessado ?? '').toLowerCase().includes(busca.toLowerCase());
    return matchStatus && matchBusca;
  });

  const progressoPct = resumo.total > 0
    ? Math.round(((resumo.aprovados + resumo.reprovados) / resumo.total) * 100)
    : 0;

  const reposPorStatus = {
    AGUARDANDO_CQ_LOTE: repositoriosDisponiveis.filter((r) => r.status_atual === 'AGUARDANDO_CQ_LOTE').length,
    CQ_APROVADO: repositoriosDisponiveis.filter((r) => r.status_atual === 'CQ_APROVADO').length,
    CQ_REPROVADO: repositoriosDisponiveis.filter((r) => r.status_atual === 'CQ_REPROVADO').length,
  };

  const reposFiltrados = repositoriosDisponiveis.filter((repo) => {
    const matchStatus = filtroRepo === 'TODOS' || repo.status_atual === filtroRepo;
    const matchBusca = buscaRepo === '' ||
      repo.id_repositorio_ged.toLowerCase().includes(buscaRepo.toLowerCase()) ||
      repo.orgao.toLowerCase().includes(buscaRepo.toLowerCase());
    return matchStatus && matchBusca;
  });

  return (
    <div className="space-y-6">
      {/* Confirm Concluir CQ dialog */}
      {confirmConcluir ? (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Concluir Controle de Qualidade?</h3>
            <p className="text-sm text-gray-600 mb-1">
              {resumo.reprovados > 0
                ? `${resumo.reprovados} documento(s) reprovado(s). O repositÃ³rio serÃ¡ marcado como CQ_REPROVADO.`
                : 'Todos os documentos foram aprovados. O repositÃ³rio serÃ¡ marcado como CQ_APROVADO.'}
            </p>
            <p className="text-xs text-gray-400 mb-5">Esta aÃ§Ã£o nÃ£o pode ser desfeita sem devoluÃ§Ã£o para reavaliaÃ§Ã£o.</p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setConfirmConcluir(false)}>Cancelar</Button>
              <Button size="sm" variant={resumo.reprovados > 0 ? 'danger' : 'primary'} onClick={() => void handleConcluir()}>Confirmar</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Reproval obs modal */}
      {reprovandoId ? (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Reprovar documento</h3>
            <p className="text-sm text-gray-500 mb-3 font-mono">
              {docs.find((d) => d.processo_id === reprovandoId)?.protocolo}
            </p>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Motivo da reprovaÃ§Ã£o <span className="text-red-500">*</span>
            </label>
            <input
              ref={obsInputRef}
              type="text"
              className="w-full h-9 px-3 border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-300"
              placeholder="Descreva o motivo..."
              value={obsPorDoc[reprovandoId] ?? ''}
              onChange={(e) => setObsPorDoc((prev) => ({ ...prev, [reprovandoId]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && obsPorDoc[reprovandoId]) void handleAvaliar(reprovandoId, 'REPROVADO');
                if (e.key === 'Escape') setReprovandoId(null);
              }}
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setReprovandoId(null)}>Cancelar</Button>
              <Button
                size="sm"
                variant="danger"
                disabled={!obsPorDoc[reprovandoId]}
                onClick={() => void handleAvaliar(reprovandoId, 'REPROVADO')}
              >
                Reprovar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Repo selector */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold text-gray-900">RepositÃ³rios</h2>
          <span className="text-xs text-gray-400">{repositoriosDisponiveis.length} total</span>
        </div>

        {/* Repo filter buttons */}
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            className="h-8 px-3 border rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Buscar repositÃ³rio..."
            value={buscaRepo}
            onChange={(e) => setBuscaRepo(e.target.value)}
          />
          {([
            { key: 'TODOS', label: `Todos (${repositoriosDisponiveis.length})`, color: 'blue' },
            { key: 'AGUARDANDO_CQ_LOTE', label: `Pendentes (${reposPorStatus.AGUARDANDO_CQ_LOTE})`, color: 'yellow' },
            { key: 'CQ_APROVADO', label: `Aprovados (${reposPorStatus.CQ_APROVADO})`, color: 'green' },
            { key: 'CQ_REPROVADO', label: `Reprovados (${reposPorStatus.CQ_REPROVADO})`, color: 'red' },
          ] as { key: string; label: string; color: string }[]).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setFiltroRepo(key)}
              className={`px-3 h-8 rounded-lg text-xs font-medium border transition-colors ${
                filtroRepo === key
                  ? color === 'green' ? 'bg-green-100 text-green-800 border-green-300'
                    : color === 'red' ? 'bg-red-100 text-red-700 border-red-300'
                    : color === 'yellow' ? 'bg-yellow-50 text-yellow-700 border-yellow-300'
                    : 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Repo list */}
        {reposFiltrados.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">Nenhum repositÃ³rio corresponde ao filtro.</p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {reposFiltrados.map((repo) => {
              const isSelected = repoSelecionadoId === repo.id_repositorio_recorda;
              const statusColor =
                repo.status_atual === 'CQ_APROVADO' ? 'text-green-700 bg-green-50 border-green-200'
                : repo.status_atual === 'CQ_REPROVADO' ? 'text-red-700 bg-red-50 border-red-200'
                : 'text-yellow-700 bg-yellow-50 border-yellow-200';
              const statusLabel =
                repo.status_atual === 'CQ_APROVADO' ? 'âœ“ Aprovado'
                : repo.status_atual === 'CQ_REPROVADO' ? 'âœ— Reprovado'
                : 'â³ Pendente';
              return (
                <button
                  key={repo.id_repositorio_recorda}
                  onClick={() => { setRepoSelecionadoId(repo.id_repositorio_recorda); setUltimoRelatorioId(''); setBusca(''); setFiltroStatus('TODOS'); }}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-900">{repo.id_repositorio_ged}</span>
                    <span className="text-xs text-gray-500 ml-2">{repo.orgao}</span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${statusColor}`}>
                    {statusLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Document evaluation */}
      {repoSelecionadoId ? (
        <Card>
          {/* Header with progress */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900">
                {repoSelecionado?.id_repositorio_ged} â€” {repoSelecionado?.orgao}
              </h3>
              {resumo.total > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{ width: `${progressoPct}%`, background: resumo.reprovados > 0 ? '#ef4444' : '#22c55e' }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 shrink-0 w-8 text-right">{progressoPct}%</span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-gray-500">Total: <strong>{resumo.total}</strong></span>
                    <span className="text-green-700">âœ“ <strong>{resumo.aprovados}</strong></span>
                    <span className="text-red-600">âœ— <strong>{resumo.reprovados}</strong></span>
                    {resumo.pendentes > 0 && (
                      <span className="text-yellow-700 font-semibold">â³ {resumo.pendentes} pendente(s)</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!isConcluido ? (
                <>
                  <Button size="sm" variant="secondary" onClick={() => void handleAprovarTodos()} disabled={busy || docs.length === 0}>
                    Aprovar Todos
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setConfirmConcluir(true)}
                    disabled={busy || resumo.pendentes > 0 || docs.length === 0}
                  >
                    Concluir CQ
                  </Button>
                </>
              ) : null}
              {repoSelecionado?.status_atual === 'CQ_REPROVADO' ? (
                <>
                  <Button size="sm" variant="danger" onClick={() => void handleTermoCorrecao()} disabled={busy}>
                    Gerar Termo de CorreÃ§Ã£o
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void handleDevolver()} disabled={busy}>
                    Retornar para Recebimento
                  </Button>
                </>
              ) : null}
              {repoSelecionado?.status_atual === 'CQ_APROVADO' ? (
                <Button size="sm" onClick={() => void handleTermoDevolucao()} disabled={busy}>
                  Gerar Termo de DevoluÃ§Ã£o
                </Button>
              ) : null}
              {ultimoRelatorioId ? (
                <Button size="sm" variant="outline" onClick={() => void handleDownload()} disabled={busy}>
                  Baixar PDF
                </Button>
              ) : null}
            </div>
          </div>

          {/* Filters */}
          {docs.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              <input
                type="text"
                className="h-8 px-3 border rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Buscar protocolo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              {(['TODOS', 'PENDENTE', 'APROVADO', 'REPROVADO'] as FiltroStatus[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltroStatus(f)}
                  className={`px-3 h-8 rounded-lg text-xs font-medium border transition-colors ${
                    filtroStatus === f
                      ? f === 'APROVADO' ? 'bg-green-100 text-green-800 border-green-300'
                        : f === 'REPROVADO' ? 'bg-red-100 text-red-700 border-red-300'
                        : f === 'PENDENTE' ? 'bg-yellow-50 text-yellow-700 border-yellow-300'
                        : 'bg-blue-50 text-blue-700 border-blue-300'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {f === 'TODOS' ? `Todos (${resumo.total})`
                    : f === 'PENDENTE' ? `Pendentes (${resumo.pendentes})`
                    : f === 'APROVADO' ? `Aprovados (${resumo.aprovados})`
                    : `Reprovados (${resumo.reprovados})`}
                </button>
              ))}
            </div>
          )}

          {docs.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">Nenhum Processo cadastrado neste RepositÃ³rio.</p>
          ) : docsFiltrados.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhum documento corresponde ao filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Protocolo</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Interessado</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Vol.</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">ObservaÃ§Ã£o / Avaliador</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">AÃ§Ãµes</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {docsFiltrados.map((doc, idx) => (
                    <tr
                      key={doc.processo_id}
                      className={
                        doc.resultado === 'REPROVADO' ? 'bg-red-50/40'
                        : doc.resultado === 'APROVADO' ? 'bg-green-50/30'
                        : doc.is_apenso ? 'bg-gray-50/60'
                        : ''
                      }
                    >
                      <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 text-sm font-medium">
                        {doc.is_apenso ? (
                          <span className="flex items-center gap-1">
                            <span className="text-gray-400 text-xs ml-2">â†³</span>
                            <span className="text-gray-700">{doc.protocolo}</span>
                            <span className="text-xs bg-gray-100 text-gray-500 px-1 rounded">apenso</span>
                          </span>
                        ) : (
                          <span className="text-gray-900">{doc.protocolo}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700 max-w-[160px] truncate" title={doc.interessado}>{doc.interessado}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{doc.volume}</td>
                      <td className="px-3 py-2">{resultadoBadge(doc.resultado)}</td>
                      <td className="px-3 py-2">
                        {isConcluido ? (
                          <div>
                            {doc.observacao ? <p className="text-xs text-gray-700">{doc.observacao}</p> : null}
                            {doc.avaliador_nome ? <p className="text-xs text-gray-400 mt-0.5">{doc.avaliador_nome}</p> : null}
                          </div>
                        ) : (
                          doc.resultado === 'REPROVADO' && doc.observacao ? (
                            <span className="text-xs text-red-600 italic">{doc.observacao}</span>
                          ) : null
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!isConcluido ? (
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => void handleAvaliar(doc.processo_id, 'APROVADO')}
                              disabled={busy}
                              title="Aprovar"
                              className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${
                                doc.resultado === 'APROVADO'
                                  ? 'bg-green-500 text-white'
                                  : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                              } disabled:opacity-40`}
                            >
                              âœ“
                            </button>
                            <button
                              onClick={() => void handleAvaliar(doc.processo_id, 'REPROVADO')}
                              disabled={busy}
                              title="Reprovar"
                              className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${
                                doc.resultado === 'REPROVADO'
                                  ? 'bg-red-500 text-white'
                                  : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                              } disabled:opacity-40`}
                            >
                              âœ—
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">{doc.avaliador_nome ?? '-'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {/* Multi-repo devoluÃ§Ã£o */}
      {reposAprovados.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Termo de DevoluÃ§Ã£o Combinado</h2>
          <p className="text-sm text-gray-500 mb-3">Selecione repositÃ³rios aprovados para gerar um Ãºnico Termo de DevoluÃ§Ã£o.</p>
          <div className="space-y-2 max-h-48 overflow-auto">
            {reposAprovados.map((repo) => (
              <label key={repo.id_repositorio_recorda} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${reposSelecionadosDev.has(repo.id_repositorio_recorda) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <input
                  type="checkbox"
                  checked={reposSelecionadosDev.has(repo.id_repositorio_recorda)}
                  onChange={() => {
                    setReposSelecionadosDev((prev) => {
                      const next = new Set(prev);
                      if (next.has(repo.id_repositorio_recorda)) next.delete(repo.id_repositorio_recorda);
                      else next.add(repo.id_repositorio_recorda);
                      return next;
                    });
                  }}
                  className="rounded"
                />
                <span className="text-sm text-gray-900">{repo.id_repositorio_ged} â€” {repo.orgao}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => void handleTermoDevolucaoMulti()}
              disabled={busy || reposSelecionadosDev.size === 0}
              loading={busy}
            >
              Gerar Termo ({reposSelecionadosDev.size})
            </Button>
            {reposSelecionadosDev.size > 0 && (
              <span className="text-xs text-gray-500">{reposSelecionadosDev.size} repositÃ³rio(s) selecionado(s)</span>
            )}
          </div>
        </Card>
      )}

      {/* Preview Termo de DevoluÃ§Ã£o */}
      {previewDevolucaoUrl ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Termo de DevoluÃ§Ã£o</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const iframe = document.getElementById('devolucao-preview-iframe') as HTMLIFrameElement | null;
                    if (iframe?.contentWindow) iframe.contentWindow.print();
                  }}
                >
                  Imprimir
                </Button>
                <Button size="sm" onClick={() => void handleDownloadDevolucao()}>
                  Baixar PDF
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPreviewDevolucaoUrl(null)}>
                  Fechar
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <iframe
                id="devolucao-preview-iframe"
                src={previewDevolucaoUrl}
                className="w-full h-full border-0"
                title="Preview do Termo de DevoluÃ§Ã£o"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
