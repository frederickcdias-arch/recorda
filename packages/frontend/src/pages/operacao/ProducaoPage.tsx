import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { PageState } from '../../components/ui/PageState';
import { Pagination } from '../../components/ui/Pagination';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToastHelpers } from '../../components/ui/Toast';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FilterBar';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  TableEmptyState,
} from '../../components/ui/Table';
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
        message: 'Erro ao carregar registros de produção',
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

  const erroComAcao = erro
    ? { ...erro, action: { label: 'Tentar novamente', onClick: () => void invalidate() } }
    : null;

  return (
    <PageState
      loading={carregando && !dados}
      loadingMessage="Carregando registros de produção..."
      error={erroComAcao}
    >
      <div className="space-y-6">
        <PageHeader
          title="Produção"
          subtitle={
            <>
              {totalFormatado} Registros de Produção
              {atualizando && (
                <span className="ml-2 text-xs text-[var(--color-primary-500)] animate-pulse">
                  Atualizando...
                </span>
              )}
            </>
          }
          actions={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {isAdmin && (
                <Button
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
                variant="secondary"
                icon="download"
                onClick={() => void handleExportarExcel()}
                loading={exportando}
                disabled={exportando || !dataInicio || !dataFim}
              >
                Exportar Excel
              </Button>
              {(!dataInicio || !dataFim) && (
                <p className="text-xs text-[var(--color-text-tertiary)] text-center sm:text-right">
                  Informe o período para exportar
                </p>
              )}
            </div>
          }
        />

        <ConfirmDialog
          state={confirmDialog.state}
          loading={confirmDialog.loading}
          onConfirm={() => void confirmDialog.handleConfirm()}
          onCancel={confirmDialog.close}
        />

        {/* Filtros */}
        <FilterBar
          actions={
            etapa || colaborador || dataInicio || dataFim || busca ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEtapa('');
                  setColaborador('');
                  setDataInicio('');
                  setDataFim('');
                  setBusca('');
                }}
              >
                <Icon name="x" className="w-3 h-3" />
                Limpar Filtros
              </Button>
            ) : undefined
          }
        >
          <Input
            label="Data inicial"
            type="date"
            value={dataInicio}
            max={dataFim || undefined}
            onChange={(e) => setDataInicio(e.target.value)}
          />
          <Input
            label="Data final"
            type="date"
            value={dataFim}
            min={dataInicio || undefined}
            onChange={(e) => setDataFim(e.target.value)}
          />
          <Select
            label="Etapa"
            value={etapa}
            onChange={(e) => setEtapa(e.target.value)}
            options={[
              { value: '', label: 'Todas' },
              ...(dados?.filtros.etapas ?? []).map((e) => ({
                value: e,
                label: ETAPA_LABELS[e] ?? e,
              })),
            ]}
          />
          <Select
            label="Colaborador"
            value={colaborador}
            onChange={(e) => setColaborador(e.target.value)}
            options={[
              { value: '', label: 'Todos' },
              ...(dados?.filtros.colaboradores ?? []).map((c) => ({
                value: c.id,
                label: c.nome,
              })),
            ]}
          />
          <Input
            label="Busca"
            placeholder="Nome, repositório, tipo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </FilterBar>

        {/* Tabela — mobile cards */}
        <div className={`space-y-3 md:hidden${atualizando ? ' opacity-60' : ''}`}>
          {!dados || dados.registros.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border-primary)] px-4 py-8 text-center text-sm text-[var(--color-text-secondary)]">
              {carregando ? 'Carregando...' : 'Nenhum registro encontrado.'}
            </div>
          ) : (
            dados.registros.map((reg) => (
              <div
                key={reg.id}
                className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {reg.colaborador_nome}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {formatDateBR(reg.data_producao)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-[var(--color-text-primary)] tabular-nums">
                    {formatCriticalNumber(reg.quantidade)}
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs text-[var(--color-text-primary)] break-all">
                  {reg.repositorio_ged}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--color-text-secondary)]">
                    {reg.funcao || ETAPA_LABELS[reg.etapa] || reg.etapa}
                  </span>
                  <span className="text-[var(--color-text-tertiary)]">
                    {reg.coordenadoria_sigla || '-'}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      reg.origem === 'LEGADO'
                        ? 'bg-[var(--color-gray-100)] text-[var(--color-gray-700)]'
                        : 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
                    }`}
                  >
                    {reg.origem === 'LEGADO' ? 'Legado' : 'Fluxo'}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => void handleExcluir(reg.id)}
                      className="rounded-md p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-text-primary)]"
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

        {/* Tabela — desktop */}
        <div className={`hidden md:block${atualizando ? ' opacity-60' : ''}`}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader
                  sortable
                  sortDirection={sortColumn === 'data' ? sortDirection : null}
                  onSort={() => handleSort('data')}
                >
                  Data
                </TableHeader>
                <TableHeader
                  sortable
                  sortDirection={sortColumn === 'colaborador' ? sortDirection : null}
                  onSort={() => handleSort('colaborador')}
                >
                  Colaborador
                </TableHeader>
                <TableHeader
                  sortable
                  sortDirection={sortColumn === 'repositorio' ? sortDirection : null}
                  onSort={() => handleSort('repositorio')}
                >
                  Repositório
                </TableHeader>
                <TableHeader
                  sortable
                  sortDirection={sortColumn === 'funcao' ? sortDirection : null}
                  onSort={() => handleSort('funcao')}
                >
                  Função
                </TableHeader>
                <TableHeader
                  sortable
                  sortDirection={sortColumn === 'tipo' ? sortDirection : null}
                  onSort={() => handleSort('tipo')}
                >
                  Unidade
                </TableHeader>
                <TableHeader
                  align="right"
                  sortable
                  sortDirection={sortColumn === 'quantidade' ? sortDirection : null}
                  onSort={() => handleSort('quantidade')}
                >
                  Qtd
                </TableHeader>
                <TableHeader
                  sortable
                  sortDirection={sortColumn === 'coordenadoria' ? sortDirection : null}
                  onSort={() => handleSort('coordenadoria')}
                >
                  Coord.
                </TableHeader>
                <TableHeader
                  align="center"
                  sortable
                  sortDirection={sortColumn === 'origem' ? sortDirection : null}
                  onSort={() => handleSort('origem')}
                >
                  Origem
                </TableHeader>
                {isAdmin && <TableHeader align="center">Ações</TableHeader>}
              </TableRow>
            </TableHead>
            <TableBody>
              {!dados || registrosOrdenados.length === 0 ? (
                <TableEmptyState
                  colSpan={isAdmin ? 9 : 8}
                  title="Nenhum registro encontrado"
                  description={
                    etapa || colaborador || dataInicio || dataFim || busca
                      ? 'Ajuste os filtros ou tente outro período.'
                      : 'Ainda não há registros de produção cadastrados.'
                  }
                />
              ) : (
                registrosOrdenados.map((reg) => (
                  <TableRow key={reg.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateBR(reg.data_producao)}
                    </TableCell>
                    <TableCell>{reg.colaborador_nome}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[200px]">
                      <span title={reg.repositorio_ged} className="block truncate">
                        {reg.repositorio_ged}
                      </span>
                    </TableCell>
                    <TableCell>{reg.funcao || ETAPA_LABELS[reg.etapa] || reg.etapa}</TableCell>
                    <TableCell>{reg.tipo || '-'}</TableCell>
                    <TableCell align="right" className="font-medium tabular-nums">
                      {formatCriticalNumber(reg.quantidade)}
                    </TableCell>
                    <TableCell>{reg.coordenadoria_sigla || '-'}</TableCell>
                    <TableCell align="center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          reg.origem === 'LEGADO'
                            ? 'bg-[var(--color-gray-100)] text-[var(--color-gray-700)]'
                            : 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
                        }`}
                      >
                        {reg.origem === 'LEGADO' ? 'Legado' : 'Fluxo'}
                      </span>
                    </TableCell>
                    {isAdmin && (
                      <TableCell align="center">
                        <button
                          onClick={() => void handleExcluir(reg.id)}
                          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] p-2 rounded"
                          title="Excluir Registro"
                        >
                          <Icon name="trash" className="w-4 h-4" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {dados && dados.registros.length > 0 && (
            <p className="mt-3 text-xs text-[var(--color-text-secondary)] text-center">
              Exibindo {(dados.pagina - 1) * 25 + 1}–
              {(dados.pagina - 1) * 25 + dados.registros.length} de{' '}
              {formatCriticalNumber(dados.total)} registro{dados.total !== 1 ? 's' : ''}
            </p>
          )}
          {dados && (
            <Pagination
              pagina={dados.pagina}
              totalPaginas={dados.totalPaginas}
              onChange={setPagina}
            />
          )}
        </div>
      </div>
    </PageState>
  );
}
