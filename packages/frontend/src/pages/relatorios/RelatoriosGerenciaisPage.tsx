import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { ActionFeedback } from '../../components/ui/PageState';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FilterBar';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
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
import { api } from '../../services/api';
import { useCoordenadorias } from '../../hooks/useQueries';
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

function formatNum(n: unknown): string {
  return formatCriticalNumber(n);
}

export function RelatoriosGerenciaisPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
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
  }, [filtrosUrl.dataInicio, filtrosUrl.dataFim, filtrosUrl.coordenadoriaId]);

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
  }, [dataInicio, dataFim, coordenadoriaId, location.pathname, location.search, navigate]);

  const validarPeriodo = useCallback((): boolean => {
    if (!dataInicio || !dataFim) {
      setMensagem({
        tipo: 'error',
        texto: 'Período obrigatório',
        detalhes: 'Selecione a data de início e fim para gerar o relatório',
      });
      return false;
    }
    if (new Date(dataInicio) > new Date(dataFim)) {
      setMensagem({
        tipo: 'error',
        texto: 'Período inválido',
        detalhes: 'A data de início deve ser anterior à data de fim',
      });
      return false;
    }
    return true;
  }, [dataInicio, dataFim]);

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
      const msg =
        error instanceof Error
          ? error.message
          : ((error as { error?: string })?.error ?? 'Erro ao carregar relatório');
      setMensagem({ tipo: 'error', texto: 'Erro ao gerar relatório', detalhes: msg });
    } finally {
      setCarregandoRelatorio(false);
    }
  }, [validarPeriodo, dataInicio, dataFim, coordenadoriaId]);

  useEffect(() => {
    if (!dataInicio || !dataFim) {
      ultimoAutoLoadRef.current = null;
      return;
    }

    if (new Date(dataInicio) > new Date(dataFim)) {
      setMensagem({
        tipo: 'error',
        texto: 'Período inválido',
        detalhes: 'A data de início deve ser anterior à data de fim',
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
        setMensagem({ tipo: 'error', texto: 'Sessão expirada', detalhes: 'Faça login novamente.' });
      } else {
        setMensagem({
          tipo: 'error',
          texto: 'Erro ao exportar relatório',
          detalhes:
            error instanceof Error ? error.message : 'Verifique sua conexão e tente novamente',
        });
      }
    } finally {
      setGerando(null);
    }
  };

  // Ordem dos serviços: Recebimento, Preparação, Digitalização P/B, Digitalização Colorida, Conferência, Montagem, Reconferência
  const ordemEtapa = (nome: string): number => {
    const n = nome.toUpperCase();
    if (n.includes('RECEBIMENTO')) return 1;
    if (n.includes('PREPARAÇ') || n.includes('PREPARAC')) return 2;
    if (n.includes('P/B')) return 3;
    if (n.includes('COLORIDA')) return 4;
    if (n.includes('CONFERÊNC') || n.includes('CONFERENC')) return 5;
    if (n.includes('MONTAGEM')) return 6;
    if (n.includes('RECONFERÊNC') || n.includes('RECONFERENC') || n.includes('CONTROLE')) return 7;
    if (n.includes('ENTREGA')) return 8;
    return 99;
  };

  // Montar linhas da tabela "Por Coordenadoria e Etapa"
  const coordEtapaRows: { coordenadoria: string; etapa: string; total: number }[] = [];
  if (relatorio) {
    for (const coord of relatorio.producaoPorCoordenadoria) {
      for (const etapa of coord.totaisPorEtapa) {
        coordEtapaRows.push({
          coordenadoria: coord.coordenadoriaSigla || coord.coordenadoriaNome,
          etapa: etapa.etapaNome,
          total: etapa.quantidade,
        });
      }
    }
    coordEtapaRows.sort(
      (a, b) =>
        a.coordenadoria.localeCompare(b.coordenadoria) || ordemEtapa(a.etapa) - ordemEtapa(b.etapa)
    );
  }

  // Montar linhas da tabela "Produção por Colaborador" (agregar por colaborador+função across coordenadorias)
  const colabRows: { colaborador: string; etapa: string; producao: number; unidade: string }[] = [];
  if (relatorio) {
    const colabMap = new Map<
      string,
      { colaborador: string; etapa: string; producao: number; unidade: string }
    >();
    for (const coord of relatorio.producaoPorCoordenadoria) {
      for (const colab of coord.colaboradores) {
        const nomeNorm = colab.colaboradorNome.trim().toLowerCase();
        for (const etapa of colab.etapas) {
          const chave = `${nomeNorm}||${etapa.etapaNome.toLowerCase()}`;
          const existing = colabMap.get(chave);
          if (existing) {
            existing.producao += etapa.quantidade;
          } else {
            colabMap.set(chave, {
              colaborador: colab.colaboradorNome,
              etapa: etapa.etapaNome,
              producao: etapa.quantidade,
              unidade: etapa.unidade,
            });
          }
        }
      }
    }
    colabRows.push(...colabMap.values());
    colabRows.sort(
      (a, b) =>
        a.colaborador.localeCompare(b.colaborador) || ordemEtapa(a.etapa) - ordemEtapa(b.etapa)
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios Gerenciais"
        subtitle="Resumo consolidado da produção por período, coordenadoria e colaborador."
      />

      {mensagem && (
        <ActionFeedback
          type={mensagem.tipo}
          title={mensagem.texto}
          message={mensagem.detalhes ?? ''}
          onDismiss={() => setMensagem(null)}
        />
      )}

      {/* Filtros */}
      <FilterBar
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon="search"
              onClick={() => void handleVisualizar()}
              loading={carregandoRelatorio}
              disabled={carregandoRelatorio || gerando !== null}
            >
              Gerar visualização
            </Button>
            <Button
              variant="secondary"
              icon="file-text"
              onClick={() => void handleExportar('pdf')}
              loading={gerando === 'pdf'}
              disabled={gerando !== null || carregandoRelatorio}
            >
              PDF
            </Button>
            <Button
              variant="secondary"
              icon="table"
              onClick={() => void handleExportar('excel')}
              loading={gerando === 'excel'}
              disabled={gerando !== null || carregandoRelatorio}
            >
              Excel
            </Button>
          </div>
        }
      >
        <div className="sm:col-span-2 lg:col-span-2">
          <DateRangePicker
            startDate={dataInicio}
            endDate={dataFim}
            onStartDateChange={setDataInicio}
            onEndDateChange={setDataFim}
            showPresets={false}
          />
        </div>
        <Select
          label="Coordenadoria"
          value={coordenadoriaId}
          onChange={(e) => setCoordenadoriaId(e.target.value)}
          disabled={carregandoCoordenadorias}
          options={[
            { value: '', label: carregandoCoordenadorias ? 'Carregando...' : 'Todas' },
            ...coordenadorias.map((c) => ({ value: c.id, label: `${c.sigla} - ${c.nome}` })),
          ]}
        />
      </FilterBar>

      {/* Dados do Relatório */}
      {relatorio && (
        <>
          {/* Cabeçalho do relatório */}
          <div className="bg-[var(--color-primary-50)] rounded-xl p-4 border border-[var(--color-primary-200)] text-center">
            <h3 className="text-lg font-bold text-[var(--color-primary-900)]">
              {relatorio.titulo.toUpperCase()}
            </h3>
            <p className="text-sm text-[var(--color-primary-700)] mt-1">
              Período: {formatDateBR(relatorio.periodo.inicio)} a{' '}
              {formatDateBR(relatorio.periodo.fim)}
              {' | '}Emitido em: {formatDateTimeBR(relatorio.dataGeracao)}
            </p>
          </div>

          {/* RESUMO GERAL POR ETAPA */}
          <div className="bg-[var(--color-bg-primary)] rounded-xl shadow-xs border border-[var(--color-border-primary)] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-primary-800 text-white">
              <Icon name="bar-chart" className="w-4 h-4" />
              <h3 className="font-semibold text-sm">RESUMO GERAL POR ETAPA</h3>
            </div>
            <div className="space-y-2 p-3 md:hidden">
              {relatorio.resumoPorEtapa.map((etapa) => (
                <div key={etapa.etapaId} className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-900">{etapa.etapaNome}</p>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-gray-500">{etapa.unidade}</span>
                    <span className="font-semibold text-gray-900 tabular-nums">
                      {formatNum(etapa.totalQuantidade)}
                    </span>
                  </div>
                </div>
              ))}
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-semibold text-gray-600">TOTAL CAIXAS</p>
                <p className="mt-1 text-sm font-bold text-gray-900 tabular-nums">
                  {formatNum(relatorio.totais.totalCaixas)}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-semibold text-gray-600">TOTAL IMAGENS</p>
                <p className="mt-1 text-sm font-bold text-gray-900 tabular-nums">
                  {formatNum(relatorio.totais.totalImagens)}
                </p>
              </div>
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
                    <TableCell className="font-bold">TOTAL CAIXAS</TableCell>
                    <TableCell align="right" className="font-bold tabular-nums">
                      {formatNum(relatorio.totais.totalCaixas)}
                    </TableCell>
                    <TableCell className="font-bold">CAIXAS</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-bold">TOTAL IMAGENS</TableCell>
                    <TableCell align="right" className="font-bold tabular-nums">
                      {formatNum(relatorio.totais.totalImagens)}
                    </TableCell>
                    <TableCell className="font-bold">IMAGENS</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* POR COORDENADORIA E ETAPA */}
          <div className="bg-[var(--color-bg-primary)] rounded-xl shadow-xs border border-[var(--color-border-primary)] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-primary-700 text-white">
              <Icon name="building" className="w-4 h-4" />
              <h3 className="font-semibold text-sm">POR COORDENADORIA E ETAPA</h3>
            </div>
            <div className="space-y-2 p-3 md:hidden">
              {coordEtapaRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                  Sem dados
                </div>
              ) : (
                coordEtapaRows.map((row, i) => (
                  <div
                    key={`${row.coordenadoria}-${row.etapa}-${i}`}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <p className="text-sm font-medium text-gray-900">{row.coordenadoria}</p>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-gray-600">{row.etapa}</span>
                      <span className="font-semibold text-gray-900 tabular-nums">
                        {formatNum(row.total)}
                      </span>
                    </div>
                  </div>
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
                    coordEtapaRows.map((row, i) => (
                      <TableRow key={`${row.coordenadoria}-${row.etapa}-${i}`}>
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
          </div>

          {/* Produção por colaborador */}
          <div className="bg-[var(--color-bg-primary)] rounded-xl shadow-xs border border-[var(--color-border-primary)] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-primary-600 text-white">
              <Icon name="users" className="w-4 h-4" />
              <h3 className="font-semibold text-sm">Produção por colaborador</h3>
            </div>
            <div className="space-y-2 p-3 md:hidden">
              {colabRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                  Sem dados
                </div>
              ) : (
                colabRows.map((row, i) => (
                  <div
                    key={`${row.colaborador}-${row.etapa}-${i}`}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <p className="text-sm font-medium text-gray-900">{row.colaborador}</p>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-gray-600">{row.etapa}</span>
                      <span className="font-semibold text-gray-900 tabular-nums">
                        {formatNum(row.producao)} {row.unidade}
                      </span>
                    </div>
                  </div>
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
                    colabRows.map((row, i) => (
                      <TableRow key={`${row.colaborador}-${row.etapa}-${i}`}>
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
          </div>

          {/* GLOSSÁRIO */}
          <div className="bg-[var(--color-bg-primary)] rounded-xl shadow-xs border border-[var(--color-border-primary)] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-[var(--color-gray-600)] text-white">
              <Icon name="book" className="w-4 h-4" />
              <h3 className="font-semibold text-sm">Glossário das etapas</h3>
            </div>
            <div className="p-5 space-y-2">
              {relatorio.glossario.map((item) => (
                <p key={item.termo} className="text-sm text-gray-700">
                  <span className="font-semibold text-gray-900">{item.termo}:</span>{' '}
                  {item.definicao}
                </p>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Estado vazio */}
      {!relatorio && !carregandoRelatorio && (
        <div className="bg-gray-50 rounded-xl p-10 text-center border border-gray-200">
          <Icon name="file-text" className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            Selecione o período e clique em <strong>Gerar visualização</strong> para gerar o
            relatório.
          </p>
        </div>
      )}
    </div>
  );
}
