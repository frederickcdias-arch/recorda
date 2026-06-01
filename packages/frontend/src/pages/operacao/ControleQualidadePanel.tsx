import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { api } from '../../services/api';
import {
  useAvaliarDocumentoCQ,
  useAprovarTodosCQ,
  useConcluirCQ,
  useDevolverCQ,
  useGerarTermoCorrecao,
  useGerarTermoDevolucao,
  useGerarTermoDevolucaoMulti,
  useRepositoriosControleQualidade,
  useCQSugestoes,
  useQueryClient,
  queryKeys,
  type CQSugestaoItem,
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
  const reposCQQuery = useRepositoriosControleQualidade();
  const todosRepositoriosCQ = reposCQQuery.data ?? repositoriosDisponiveis;
  const sugestoesQuery = useCQSugestoes({ limit: 50 });
  const sugestoes = sugestoesQuery.data?.data ?? [];
  const sugestoesResumo = sugestoesQuery.data?.resumo ?? { prontos: 0, comAlertas: 0 };
  const [sugestoesSelecionadas, setSugestoesSelecionadas] = useState<Set<string>>(new Set());
  const [sugestoesMostrar, setSugestoesMostrar] = useState(true);
  const [repoSelecionadoId, setRepoSelecionadoId] = useState('');
  const [docs, setDocs] = useState<CQDocItem[]>([]);
  const [resumo, setResumo] = useState<CQResumo>({
    total: 0,
    aprovados: 0,
    reprovados: 0,
    pendentes: 0,
  });
  const [obsPorDoc, setObsPorDoc] = useState<Record<string, string>>({});
  const [ultimoRelatorioId, setUltimoRelatorioId] = useState('');
  const [reposSelecionadosDev, setReposSelecionadosDev] = useState<Set<string>>(new Set());
  const [previewDevolucaoUrl, setPreviewDevolucaoUrl] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('TODOS');
  const [busca, setBusca] = useState('');
  const [reprovandoId, setReprovandoId] = useState<string | null>(null);
  const [confirmConcluir, setConfirmConcluir] = useState(false);
  const [filtroRepo, setFiltroRepo] = useState<string>('AGUARDANDO_CQ_LOTE');
  const [buscaRepo, setBuscaRepo] = useState('');
  const debouncedBusca = useDebounce(busca, 600);
  const debouncedBuscaRepo = useDebounce(buscaRepo, 600);
  const obsInputRef = useRef<HTMLInputElement>(null);

  const avaliarMut = useAvaliarDocumentoCQ();
  const aprovarTodosMut = useAprovarTodosCQ();
  const concluirMut = useConcluirCQ();
  const devolverMut = useDevolverCQ();
  const termoCorrecaoMut = useGerarTermoCorrecao();
  const termoDevolucaoMut = useGerarTermoDevolucao();
  const termoDevolucaoMultiMut = useGerarTermoDevolucaoMulti();
  const queryClient = useQueryClient();

  const repoSelecionado = todosRepositoriosCQ.find(
    (r) => r.id_repositorio_recorda === repoSelecionadoId
  );
  const isConcluido =
    repoSelecionado?.status_atual === 'CQ_APROVADO' ||
    repoSelecionado?.status_atual === 'CQ_REPROVADO';

  const carregarAvaliacoes = useCallback(
    async (repoId: string) => {
      try {
        const data = await queryClient.fetchQuery({
          queryKey: queryKeys.cqAvaliacoes(repoId),
          queryFn: () =>
            api.get<{ itens: CQDocItem[]; resumo: CQResumo }>(
              `/operacional/repositorios/${repoId}/cq-avaliacoes`
            ),
          staleTime: 0,
        });
        setDocs(data.itens ?? []);
        setResumo(data.resumo ?? { total: 0, aprovados: 0, reprovados: 0, pendentes: 0 });
      } catch {
        setDocs([]);
        setResumo({ total: 0, aprovados: 0, reprovados: 0, pendentes: 0 });
      }
    },
    [queryClient]
  );

  useEffect(() => {
    if (!repoSelecionadoId) {
      setDocs([]);
      setResumo({ total: 0, aprovados: 0, reprovados: 0, pendentes: 0 });
      setObsPorDoc({});
      return;
    }
    void carregarAvaliacoes(repoSelecionadoId);
  }, [repoSelecionadoId, carregarAvaliacoes]);

  const handleAvaliar = async (
    processoId: string,
    resultado: 'APROVADO' | 'REPROVADO'
  ): Promise<void> => {
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
        observacao: resultado === 'REPROVADO' ? obsPorDoc[processoId] || undefined : undefined,
      });
      setReprovandoId(null);
      await carregarAvaliacoes(repoSelecionadoId);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao avaliar documento.');
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
      onError(error instanceof Error ? error.message : 'Erro ao aprovar todos.');
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
      if (result.reprovados > 0) {
        onSuccess(
          `Controle de qualidade concluído com ${result.reprovados} reprovação(ões). Gere o termo de correção.`
        );
      } else {
        onSuccess('Repositório concluído. Controle de qualidade concluído.');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao concluir CQ.');
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
      onSuccess('Repositório retornado para reconferência.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao retornar para reconferência.');
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
      onSuccess('Termo de correção gerado.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao gerar Termo de correção.');
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
      onSuccess('Termo de devolução gerado.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao gerar Termo de devolução.');
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
      const token =
        localStorage.getItem('recorda_access_token') ??
        sessionStorage.getItem('recorda_access_token') ??
        '';
      setPreviewDevolucaoUrl(
        `/api/operacional/relatorios/${rel.id}/download?token=${encodeURIComponent(token)}`
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao gerar Termo de devolução.');
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
      onError(error instanceof Error ? error.message : 'Erro ao baixar termo.');
    }
  };

  const handleDownload = async (): Promise<void> => {
    if (!ultimoRelatorioId) return;
    try {
      setBusy(true);
      await api.download(
        `/api/operacional/relatorios/${ultimoRelatorioId}/download`,
        `termo-${ultimoRelatorioId}.pdf`
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao baixar PDF.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSugestao = (id: string): void => {
    setSugestoesSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selecionarTodosProntos = (): void => {
    const prontos = sugestoes.filter((s) => s.prontoParaCQ).map((s) => s.repositorioId);
    setSugestoesSelecionadas(new Set(prontos));
  };

  const resultadoBadge = (resultado: string): JSX.Element => {
    if (resultado === 'APROVADO')
      return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
          Aprovado
        </span>
      );
    if (resultado === 'REPROVADO')
      return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
          Reprovado
        </span>
      );
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
        Pendente
      </span>
    );
  };

  const docsFiltrados = docs.filter((doc) => {
    const matchStatus = filtroStatus === 'TODOS' || doc.resultado === filtroStatus;
    const matchBusca =
      debouncedBusca === '' ||
      doc.protocolo.toLowerCase().includes(debouncedBusca.toLowerCase()) ||
      (doc.interessado ?? '').toLowerCase().includes(debouncedBusca.toLowerCase());
    return matchStatus && matchBusca;
  });

  const reposPorStatus = {
    AGUARDANDO_CQ_LOTE: todosRepositoriosCQ.filter((r) => r.status_atual === 'AGUARDANDO_CQ_LOTE')
      .length,
    CQ_APROVADO: todosRepositoriosCQ.filter((r) => r.status_atual === 'CQ_APROVADO').length,
    CQ_REPROVADO: todosRepositoriosCQ.filter((r) => r.status_atual === 'CQ_REPROVADO').length,
  };

  const reposFiltrados = todosRepositoriosCQ.filter((repo) => {
    const matchStatus = filtroRepo === 'TODOS' || repo.status_atual === filtroRepo;
    const matchBusca =
      debouncedBuscaRepo === '' ||
      repo.id_repositorio_ged.toLowerCase().includes(debouncedBuscaRepo.toLowerCase()) ||
      repo.orgao.toLowerCase().includes(debouncedBuscaRepo.toLowerCase());
    return matchStatus && matchBusca;
  });

  const reposAprovados = todosRepositoriosCQ.filter((r) => r.status_atual === 'CQ_APROVADO');

  return (
    <div className="space-y-6">
      {confirmConcluir ? (
        <div className="fixed inset-0 bg-[var(--color-overlay-backdrop)] z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">
              Concluir Controle de Qualidade?
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-1">
              {resumo.reprovados > 0
                ? `${resumo.reprovados} documento(s) reprovado(s). O repositório será marcado como CQ_REPROVADO.`
                : 'Todos os documentos foram aprovados. O repositório será marcado como CQ_APROVADO.'}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-5">
              Esta ação não pode ser desfeita sem devolução.
            </p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setConfirmConcluir(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant={resumo.reprovados > 0 ? 'danger' : 'primary'}
                onClick={() => void handleConcluir()}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {reprovandoId ? (
        <div className="fixed inset-0 bg-[var(--color-overlay-backdrop)] z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">
              Reprovar documento
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-3 font-mono">
              {docs.find((d) => d.processo_id === reprovandoId)?.protocolo}
            </p>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Motivo da reprovação <span className="text-red-500">*</span>
            </label>
            <input
              ref={obsInputRef}
              type="text"
              className="w-full h-9 px-3 border border-[var(--color-border-primary)] rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-300"
              placeholder="Descreva o motivo..."
              value={obsPorDoc[reprovandoId] ?? ''}
              onChange={(e) =>
                setObsPorDoc((prev) => ({ ...prev, [reprovandoId]: e.target.value }))
              }
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setReprovandoId(null)}>
                Cancelar
              </Button>
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

      {/* ── Sugestões para CQ ─────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Sugestões para CQ
            </h2>
            {sugestoes.length > 0 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                {sugestoes.length}
              </span>
            ) : null}
          </div>
          <button
            onClick={() => setSugestoesMostrar((v) => !v)}
            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
          >
            {sugestoesMostrar ? 'Recolher' : 'Expandir'}
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          Sugestões com base na produção registrada e nas etapas concluídas. O sistema não cria
          lotes automaticamente — a seleção e confirmação são obrigatórias.
        </p>
        {sugestoesMostrar ? (
          sugestoesQuery.isLoading ? (
            <p className="text-sm text-[var(--color-text-tertiary)] py-2">Carregando sugestões…</p>
          ) : sugestoes.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)] py-2">
              Nenhum repositório pronto para Controle de Qualidade no momento.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-3 text-xs text-[var(--color-text-secondary)]">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  {sugestoesResumo.prontos} pronto(s)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-orange-400" />
                  {sugestoesResumo.comAlertas} com alerta(s)
                </span>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1 mb-3">
                {sugestoes.map((s: CQSugestaoItem) => (
                  <label
                    key={s.repositorioId}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      sugestoesSelecionadas.has(s.repositorioId)
                        ? 'bg-[var(--color-primary-50)] border-[var(--color-primary-300)]'
                        : 'bg-[var(--color-bg-primary)] border-[var(--color-border-primary)] hover:bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={sugestoesSelecionadas.has(s.repositorioId)}
                      onChange={() => toggleSugestao(s.repositorioId)}
                      className="mt-0.5 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                          {s.repositorioCodigo}
                        </span>
                        <span className="text-xs text-[var(--color-text-tertiary)]">
                          {s.entidade}
                        </span>
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                            s.origem === 'LEGADA'
                              ? 'bg-purple-50 text-purple-700'
                              : s.origem === 'MISTA'
                                ? 'bg-yellow-50 text-yellow-700'
                                : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {s.origem}
                        </span>
                        {s.prontoParaCQ ? (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                            Pronto
                          </span>
                        ) : (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                            Atenção
                          </span>
                        )}
                      </div>
                      {s.ultimaEtapaConcluida ? (
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                          Última reconferência:{' '}
                          {s.ultimaEtapaConcluida.responsavelNome ?? 'sem responsável'}
                          {s.ultimaEtapaConcluida.data ? ` — ${s.ultimaEtapaConcluida.data}` : ''}
                        </p>
                      ) : null}
                      {s.divergencias.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {s.divergencias.map((d, i) => (
                            <span
                              key={i}
                              title={d.mensagem}
                              className={`inline-flex px-1.5 py-0.5 rounded text-xs ${
                                d.severidade === 'alta'
                                  ? 'bg-red-50 text-red-700'
                                  : d.severidade === 'media'
                                    ? 'bg-orange-50 text-orange-700'
                                    : 'bg-yellow-50 text-yellow-700'
                              }`}
                            >
                              {d.tipo === 'DIGITALIZACAO_SEM_IMAGENS'
                                ? 'Sem imagens'
                                : d.tipo === 'STATUS_ATRASADO'
                                  ? 'Status atrasado'
                                  : d.tipo}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--color-border-primary)]">
                {sugestoesResumo.prontos > 0 ? (
                  <Button size="sm" variant="secondary" onClick={selecionarTodosProntos}>
                    Selecionar todos os prontos ({sugestoesResumo.prontos})
                  </Button>
                ) : null}
                {sugestoesSelecionadas.size > 0 ? (
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {sugestoesSelecionadas.size} repositório(s) selecionado(s) — use &quot;Criar
                    lote CQ&quot; para confirmar a criação
                  </span>
                ) : null}
              </div>
            </>
          )
        ) : null}
      </Card>

      {/* ── Repositórios ─────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Repositórios</h2>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {todosRepositoriosCQ.length} total
          </span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            className="h-8 px-3 border border-[var(--color-border-primary)] rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-300)]"
            placeholder="Buscar repositório..."
            value={buscaRepo}
            onChange={(e) => setBuscaRepo(e.target.value)}
          />
          {(
            [
              { key: 'TODOS', label: `Todos (${todosRepositoriosCQ.length})` },
              {
                key: 'AGUARDANDO_CQ_LOTE',
                label: `Pendentes (${reposPorStatus.AGUARDANDO_CQ_LOTE})`,
              },
              { key: 'CQ_APROVADO', label: `Aprovados (${reposPorStatus.CQ_APROVADO})` },
              { key: 'CQ_REPROVADO', label: `Reprovados (${reposPorStatus.CQ_REPROVADO})` },
            ] as { key: string; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFiltroRepo(key)}
              className={`px-3 h-8 rounded-lg text-xs font-medium border transition-colors ${filtroRepo === key ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)] border-[var(--color-primary-300)]' : 'bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)] hover:bg-[var(--color-bg-secondary)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {reposFiltrados.length === 0 ? (
          <p className="text-sm text-[var(--color-text-tertiary)] py-2">
            Nenhum repositório corresponde ao filtro.
          </p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {reposFiltrados.map((repo) => (
              <button
                key={repo.id_repositorio_recorda}
                onClick={() => {
                  setRepoSelecionadoId(repo.id_repositorio_recorda);
                  setUltimoRelatorioId('');
                  setBusca('');
                  setFiltroStatus('TODOS');
                }}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center justify-between gap-2 ${repoSelecionadoId === repo.id_repositorio_recorda ? 'bg-[var(--color-primary-50)] border-[var(--color-primary-300)] ring-1 ring-[var(--color-primary-300)]' : 'bg-[var(--color-bg-primary)] border-[var(--color-border-primary)] hover:bg-[var(--color-bg-secondary)]'}`}
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {repo.id_repositorio_ged}
                  </span>
                  <span className="text-xs text-[var(--color-text-tertiary)] ml-2">
                    {repo.orgao}
                  </span>
                </div>
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  {repo.status_atual}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {repoSelecionadoId ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              {repoSelecionado?.id_repositorio_ged} - {repoSelecionado?.orgao}
            </h3>
            <div className="flex flex-wrap gap-2">
              {!isConcluido ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleAprovarTodos()}
                    disabled={busy || docs.length === 0}
                  >
                    Aprovar todos
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
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void handleTermoCorrecao()}
                  disabled={busy}
                >
                  Gerar termo de correção
                </Button>
              ) : null}
              {repoSelecionado ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleDevolver()}
                  disabled={busy}
                >
                  Retornar para reconferência
                </Button>
              ) : null}
              {repoSelecionado?.status_atual === 'CQ_APROVADO' ? (
                <Button size="sm" onClick={() => void handleTermoDevolucao()} disabled={busy}>
                  Gerar termo de devolução
                </Button>
              ) : null}
              {ultimoRelatorioId ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleDownload()}
                  disabled={busy}
                >
                  Baixar PDF
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <input
              type="text"
              className="h-8 px-3 border border-[var(--color-border-primary)] rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-300)]"
              placeholder="Buscar protocolo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {(['TODOS', 'PENDENTE', 'APROVADO', 'REPROVADO'] as FiltroStatus[]).map((f) => (
              <button
                key={f}
                onClick={() => setFiltroStatus(f)}
                className={`px-3 h-8 rounded-lg text-xs font-medium border transition-colors ${filtroStatus === f ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)] border-[var(--color-primary-300)]' : 'bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)] hover:bg-[var(--color-bg-secondary)]'}`}
              >
                {f}
              </button>
            ))}
          </div>

          {docs.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] py-4">
              Nenhum processo cadastrado.
            </p>
          ) : docsFiltrados.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)] py-4 text-center">
              Nenhum resultado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--color-border-primary)]">
                <thead className="bg-[var(--color-bg-secondary)]">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      #
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Protocolo
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Interessado
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Vol.
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Observação
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-[var(--color-text-secondary)]">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-[var(--color-bg-primary)] divide-y divide-[var(--color-border-secondary)]">
                  {docsFiltrados.map((doc, idx) => (
                    <tr key={doc.processo_id}>
                      <td className="px-3 py-2 text-xs text-[var(--color-text-tertiary)]">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 text-sm font-medium text-[var(--color-text-primary)]">
                        {doc.protocolo}
                      </td>
                      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                        {doc.interessado}
                      </td>
                      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                        {doc.volume}
                      </td>
                      <td className="px-3 py-2">{resultadoBadge(doc.resultado)}</td>
                      <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                        {doc.observacao ?? '-'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!isConcluido ? (
                          <div className="inline-flex gap-1">
                            <button
                              className="w-8 h-8 rounded-lg text-sm font-bold bg-green-50 text-green-700 border border-green-200"
                              onClick={() => void handleAvaliar(doc.processo_id, 'APROVADO')}
                              disabled={busy}
                            >
                              OK
                            </button>
                            <button
                              className="w-8 h-8 rounded-lg text-sm font-bold bg-red-50 text-red-600 border border-red-200"
                              onClick={() => void handleAvaliar(doc.processo_id, 'REPROVADO')}
                              disabled={busy}
                            >
                              X
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--color-text-tertiary)]">
                            {doc.avaliador_nome ?? '-'}
                          </span>
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

      {reposAprovados.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text-primary)]">
            Termo de devolução combinado
          </h2>
          <p className="mb-3 text-sm text-[var(--color-text-secondary)]">
            Selecione os aprovados para gerar um único termo.
          </p>
          <div className="space-y-2 max-h-48 overflow-auto">
            {reposAprovados.map((repo) => (
              <label
                key={repo.id_repositorio_recorda}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${reposSelecionadosDev.has(repo.id_repositorio_recorda) ? 'bg-[var(--color-primary-50)]' : 'hover:bg-[var(--color-bg-secondary)]'}`}
              >
                <input
                  type="checkbox"
                  checked={reposSelecionadosDev.has(repo.id_repositorio_recorda)}
                  onChange={() => {
                    setReposSelecionadosDev((prev) => {
                      const next = new Set(prev);
                      if (next.has(repo.id_repositorio_recorda))
                        next.delete(repo.id_repositorio_recorda);
                      else next.add(repo.id_repositorio_recorda);
                      return next;
                    });
                  }}
                  className="rounded"
                />
                <span className="text-sm text-[var(--color-text-primary)]">
                  {repo.id_repositorio_ged} - {repo.orgao}
                </span>
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
              Gerar termo ({reposSelecionadosDev.size})
            </Button>
            {reposSelecionadosDev.size > 0 ? (
              <span className="text-xs text-[var(--color-text-tertiary)]">
                {reposSelecionadosDev.size} repositório(s) selecionado(s)
              </span>
            ) : null}
          </div>
        </Card>
      ) : null}

      {previewDevolucaoUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay-backdrop)] p-4">
          <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border-primary)] px-6 py-4">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Termo de devolução
              </h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const iframe = document.getElementById(
                      'devolucao-preview-iframe'
                    ) as HTMLIFrameElement | null;
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
                title="Pré-visualização do Termo de Devolução"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
