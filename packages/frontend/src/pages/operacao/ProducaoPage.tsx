import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { PageState } from '../../components/ui/PageState';
import { Pagination } from '../../components/ui/Pagination';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToastHelpers } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { extractErrorMessage } from '../../utils/errors';
import { formatDateBR } from '../../utils/date';
import { formatCriticalNumber, parseFiniteNumber } from '../../utils/number';
import {
  useProducao,
  useDeleteProducao,
  useLimparProducoes,
  useQueryClient,
  queryKeys,
} from '../../hooks/useQueries';
import { api } from '../../services/api';

const ETAPA_LABELS: Record<string, string> = {
  RECEBIMENTO: 'Recebimento',
  PREPARACAO: 'Preparação',
  DIGITALIZACAO: 'Digitalização',
  DIGITALIZACAO_COLORIDA: 'Digitalização Colorida',
  CONFERENCIA: 'Conferência',
  RECONFERENCIA: 'Reconferência',
  MONTAGEM: 'Montagem',
  ATENDIMENTO: 'Atendimento',
  CONTROLE_QUALIDADE: 'Controle de Qualidade',
  ENTREGA: 'Entrega',
};

export function ProducaoPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const deleteProducao = useDeleteProducao();
  const limparProducoes = useLimparProducoes();
  const toast = useToastHelpers();
  const confirmDialog = useConfirmDialog();

  // Filtros
  const [pagina, setPagina] = useState(1);
  const [etapa, setEtapa] = useState('');
  const [colaborador, setColaborador] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');

  // Ordenação
  type SortColumn =
    | 'data'
    | 'colaborador'
    | 'repositorio'
    | 'funcao'
    | 'tipo'
    | 'quantidade'
    | 'coordenadoria'
    | 'origem';
  type SortDirection = 'asc' | 'desc';
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const filtrosInicializadosRef = useRef(false);

  const filtrosUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      pagina: Math.max(Number(params.get('pagina') ?? '1'), 1),
      etapa: params.get('etapa') ?? '',
      colaborador: params.get('colaborador') ?? '',
      dataInicio: params.get('dataInicio') ?? '',
      dataFim: params.get('dataFim') ?? '',
      busca: params.get('busca') ?? '',
    };
  }, [location.search]);

  useEffect(() => {
    setPagina(filtrosUrl.pagina);
    setEtapa(filtrosUrl.etapa);
    setColaborador(filtrosUrl.colaborador);
    setDataInicio(filtrosUrl.dataInicio);
    setDataFim(filtrosUrl.dataFim);
    setBusca(filtrosUrl.busca);
  }, [
    filtrosUrl.pagina,
    filtrosUrl.etapa,
    filtrosUrl.colaborador,
    filtrosUrl.dataInicio,
    filtrosUrl.dataFim,
    filtrosUrl.busca,
  ]);

  // Debounce busca
  useEffect(() => {
    const timer = setTimeout(() => setBuscaDebounced(busca), 400);
    return () => clearTimeout(timer);
  }, [busca]);

  // Reset page when filters change
  useEffect(() => {
    if (!filtrosInicializadosRef.current) {
      filtrosInicializadosRef.current = true;
      return;
    }
    setPagina(1);
  }, [etapa, colaborador, dataInicio, dataFim, busca]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (pagina > 1) params.set('pagina', String(pagina));
    if (etapa) params.set('etapa', etapa);
    if (colaborador) params.set('colaborador', colaborador);
    if (dataInicio) params.set('dataInicio', dataInicio);
    if (dataFim) params.set('dataFim', dataFim);
    if (busca.trim()) params.set('busca', busca.trim());

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
    pagina,
    etapa,
    colaborador,
    dataInicio,
    dataFim,
    busca,
    location.pathname,
    location.search,
    navigate,
  ]);

  const producaoQuery = useProducao({
    pagina,
    limite: 25,
    etapa: etapa || undefined,
    colaborador: colaborador || undefined,
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    busca: buscaDebounced || undefined,
  });
  const dados = producaoQuery.data ?? null;
  const carregando = producaoQuery.isLoading;
  const atualizando = producaoQuery.isFetching && !producaoQuery.isLoading;
  const erro = producaoQuery.error
    ? {
        message: 'Erro ao carregar Registros de Produção',
        details:
          producaoQuery.error instanceof Error ? producaoQuery.error.message : 'Falha desconhecida',
      }
    : null;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.producaoAll });

  const handleExcluir = (id: string): void => {
    confirmDialog.confirm({
      title: 'Excluir Registro',
      message: 'Tem certeza que deseja excluir este registro de produção?',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteProducao.mutateAsync(id);
          toast.success('Registro excluído.');
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao excluir'));
        }
      },
    });
  };

  const handleLimparTodasProducoes = (): void => {
    confirmDialog.confirm({
      title: 'Limpar Produções Importadas',
      message:
        'Esta ação excluirá apenas registros de produção importada (LEGADO). Deseja continuar?',
      confirmLabel: 'Limpar Importadas',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const response = await limparProducoes.mutateAsync();
          const removidos = Number(response?.removidos ?? 0);
          toast.success(
            removidos > 0
              ? `${removidos} registro(s) importado(s) removido(s).`
              : 'Não havia registros importados para remover.'
          );
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao limpar produções'));
        }
      },
    });
  };

  const isAdmin = usuario?.perfil === 'administrador';
  const [exportando, setExportando] = useState(false);

  const handleExportarExcel = async () => {
    setExportando(true);
    try {
      const params = new URLSearchParams();
      if (dataInicio) params.set('dataInicio', dataInicio);
      if (dataFim) params.set('dataFim', dataFim);
      if (etapa) params.set('etapa', etapa);
      if (colaborador) params.set('colaborador', colaborador);
      if (buscaDebounced) params.set('busca', buscaDebounced);
      params.set('formato', 'excel');
      await api.download(
        `/api/relatorios/operacional/export?${params.toString()}`,
        `producao_${dataInicio || 'inicio'}_${dataFim || 'fim'}.xlsx`
      );
      toast.success('Exportação concluída.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao exportar'));
    } finally {
      setExportando(false);
    }
  };

  const totalFormatado = useMemo(() => {
    if (!dados) return '—';
    return formatCriticalNumber(dados.total);
  }, [dados]);

  // Função de ordenação
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Dados ordenados
  const registrosOrdenados = useMemo(() => {
    if (!dados?.registros || !sortColumn) return dados?.registros ?? [];

    const sorted = [...dados.registros].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortColumn) {
        case 'data':
          aVal = new Date(a.data_producao).getTime();
          bVal = new Date(b.data_producao).getTime();
          break;
        case 'colaborador':
          aVal = a.colaborador_nome.toLowerCase();
          bVal = b.colaborador_nome.toLowerCase();
          break;
        case 'repositorio':
          aVal = a.repositorio_ged.toLowerCase();
          bVal = b.repositorio_ged.toLowerCase();
          break;
        case 'funcao':
          aVal = (a.funcao || ETAPA_LABELS[a.etapa] || a.etapa).toLowerCase();
          bVal = (b.funcao || ETAPA_LABELS[b.etapa] || b.etapa).toLowerCase();
          break;
        case 'tipo':
          aVal = (a.tipo || '').toLowerCase();
          bVal = (b.tipo || '').toLowerCase();
          break;
        case 'quantidade':
          aVal = parseFiniteNumber(a.quantidade) ?? Number.NEGATIVE_INFINITY;
          bVal = parseFiniteNumber(b.quantidade) ?? Number.NEGATIVE_INFINITY;
          break;
        case 'coordenadoria':
          aVal = (a.coordenadoria_sigla || '').toLowerCase();
          bVal = (b.coordenadoria_sigla || '').toLowerCase();
          break;
        case 'origem':
          aVal = a.origem.toLowerCase();
          bVal = b.origem.toLowerCase();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [dados?.registros, sortColumn, sortDirection]);

  // Componente de cabeçalho ordenável
  const SortableHeader = ({
    column,
    children,
    align = 'left',
  }: {
    column: SortColumn;
    children: React.ReactNode;
    align?: 'left' | 'right' | 'center';
  }) => {
    const isActive = sortColumn === column;
    const alignClass =
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

    return (
      <th
        className={`px-3 py-2.5 ${alignClass} text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none transition-colors`}
        onClick={() => handleSort(column)}
      >
        <div
          className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}
        >
          <span>{children}</span>
          <span className="inline-flex flex-col">
            {isActive && sortDirection === 'asc' && (
              <Icon name="chevron-up" className="w-3 h-3 text-blue-600" />
            )}
            {isActive && sortDirection === 'desc' && (
              <Icon name="chevron-down" className="w-3 h-3 text-blue-600" />
            )}
            {!isActive && <Icon name="chevron-up" className="w-3 h-3 text-gray-300" />}
          </span>
        </div>
      </th>
    );
  };

  const erroComAcao = erro
    ? { ...erro, action: { label: 'Tentar novamente', onClick: () => void invalidate() } }
    : null;

  return (
    <PageState
      loading={carregando && !dados}
      loadingMessage="Carregando Produção..."
      error={erroComAcao}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Produção</h1>
            <p className="text-gray-500 mt-1">
              {totalFormatado} Registros de Produção
              {atualizando && (
                <span className="ml-2 text-xs text-blue-500 animate-pulse">Atualizando...</span>
              )}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {isAdmin && (
              <Button
                className="w-full sm:w-auto"
                variant="danger"
                icon="trash"
                onClick={handleLimparTodasProducoes}
                loading={limparProducoes.isPending}
                disabled={limparProducoes.isPending}
              >
                Limpar produções importadas
              </Button>
            )}
            <Button
              className="w-full sm:w-auto"
              variant="secondary"
              icon="download"
              onClick={() => void handleExportarExcel()}
              loading={exportando}
              disabled={exportando || !dataInicio || !dataFim}
            >
              Exportar Excel
            </Button>
          </div>
        </div>

        <ConfirmDialog
          state={confirmDialog.state}
          loading={confirmDialog.loading}
          onConfirm={() => void confirmDialog.handleConfirm()}
          onCancel={confirmDialog.close}
        />

        {/* Filtros */}
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Busca</label>
              <input
                type="text"
                placeholder="Nome, repositório, tipo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full h-9 px-3 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Etapa</label>
              <select
                value={etapa}
                onChange={(e) => setEtapa(e.target.value)}
                className="w-full h-9 px-2 text-sm border rounded-lg"
              >
                <option value="">Todas</option>
                {(dados?.filtros.etapas ?? []).map((e) => (
                  <option key={e} value={e}>
                    {ETAPA_LABELS[e] ?? e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Colaborador</label>
              <select
                value={colaborador}
                onChange={(e) => setColaborador(e.target.value)}
                className="w-full h-9 px-2 text-sm border rounded-lg"
              >
                <option value="">Todos</option>
                {(dados?.filtros.colaboradores ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full h-9 px-2 text-sm border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full h-9 px-2 text-sm border rounded-lg"
              />
            </div>
          </div>
          {(etapa || colaborador || dataInicio || dataFim || busca) && (
            <button
              onClick={() => {
                setEtapa('');
                setColaborador('');
                setDataInicio('');
                setDataFim('');
                setBusca('');
              }}
              className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Limpar Filtros
            </button>
          )}
        </Card>

        {/* Tabela */}
        <Card>
          <div className={`space-y-3 md:hidden${atualizando ? ' opacity-60' : ''}`}>
            {!dados || dados.registros.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                {carregando ? 'Carregando...' : 'Nenhum registro encontrado.'}
              </div>
            ) : (
              dados.registros.map((reg) => (
                <div key={reg.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{reg.colaborador_nome}</p>
                      <p className="text-xs text-gray-500">{formatDateBR(reg.data_producao)}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">
                      {formatCriticalNumber(reg.quantidade)}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-gray-700 break-all">
                    {reg.repositorio_ged}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-600">
                      {reg.funcao || ETAPA_LABELS[reg.etapa] || reg.etapa}
                    </span>
                    <span className="text-gray-500">{reg.coordenadoria_sigla || '-'}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    {reg.origem === 'LEGADO' ? (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Legado
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        Fluxo
                      </span>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => void handleExcluir(reg.id)}
                        className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        title="Excluir Registro"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className={`hidden overflow-x-auto md:block${atualizando ? ' opacity-60' : ''}`}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortableHeader column="data">Data</SortableHeader>
                  <SortableHeader column="colaborador">Colaborador</SortableHeader>
                  <SortableHeader column="repositorio">Repositório</SortableHeader>
                  <SortableHeader column="funcao">Função</SortableHeader>
                  <SortableHeader column="tipo">Unidade</SortableHeader>
                  <SortableHeader column="quantidade" align="right">
                    Qtd
                  </SortableHeader>
                  <SortableHeader column="coordenadoria">Coord.</SortableHeader>
                  <SortableHeader column="origem" align="center">
                    Origem
                  </SortableHeader>
                  {isAdmin && (
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">
                      Ações
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {!dados || dados.registros.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 9 : 8}
                      className="px-3 py-8 text-center text-sm text-gray-500"
                    >
                      {carregando ? 'Carregando...' : 'Nenhum registro encontrado.'}
                    </td>
                  </tr>
                ) : (
                  registrosOrdenados.map((reg) => (
                    <tr key={reg.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-800 whitespace-nowrap">
                        {formatDateBR(reg.data_producao)}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-800">{reg.colaborador_nome}</td>
                      <td className="px-3 py-2 text-xs text-gray-800 font-mono">
                        {reg.repositorio_ged}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-800">
                        {reg.funcao || ETAPA_LABELS[reg.etapa] || reg.etapa}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">{reg.tipo || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-800 text-right font-medium tabular-nums">
                        {formatCriticalNumber(reg.quantidade)}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">
                        {reg.coordenadoria_sigla || '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {reg.origem === 'LEGADO' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Legado
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Fluxo
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => void handleExcluir(reg.id)}
                            className="text-gray-400 hover:text-gray-700 p-1"
                            title="Excluir Registro"
                          >
                            <Icon name="trash" className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {dados && (
            <Pagination
              pagina={dados.pagina}
              totalPaginas={dados.totalPaginas}
              onChange={setPagina}
            />
          )}
        </Card>
      </div>
    </PageState>
  );
}
