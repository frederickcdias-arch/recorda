import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { PageState } from '../../components/ui/PageState';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FilterBar';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
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
import { useDebounce } from '../../hooks/useDebounce';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { formatDateBR } from '../../utils/date';
import { getEtapaProducaoStyle } from '../../utils/etapa';
import { formatCriticalNumber, parseFiniteNumber } from '../../utils/number';

interface ProducaoItem {
  id: string;
  data_producao: string;
  etapa: string;
  etapa_label?: string;
  coordenadoria_label?: string;
  tipo_label?: string;
  quantidade: number;
  id_repositorio_ged: string;
  marcadores?: Record<string, string>;
}

interface EtapaStats {
  etapa: string;
  registros: number;
  quantidade: number;
}

interface MeuHistoricoResponse {
  producoes: ProducaoItem[];
  total: number;
  totalQuantidade?: number;
  registrosUltimos7Dias?: number;
  quantidadeUltimos7Dias?: number;
  producaoPorEtapa?: EtapaStats[];
  producaoPorTipo?: Array<{ tipo: string; registros: number; quantidade: number }>;
  etapasDisponiveis?: string[];
  pagina: number;
  totalPaginas: number;
}

export function MeuHistoricoPage(): JSX.Element {
  const location = useLocation();
  const { usuario } = useAuth();
  const [pagina, setPagina] = useState(1);
  const [etapaFiltro, setEtapaFiltro] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [buscaInput, setBuscaInput] = useState('');
  const busca = useDebounce(buscaInput, 600);
  const limite = 50;

  type SortField =
    | 'data_producao'
    | 'id_repositorio_ged'
    | 'coordenadoria'
    | 'etapa'
    | 'quantidade';
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filtrosUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      pagina: Math.max(Number(params.get('pagina') ?? '1'), 1),
      etapa: params.get('etapa') ?? '',
      dataInicio: params.get('dataInicio') ?? '',
      dataFim: params.get('dataFim') ?? '',
    };
  }, [location.search]);

  useEffect(() => {
    setPagina(filtrosUrl.pagina);
    setEtapaFiltro(filtrosUrl.etapa);
    setDataInicio(filtrosUrl.dataInicio);
    setDataFim(filtrosUrl.dataFim);
  }, [filtrosUrl.pagina, filtrosUrl.etapa, filtrosUrl.dataInicio, filtrosUrl.dataFim]);

  const queryParams = new URLSearchParams();
  queryParams.set('limite', String(limite));
  queryParams.set('pagina', String(pagina));
  if (etapaFiltro) queryParams.set('etapa', etapaFiltro);
  if (dataInicio) queryParams.set('dataInicio', dataInicio);
  if (dataFim) queryParams.set('dataFim', dataFim);
  if (busca) queryParams.set('busca', busca);

  const { data, error, isError, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['meu-historico', pagina, etapaFiltro, dataInicio, dataFim, busca],
    queryFn: () =>
      api.get<MeuHistoricoResponse>(`/producao/meu-historico?${queryParams.toString()}`),
    placeholderData: keepPreviousData,
  });

  const producoesBrutos = data?.producoes ?? [];

  const producoes = useMemo(() => {
    if (!sortField) return producoesBrutos;
    return [...producoesBrutos].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortField === 'coordenadoria') {
        av = (a.coordenadoria_label ?? a.marcadores?.coordenadoria ?? 'NAO INFORMADO')
          .trim()
          .toUpperCase();
        bv = (b.coordenadoria_label ?? b.marcadores?.coordenadoria ?? 'NAO INFORMADO')
          .trim()
          .toUpperCase();
      } else if (sortField === 'etapa') {
        av = (a.etapa_label ?? a.etapa).toLowerCase();
        bv = (b.etapa_label ?? b.etapa).toLowerCase();
      } else if (sortField === 'quantidade') {
        av = a.quantidade;
        bv = b.quantidade;
      } else {
        av = (a[sortField] as string).toLowerCase();
        bv = (b[sortField] as string).toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [producoesBrutos, sortField, sortDir]);
  const total = parseFiniteNumber(data?.total);
  const totalQuantidade = parseFiniteNumber(data?.totalQuantidade);
  const registrosUltimos7Dias = parseFiniteNumber(data?.registrosUltimos7Dias) ?? 0;
  const quantidadeUltimos7Dias = parseFiniteNumber(data?.quantidadeUltimos7Dias) ?? 0;
  const totalPaginas = data?.totalPaginas ?? 1;
  const etapasDisponiveis = data?.etapasDisponiveis ?? [];
  const producaoPorEtapa = data?.producaoPorEtapa ?? [];
  const maxQuantidadeEtapa = Math.max(...producaoPorEtapa.map((e) => e.quantidade), 1);

  const handleLimparFiltros = (): void => {
    setEtapaFiltro('');
    setDataInicio('');
    setDataFim('');
    setBuscaInput('');
    setPagina(1);
  };

  const temFiltros = etapaFiltro || dataInicio || dataFim || buscaInput;

  const errorInfo = isError
    ? {
        message: 'Não foi possível carregar os números agora. Tente novamente em instantes.',
        details:
          error instanceof Error ? error.message : 'Falha ao carregar o histórico do colaborador.',
        action: {
          label: 'Tentar novamente',
          onClick: () => {
            void refetch();
          },
        },
      }
    : null;

  if (errorInfo) {
    return (
      <PageState loading={false} error={errorInfo}>
        <div />
      </PageState>
    );
  }

  return (
    <PageState loading={isLoading} loadingMessage="Carregando histórico...">
      <div className="space-y-6">
        <PageHeader
          title="Meu Histórico"
          subtitle={`Produção de ${usuario?.nome ?? ''}`}
        />

        {/* Filtros */}
        <FilterBar
          actions={
            temFiltros ? (
              <Button variant="ghost" size="sm" onClick={handleLimparFiltros}>
                <Icon name="x" className="w-3 h-3" />
                Limpar filtros
              </Button>
            ) : undefined
          }
        >
          <div className="sm:col-span-2 lg:col-span-2">
            <DateRangePicker
              startDate={dataInicio}
              endDate={dataFim}
              onStartDateChange={(v) => {
                setDataInicio(v);
                setPagina(1);
              }}
              onEndDateChange={(v) => {
                setDataFim(v);
                setPagina(1);
              }}
              showPresets
              onPresetChange={({ startDate, endDate }) => {
                setDataInicio(startDate);
                setDataFim(endDate);
                setPagina(1);
              }}
            />
          </div>
          <Select
            label="Etapa"
            value={etapaFiltro}
            onChange={(e) => {
              setEtapaFiltro(e.target.value);
              setPagina(1);
            }}
            options={[
              { value: '', label: 'Todas' },
              ...etapasDisponiveis.map((e) => ({ value: e, label: e })),
            ]}
          />
          <Input
            label="Buscar Repositório"
            placeholder="Ex: 943/2024"
            value={buscaInput}
            onChange={(e) => {
              setBuscaInput(e.target.value);
              setPagina(1);
            }}
          />
        </FilterBar>

        {/* Stats */}
        <div
          className={`grid grid-cols-1 md:grid-cols-3 gap-4 transition-opacity duration-150 ${isFetching && !isLoading ? 'opacity-60' : 'opacity-100'}`}
        >
          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--color-text-secondary)]">Total de registros</p>
                  <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                    {formatCriticalNumber(total)}
                  </p>
                </div>
                <Icon name="clipboard" className="w-8 h-8 text-primary-600" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--color-text-secondary)]">Quantidade total</p>
                  <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                    {formatCriticalNumber(totalQuantidade)}
                  </p>
                </div>
                <Icon name="bar-chart" className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--color-text-secondary)]">Últimos 7 dias</p>
                  <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                    {formatCriticalNumber(registrosUltimos7Dias)}
                  </p>
                  {quantidadeUltimos7Dias > 0 ? (
                    <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      {quantidadeUltimos7Dias.toLocaleString('pt-BR')} itens
                    </p>
                  ) : null}
                </div>
                <Icon name="calendar" className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Resumo por etapa */}
        <Card>
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-4">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Produção por Etapa
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Mesmos filtros da tabela abaixo
              </p>
            </div>

            {producaoPorEtapa.length === 0 ? (
              <p className="py-4 text-sm text-[var(--color-text-secondary)]">
                Nenhuma produção encontrada
              </p>
            ) : (
              <div className="space-y-3">
                {producaoPorEtapa.map((item) => {
                  const cor = getEtapaProducaoStyle(item.etapa);
                  const largura = Math.max((item.quantidade / maxQuantidadeEtapa) * 100, 2);

                  return (
                    <div key={item.etapa}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cor.bg} ${cor.text}`}
                          >
                            {item.etapa}
                          </span>
                          <span className="text-xs text-[var(--color-text-tertiary)]">
                            {item.registros.toLocaleString('pt-BR')} registro
                            {item.registros !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <span className="font-medium text-[var(--color-text-primary)]">
                          {item.quantidade.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <progress
                        className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-bg-secondary)] accent-primary-500"
                        value={largura}
                        max={100}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Tabela */}
        <div className="space-y-2">
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {producoes.length === 0 ? (
              <div className="rounded-xl border border-[var(--color-border-primary)] p-6 text-center text-[var(--color-text-secondary)] text-sm">
                {temFiltros
                  ? 'Ajuste os filtros.'
                  : 'Lance sua primeira produção.'}
              </div>
            ) : (
              producoes.map((p) => {
                const label = p.etapa_label ?? p.etapa;
                const coordenadoria =
                  p.coordenadoria_label ?? p.marcadores?.coordenadoria ?? 'NAO INFORMADO';
                const cor = getEtapaProducaoStyle(label);
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                          {p.id_repositorio_ged}
                        </p>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                          {coordenadoria.trim().toUpperCase()}
                        </p>
                      </div>
                      <p className="text-xs text-[var(--color-text-tertiary)] shrink-0">
                        {formatDateBR(p.data_producao)}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className={`px-2 py-1 text-xs rounded-full ${cor.bg} ${cor.text}`}>
                        {label}
                      </span>
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {p.quantidade.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader
                    sortable
                    sortDirection={sortField === 'data_producao' ? sortDir : null}
                    onSort={() => {
                      handleSort('data_producao');
                    }}
                  >
                    Data
                  </TableHeader>
                  <TableHeader
                    sortable
                    sortDirection={sortField === 'id_repositorio_ged' ? sortDir : null}
                    onSort={() => {
                      handleSort('id_repositorio_ged');
                    }}
                  >
                    Repositório
                  </TableHeader>
                  <TableHeader
                    sortable
                    sortDirection={sortField === 'coordenadoria' ? sortDir : null}
                    onSort={() => {
                      handleSort('coordenadoria');
                    }}
                  >
                    Coordenadoria
                  </TableHeader>
                  <TableHeader
                    sortable
                    sortDirection={sortField === 'etapa' ? sortDir : null}
                    onSort={() => {
                      handleSort('etapa');
                    }}
                  >
                    Etapa
                  </TableHeader>
                  <TableHeader
                    align="right"
                    sortable
                    sortDirection={sortField === 'quantidade' ? sortDir : null}
                    onSort={() => {
                      handleSort('quantidade');
                    }}
                  >
                    Quantidade
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {producoes.length === 0 ? (
                  <TableEmptyState
                    colSpan={5}
                    title="Nenhuma produção encontrada"
                    description={
                      temFiltros
                        ? 'Ajuste os filtros'
                        : 'Lance sua primeira produção'
                    }
                  />
                ) : (
                  producoes.map((p) => {
                    const label = p.etapa_label ?? p.etapa;
                    const coordenadoria =
                      p.coordenadoria_label ?? p.marcadores?.coordenadoria ?? 'NAO INFORMADO';
                    const cor = getEtapaProducaoStyle(label);
                    return (
                      <TableRow key={p.id}>
                        <TableCell>{formatDateBR(p.data_producao)}</TableCell>
                        <TableCell className="font-medium">{p.id_repositorio_ged}</TableCell>
                        <TableCell className="font-medium">
                          {coordenadoria.trim().toUpperCase()}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 text-xs rounded-full ${cor.bg} ${cor.text}`}>
                            {label}
                          </span>
                        </TableCell>
                        <TableCell align="right" className="font-medium">
                          {p.quantidade.toLocaleString('pt-BR')}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {totalPaginas > 1 ? (
            <div className="flex items-center justify-between px-1 py-2">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Mostrando {(pagina - 1) * limite + 1}–{Math.min(pagina * limite, total ?? 0)} de{' '}
                <span className="font-medium">{formatCriticalNumber(total)}</span> registros
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                >
                  <Icon name="chevron-left" className="w-4 h-4" />
                  Anterior
                </Button>
                <span className="flex items-center text-sm text-[var(--color-text-secondary)] px-2">
                  {pagina} / {totalPaginas}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                >
                  Próxima
                  <Icon name="chevron-right" className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </PageState>
  );
}
