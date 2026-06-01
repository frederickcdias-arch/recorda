import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { FilterBar } from '../../components/ui/FilterBar';
import { Icon } from '../../components/ui/Icon';
import { ActionFeedback } from '../../components/ui/PageState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Select';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { useCoordenadorias } from '../../hooks/useQueries';
import { api } from '../../services/api';
import { formatDateBR, formatDateTimeBR } from '../../utils/date';
import { formatCriticalNumber } from '../../utils/number';

interface Coordenadoria {
  id: string;
  nome: string;
  sigla: string;
}

interface ProducaoEtapa {
  etapaId: string;
  etapaNome: string;
  unidade: string;
  ordem: number;
  quantidade: number;
}

interface ResumoEtapa {
  etapaId: string;
  etapaNome: string;
  unidade: string;
  ordem: number;
  totalQuantidade: number;
  totalColaboradores: number;
  mediaPorColaborador: number;
}

interface ProducaoColaborador {
  colaboradorId: string;
  colaboradorNome: string;
  matricula: string;
  etapas: ProducaoEtapa[];
  total: number;
}

interface ProducaoCoordenadoria {
  coordenadoriaId: string;
  coordenadoriaNome: string;
  coordenadoriaSigla: string;
  colaboradores: ProducaoColaborador[];
  totaisPorEtapa: ProducaoEtapa[];
  totalGeral: number;
  totalCaixas: number;
  totalImagens: number;
}

interface RelatorioCompleto {
  titulo: string;
  periodo: { inicio: string; fim: string };
  dataGeracao: string;
  resumoPorEtapa: ResumoEtapa[];
  producaoPorCoordenadoria: ProducaoCoordenadoria[];
  glossario: { termo: string; definicao: string }[];
  totais: {
    totalGeral: number;
    totalCaixas: number;
    totalImagens: number;
    totalColaboradores: number;
    totalCoordenadorias: number;
    totalEtapas: number;
  };
}

function formatNum(value: unknown): string {
  return formatCriticalNumber(value);
}

function ordemEtapa(nome: string): number {
  const normalized = nome.toUpperCase();
  if (normalized.includes('RECEBIMENTO')) return 1;
  if (normalized.includes('PREPARA')) return 2;
  if (normalized.includes('P/B')) return 3;
  if (normalized.includes('COLORIDA')) return 4;
  if (normalized.includes('CONFERENC')) return 5;
  if (normalized.includes('MONTAGEM')) return 6;
  if (normalized.includes('RECONFERENC') || normalized.includes('CONTROLE')) return 7;
  if (normalized.includes('ENTREGA')) return 8;
  return 99;
}

export function RelatoriosGerenciaisPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [coordenadoriaId, setCoordenadoriaId] = useState('');
  const coordenadoriasQuery = useCoordenadorias();
  const coordenadorias = (coordenadoriasQuery.data ?? []) as Coordenadoria[];
  const carregandoCoordenadorias = coordenadoriasQuery.isLoading;
  const [gerando, setGerando] = useState<'pdf' | 'excel' | null>(null);
  const [mensagem, setMensagem] = useState<{
    tipo: 'success' | 'error';
    texto: string;
    detalhes?: string;
  } | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioCompleto | null>(null);
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);
  const ultimoAutoLoadRef = useRef<string | null>(null);

  const filtrosUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      dataInicio: params.get('dataInicio') ?? '',
      dataFim: params.get('dataFim') ?? '',
      coordenadoriaId: params.get('coordenadoriaId') ?? '',
    };
  }, [location.search]);

  useEffect(() => {
    setDataInicio(filtrosUrl.dataInicio);
    setDataFim(filtrosUrl.dataFim);
    setCoordenadoriaId(filtrosUrl.coordenadoriaId);
  }, [filtrosUrl.coordenadoriaId, filtrosUrl.dataFim, filtrosUrl.dataInicio]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (dataInicio) params.set('dataInicio', dataInicio);
    if (dataFim) params.set('dataFim', dataFim);
    if (coordenadoriaId) params.set('coordenadoriaId', coordenadoriaId);

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
  }, [coordenadoriaId, dataFim, dataInicio, location.pathname, location.search, navigate]);

  const validarPeriodo = useCallback((): boolean => {
    if (!dataInicio || !dataFim) {
      setMensagem({
        tipo: 'error',
        texto: 'Período obrigatório',
        detalhes: 'Selecione a data de início e fim para gerar o relatório.',
      });
      return false;
    }
    if (new Date(dataInicio) > new Date(dataFim)) {
      setMensagem({
        tipo: 'error',
        texto: 'Período inválido',
        detalhes: 'A data de início deve ser anterior à data de fim.',
      });
      return false;
    }
    return true;
  }, [dataFim, dataInicio]);

  const handleVisualizar = useCallback(async (): Promise<void> => {
    if (!validarPeriodo()) return;

    setCarregandoRelatorio(true);
    setMensagem(null);
    setRelatorio(null);

    try {
      const params = new URLSearchParams({ dataInicio, dataFim, formato: 'json' });
      if (coordenadoriaId) params.set('coordenadoriaId', coordenadoriaId);
      const data = await api.get<RelatorioCompleto>(`/relatorios?${params.toString()}`);
      setRelatorio(data);
    } catch (error: unknown) {
      const detalhes =
        error instanceof Error
          ? error.message
          : ((error as { error?: string })?.error ?? 'Erro ao carregar relatório');
      setMensagem({
        tipo: 'error',
        texto: 'Erro ao gerar relatório',
        detalhes,
      });
    } finally {
      setCarregandoRelatorio(false);
    }
  }, [coordenadoriaId, dataFim, dataInicio, validarPeriodo]);

  useEffect(() => {
    if (!dataInicio || !dataFim) {
      ultimoAutoLoadRef.current = null;
      return;
    }

    if (new Date(dataInicio) > new Date(dataFim)) {
      setMensagem({
        tipo: 'error',
        texto: 'Período inválido',
        detalhes: 'A data de início deve ser anterior à data de fim.',
      });
      return;
    }

    const key = [dataInicio, dataFim, coordenadoriaId].join('|');
    if (ultimoAutoLoadRef.current === key) return;

    ultimoAutoLoadRef.current = key;
    void handleVisualizar();
  }, [coordenadoriaId, dataFim, dataInicio, handleVisualizar]);

  const handleExportar = async (formato: 'pdf' | 'excel'): Promise<void> => {
    if (!validarPeriodo()) return;

    setGerando(formato);
    setMensagem(null);

    try {
      const params = new URLSearchParams({ dataInicio, dataFim, formato });
      if (coordenadoriaId) params.set('coordenadoriaId', coordenadoriaId);

      const endpoint = `/api/relatorios?${params.toString()}`;
      const filename = `relatorio-${formato}-${dataInicio}-a-${dataFim}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`;
      await api.download(endpoint, filename);

      setMensagem({
        tipo: 'success',
        texto: `Relatório ${formato.toUpperCase()} exportado com sucesso`,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Sessão expirada')) {
        setMensagem({
          tipo: 'error',
          texto: 'Sessão expirada',
          detalhes: 'Faça login novamente.',
        });
      } else {
        setMensagem({
          tipo: 'error',
          texto: 'Erro ao exportar relatório',
          detalhes:
            error instanceof Error ? error.message : 'Verifique sua conexão e tente novamente.',
        });
      }
    } finally {
      setGerando(null);
    }
  };

  const coordEtapaRows = useMemo(() => {
    const rows: { coordenadoria: string; etapa: string; total: number }[] = [];
    if (!relatorio) return rows;

    for (const coordenadoria of relatorio.producaoPorCoordenadoria) {
      for (const etapa of coordenadoria.totaisPorEtapa) {
        rows.push({
          coordenadoria: coordenadoria.coordenadoriaSigla || coordenadoria.coordenadoriaNome || '—',
          etapa: etapa.etapaNome,
          total: etapa.quantidade,
        });
      }
    }

    rows.sort(
      (a, b) =>
        a.coordenadoria.localeCompare(b.coordenadoria) || ordemEtapa(a.etapa) - ordemEtapa(b.etapa)
    );
    return rows;
  }, [relatorio]);

  const colabRows = useMemo(() => {
    const rows: { colaborador: string; etapa: string; producao: number; unidade: string }[] = [];
    if (!relatorio) return rows;

    const map = new Map<
      string,
      { colaborador: string; etapa: string; producao: number; unidade: string }
    >();

    for (const coordenadoria of relatorio.producaoPorCoordenadoria) {
      for (const colaborador of coordenadoria.colaboradores) {
        const nomeNorm = colaborador.colaboradorNome.trim().toLowerCase();
        for (const etapa of colaborador.etapas) {
          const key = `${nomeNorm}||${etapa.etapaNome.toLowerCase()}`;
          const existing = map.get(key);
          if (existing) {
            existing.producao += etapa.quantidade;
          } else {
            map.set(key, {
              colaborador: colaborador.colaboradorNome,
              etapa: etapa.etapaNome,
              producao: etapa.quantidade,
              unidade: etapa.unidade,
            });
          }
        }
      }
    }

    rows.push(...map.values());
    rows.sort(
      (a, b) =>
        a.colaborador.localeCompare(b.colaborador) || ordemEtapa(a.etapa) - ordemEtapa(b.etapa)
    );
    return rows;
  }, [relatorio]);

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios Gerenciais" subtitle="Produção por período." />

      {mensagem ? (
        <ActionFeedback
          type={mensagem.tipo}
          title={mensagem.texto}
          message={mensagem.detalhes ?? ''}
          onDismiss={() => setMensagem(null)}
        />
      ) : null}

      <FilterBar
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button
              variant="primary"
              icon="search"
              onClick={() => void handleVisualizar()}
              loading={carregandoRelatorio}
              disabled={carregandoRelatorio || gerando !== null}
              fullWidth
            >
              Visualizar
            </Button>
            <Button
              variant="secondary"
              icon="file-text"
              onClick={() => void handleExportar('pdf')}
              loading={gerando === 'pdf'}
              disabled={gerando !== null || carregandoRelatorio}
              fullWidth
            >
              PDF
            </Button>
            <Button
              variant="secondary"
              icon="table"
              onClick={() => void handleExportar('excel')}
              loading={gerando === 'excel'}
              disabled={gerando !== null || carregandoRelatorio}
              fullWidth
            >
              Excel
            </Button>
          </div>
        }
      >
        <div className="sm:col-span-2 xl:col-span-2">
          <DateRangePicker
            startDate={dataInicio}
            endDate={dataFim}
            onStartDateChange={setDataInicio}
            onEndDateChange={setDataFim}
          />
        </div>
        <Select
          label="Coordenadoria"
          value={coordenadoriaId}
          onChange={(event) => setCoordenadoriaId(event.target.value)}
          disabled={carregandoCoordenadorias}
          options={[
            { value: '', label: carregandoCoordenadorias ? 'Carregando...' : 'Todas' },
            ...coordenadorias.map((coordenadoria) => ({
              value: coordenadoria.id,
              label: `${coordenadoria.sigla} - ${coordenadoria.nome}`,
            })),
          ]}
        />
      </FilterBar>

      {relatorio ? (
        <>
          <Card
            padding="sm"
            className="border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] text-center"
          >
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              {relatorio.titulo}
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {formatDateBR(relatorio.periodo.inicio)} a {formatDateBR(relatorio.periodo.fim)} ·
              Emitido em {formatDateTimeBR(relatorio.dataGeracao)}
            </p>
          </Card>

          <section className="overflow-hidden rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-xs">
            <div className="flex items-center gap-2 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-5 py-3">
              <Icon name="bar-chart" className="h-4 w-4 text-[var(--color-text-tertiary)]" />
              <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                Resumo por Etapa
              </h3>
            </div>

            <div className="space-y-2 p-3 md:hidden">
              {relatorio.resumoPorEtapa.map((etapa) => (
                <Card
                  key={etapa.etapaId}
                  padding="sm"
                  className="border border-[var(--color-border-primary)] shadow-none"
                >
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    {etapa.etapaNome}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-[var(--color-text-secondary)]">{etapa.unidade}</span>
                    <span className="font-medium tabular-nums text-[var(--color-text-primary)]">
                      {formatNum(etapa.totalQuantidade)}
                    </span>
                  </div>
                </Card>
              ))}
              <Card padding="sm" className="bg-[var(--color-bg-secondary)] shadow-none">
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Total caixas
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
                  {formatNum(relatorio.totais.totalCaixas)}
                </p>
              </Card>
              <Card padding="sm" className="bg-[var(--color-bg-secondary)] shadow-none">
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Total imagens
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
                  {formatNum(relatorio.totais.totalImagens)}
                </p>
              </Card>
            </div>

            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Etapa</TableHeader>
                    <TableHeader align="right">Total</TableHeader>
                    <TableHeader>Unidade</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {relatorio.resumoPorEtapa.map((etapa) => (
                    <TableRow key={etapa.etapaId}>
                      <TableCell>{etapa.etapaNome}</TableCell>
                      <TableCell align="right" className="font-medium tabular-nums">
                        {formatNum(etapa.totalQuantidade)}
                      </TableCell>
                      <TableCell>{etapa.unidade}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Total caixas</TableCell>
                    <TableCell align="right" className="font-medium tabular-nums">
                      {formatNum(relatorio.totais.totalCaixas)}
                    </TableCell>
                    <TableCell className="font-medium">Caixas</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Total imagens</TableCell>
                    <TableCell align="right" className="font-medium tabular-nums">
                      {formatNum(relatorio.totais.totalImagens)}
                    </TableCell>
                    <TableCell className="font-medium">Imagens</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-xs">
            <div className="flex items-center gap-2 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-5 py-3">
              <Icon name="building" className="h-4 w-4 text-[var(--color-text-tertiary)]" />
              <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                Coordenadoria por Etapa
              </h3>
            </div>

            <div className="space-y-2 p-3 md:hidden">
              {coordEtapaRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--color-border-primary)] p-4 text-center text-sm text-[var(--color-text-tertiary)]">
                  Sem dados
                </div>
              ) : (
                coordEtapaRows.map((row, index) => (
                  <Card
                    key={`${row.coordenadoria}-${row.etapa}-${index}`}
                    padding="sm"
                    className="border border-[var(--color-border-primary)] shadow-none"
                  >
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {row.coordenadoria}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-[var(--color-text-secondary)]">{row.etapa}</span>
                      <span className="font-medium tabular-nums text-[var(--color-text-primary)]">
                        {formatNum(row.total)}
                      </span>
                    </div>
                  </Card>
                ))
              )}
            </div>

            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Coordenadoria</TableHeader>
                    <TableHeader>Etapa</TableHeader>
                    <TableHeader align="right">Total</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {coordEtapaRows.length === 0 ? (
                    <TableEmptyState colSpan={3} title="Sem dados" />
                  ) : (
                    coordEtapaRows.map((row, index) => (
                      <TableRow key={`${row.coordenadoria}-${row.etapa}-${index}`}>
                        <TableCell className="font-medium">{row.coordenadoria}</TableCell>
                        <TableCell>{row.etapa}</TableCell>
                        <TableCell align="right" className="tabular-nums">
                          {formatNum(row.total)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-xs">
            <div className="flex items-center gap-2 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-5 py-3">
              <Icon name="users" className="h-4 w-4 text-[var(--color-text-tertiary)]" />
              <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                Produção por colaborador
              </h3>
            </div>

            <div className="space-y-2 p-3 md:hidden">
              {colabRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--color-border-primary)] p-4 text-center text-sm text-[var(--color-text-tertiary)]">
                  Sem dados
                </div>
              ) : (
                colabRows.map((row, index) => (
                  <Card
                    key={`${row.colaborador}-${row.etapa}-${index}`}
                    padding="sm"
                    className="border border-[var(--color-border-primary)] shadow-none"
                  >
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {row.colaborador}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-[var(--color-text-secondary)]">{row.etapa}</span>
                      <span className="font-medium tabular-nums text-[var(--color-text-primary)]">
                        {formatNum(row.producao)} {row.unidade}
                      </span>
                    </div>
                  </Card>
                ))
              )}
            </div>

            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Colaborador</TableHeader>
                    <TableHeader>Etapa</TableHeader>
                    <TableHeader align="right">Produção</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {colabRows.length === 0 ? (
                    <TableEmptyState colSpan={3} title="Sem dados" />
                  ) : (
                    colabRows.map((row, index) => (
                      <TableRow key={`${row.colaborador}-${row.etapa}-${index}`}>
                        <TableCell className="font-medium">{row.colaborador}</TableCell>
                        <TableCell>{row.etapa}</TableCell>
                        <TableCell align="right" className="tabular-nums">
                          {formatNum(row.producao)} {row.unidade}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-xs">
            <div className="flex items-center gap-2 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-5 py-3">
              <Icon name="book" className="h-4 w-4 text-[var(--color-text-tertiary)]" />
              <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                Glossário das etapas
              </h3>
            </div>
            <div className="space-y-2 p-5">
              {relatorio.glossario.map((item) => (
                <p key={item.termo} className="text-sm text-[var(--color-text-secondary)]">
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {item.termo}:
                  </span>{' '}
                  {item.definicao}
                </p>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {!relatorio && !carregandoRelatorio ? (
        <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-8 text-center">
          <Icon
            name="file-text"
            className="mx-auto mb-3 h-8 w-8 text-[var(--color-text-tertiary)]"
          />
          <p className="text-sm text-[var(--color-text-secondary)]">
            Selecione o período e clique em <strong>Visualizar</strong>.
          </p>
        </div>
      ) : null}
    </div>
  );
}
