import { useCallback, useEffect, useRef, useState } from 'react';
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
  useQueryClient,
  queryKeys,
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
  const [filtroRepo, setFiltroRepo] = useState<string>('TODOS');
  const [buscaRepo, setBuscaRepo] = useState('');
  const obsInputRef = useRef<HTMLInputElement>(null);

  const avaliarMut = useAvaliarDocumentoCQ();
  const aprovarTodosMut = useAprovarTodosCQ();
  const concluirMut = useConcluirCQ();
  const devolverMut = useDevolverCQ();
  const termoCorrecaoMut = useGerarTermoCorrecao();
  const termoDevolucaoMut = useGerarTermoDevolucao();
  const termoDevolucaoMultiMut = useGerarTermoDevolucaoMulti();
  const queryClient = useQueryClient();

  const repoSelecionado = repositoriosDisponiveis.find(
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
      onSuccess(
        result.reprovados > 0
          ? `CQ concluido com ${result.reprovados} reprovacao(oes). Gere o Termo de Correcao.`
          : 'CQ concluido - todos aprovados! Gere o Termo de Devolucao.'
      );
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
      onSuccess('Repositorio retornado para Recebimento.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao retornar para recebimento.');
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
      onSuccess('Termo de Correcao gerado.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao gerar Termo de Correcao.');
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
      onSuccess('Termo de Devolucao gerado.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Erro ao gerar Termo de Devolucao.');
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
      onError(error instanceof Error ? error.message : 'Erro ao gerar Termo de Devolucao.');
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

  const resultadoBadge = (resultado: string): JSX.Element => {
    if (resultado === 'APROVADO')
      return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
          OK Aprovado
        </span>
      );
    if (resultado === 'REPROVADO')
      return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
          X Reprovado
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
      busca === '' ||
      doc.protocolo.toLowerCase().includes(busca.toLowerCase()) ||
      (doc.interessado ?? '').toLowerCase().includes(busca.toLowerCase());
    return matchStatus && matchBusca;
  });

  const reposPorStatus = {
    AGUARDANDO_CQ_LOTE: repositoriosDisponiveis.filter(
      (r) => r.status_atual === 'AGUARDANDO_CQ_LOTE'
    ).length,
    CQ_APROVADO: repositoriosDisponiveis.filter((r) => r.status_atual === 'CQ_APROVADO').length,
    CQ_REPROVADO: repositoriosDisponiveis.filter((r) => r.status_atual === 'CQ_REPROVADO').length,
  };

  const reposFiltrados = repositoriosDisponiveis.filter((repo) => {
    const matchStatus = filtroRepo === 'TODOS' || repo.status_atual === filtroRepo;
    const matchBusca =
      buscaRepo === '' ||
      repo.id_repositorio_ged.toLowerCase().includes(buscaRepo.toLowerCase()) ||
      repo.orgao.toLowerCase().includes(buscaRepo.toLowerCase());
    return matchStatus && matchBusca;
  });

  const reposAprovados = repositoriosDisponiveis.filter((r) => r.status_atual === 'CQ_APROVADO');

  return (
    <div className="space-y-6">
      {confirmConcluir ? (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Concluir Controle de Qualidade?
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              {resumo.reprovados > 0
                ? `${resumo.reprovados} documento(s) reprovado(s). O repositorio sera marcado como CQ_REPROVADO.`
                : 'Todos os documentos foram aprovados. O repositorio sera marcado como CQ_APROVADO.'}
            </p>
            <p className="text-xs text-gray-400 mb-5">
              Esta acao nao pode ser desfeita sem devolucao.
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Reprovar documento</h3>
            <p className="text-sm text-gray-500 mb-3 font-mono">
              {docs.find((d) => d.processo_id === reprovandoId)?.protocolo}
            </p>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Motivo da reprovacao <span className="text-red-500">*</span>
            </label>
            <input
              ref={obsInputRef}
              type="text"
              className="w-full h-9 px-3 border rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-300"
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

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Repositorios</h2>
          <span className="text-xs text-gray-400">{repositoriosDisponiveis.length} total</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            className="h-8 px-3 border rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Buscar repositorio..."
            value={buscaRepo}
            onChange={(e) => setBuscaRepo(e.target.value)}
          />
          {(
            [
              { key: 'TODOS', label: `Todos (${repositoriosDisponiveis.length})` },
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
              className={`px-3 h-8 rounded-lg text-xs font-medium border transition-colors ${filtroRepo === key ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {reposFiltrados.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">Nenhum repositorio corresponde ao filtro.</p>
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
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center justify-between gap-2 ${repoSelecionadoId === repo.id_repositorio_recorda ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900">
                    {repo.id_repositorio_ged}
                  </span>
                  <span className="text-xs text-gray-500 ml-2">{repo.orgao}</span>
                </div>
                <span className="text-xs text-gray-500">{repo.status_atual}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {repoSelecionadoId ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <h3 className="text-base font-semibold text-gray-900">
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
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void handleTermoCorrecao()}
                  disabled={busy}
                >
                  Gerar Termo de Correcao
                </Button>
              ) : null}
              {repoSelecionado ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleDevolver()}
                  disabled={busy}
                >
                  Retornar para Recebimento
                </Button>
              ) : null}
              {repoSelecionado?.status_atual === 'CQ_APROVADO' ? (
                <Button size="sm" onClick={() => void handleTermoDevolucao()} disabled={busy}>
                  Gerar Termo de Devolucao
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
              className="h-8 px-3 border rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Buscar protocolo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {(['TODOS', 'PENDENTE', 'APROVADO', 'REPROVADO'] as FiltroStatus[]).map((f) => (
              <button
                key={f}
                onClick={() => setFiltroStatus(f)}
                className={`px-3 h-8 rounded-lg text-xs font-medium border transition-colors ${filtroStatus === f ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {f}
              </button>
            ))}
          </div>

          {docs.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">
              Nenhum processo cadastrado neste repositorio.
            </p>
          ) : docsFiltrados.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              Nenhum documento corresponde ao filtro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                      #
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                      Protocolo
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                      Interessado
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                      Vol.
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                      Observacao
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">
                      Acoes
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {docsFiltrados.map((doc, idx) => (
                    <tr key={doc.processo_id}>
                      <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 text-sm font-medium text-gray-900">
                        {doc.protocolo}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700">{doc.interessado}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{doc.volume}</td>
                      <td className="px-3 py-2">{resultadoBadge(doc.resultado)}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{doc.observacao ?? '-'}</td>
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

      {reposAprovados.length > 0 ? (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Termo de Devolucao Combinado</h2>
          <p className="text-sm text-gray-500 mb-3">
            Selecione repositorios aprovados para gerar um unico Termo de Devolucao.
          </p>
          <div className="space-y-2 max-h-48 overflow-auto">
            {reposAprovados.map((repo) => (
              <label
                key={repo.id_repositorio_recorda}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${reposSelecionadosDev.has(repo.id_repositorio_recorda) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
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
                <span className="text-sm text-gray-900">
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
              Gerar Termo ({reposSelecionadosDev.size})
            </Button>
            {reposSelecionadosDev.size > 0 ? (
              <span className="text-xs text-gray-500">
                {reposSelecionadosDev.size} repositorio(s) selecionado(s)
              </span>
            ) : null}
          </div>
        </Card>
      ) : null}

      {previewDevolucaoUrl ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Termo de Devolucao</h3>
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
                title="Preview do Termo de Devolucao"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
