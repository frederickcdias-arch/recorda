import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { Icon } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';
import { ActionFeedback } from '../../components/ui/PageState';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { api } from '../../services/api';
import { formatDateBR, toDateInputValue } from '../../utils/date';
import { formatCriticalNumber } from '../../utils/number';

interface PreviewData {
  titulo: string;
  resumoPorEtapa: { etapaNome: string; totalQuantidade: number; unidade: string }[];
  producaoPorCoordenadoria: {
    coordenadoriaNome: string;
    coordenadoriaSigla: string;
    colaboradores: { colaboradorNome: string; total: number }[];
    totalGeral: number;
    totalCaixas: number;
    totalImagens: number;
  }[];
  totais: {
    totalGeral: number;
    totalCaixas: number;
    totalImagens: number;
    totalColaboradores: number;
    totalCoordenadorias: number;
    totalEtapas: number;
  };
}

interface OperacionalRow {
  id: string;
  data: string;
  colaborador: string;
  etapa: string;
  funcao: string;
  repositorio: string;
  quantidade: number;
}

interface ExportItem {
  id: string;
  nome: string;
  descricao: string;
  detalhes: string[];
  icon: string;
  color: string;
  formatos: ('pdf' | 'excel')[];
}

const EXPORTACOES: ExportItem[] = [
  {
    id: 'gerencial',
    nome: 'Relatório Gerencial de Produção',
    descricao: 'Resumo consolidado da produção por período, coordenadoria e colaborador.',
    detalhes: [
      'Resumo Geral por Etapa',
      'Produção por coordenadoria',
      'Produção individual por colaborador',
      'Totais consolidados do período',
    ],
    icon: 'briefcase',
    color: 'blue',
    formatos: ['pdf', 'excel'],
  },
  {
    id: 'operacional',
    nome: 'Detalhamento operacional',
    descricao: 'Lista detalhada de todos os registros de produção no período.',
    detalhes: [
      'Data, colaborador e etapa',
      'Repositório e função por registro',
      'Consulta útil para análise e auditoria',
    ],
    icon: 'clipboard',
    color: 'blue',
    formatos: ['excel'],
  },
];

function PreviewGerencialModal({
  data,
  onClose,
  onExportPdf,
  onExportExcel,
}: {
  data: PreviewData;
  onClose: () => void;
  onExportPdf: () => void;
  onExportExcel: () => void;
}): JSX.Element {
  return (
    <Modal
      open
      onClose={onClose}
      title="Preview — Relatório Gerencial"
      subtitle={data.titulo || ''}
      size="xl"
      scrollable
      footer={
        <div className="flex flex-col-reverse gap-3 px-5 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} fullWidth>
            Fechar
          </Button>
          <Button variant="secondary" onClick={onExportExcel} fullWidth>
            Exportar Excel
          </Button>
          <Button variant="primary" onClick={onExportPdf} fullWidth>
            Exportar PDF
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card padding="sm" className="text-center">
            <p className="text-xs text-[var(--color-text-tertiary)]">Total caixas</p>
            <p className="mt-1 text-base font-semibold text-[var(--color-text-primary)]">
              {formatCriticalNumber(data.totais.totalCaixas)}
            </p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-xs text-[var(--color-text-tertiary)]">Total imagens</p>
            <p className="mt-1 text-base font-semibold text-[var(--color-text-primary)]">
              {formatCriticalNumber(data.totais.totalImagens)}
            </p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-xs text-[var(--color-text-tertiary)]">Colaboradores</p>
            <p className="mt-1 text-base font-semibold text-[var(--color-text-primary)]">
              {formatCriticalNumber(data.totais.totalColaboradores)}
            </p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-xs text-[var(--color-text-tertiary)]">Coordenadorias</p>
            <p className="mt-1 text-base font-semibold text-[var(--color-text-primary)]">
              {formatCriticalNumber(data.totais.totalCoordenadorias)}
            </p>
          </Card>
        </div>

        {data.resumoPorEtapa.length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Resumo por Etapa
            </h4>

            <div className="grid gap-3 lg:hidden">
              {data.resumoPorEtapa.map((item) => (
                <Card key={item.etapaNome} padding="sm" className="space-y-2">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    {item.etapaNome}
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Total</span>
                    <span className="font-semibold text-[var(--color-text-primary)]">
                      {formatCriticalNumber(item.totalQuantidade)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Unidade</span>
                    <span className="text-[var(--color-text-primary)]">{item.unidade}</span>
                  </div>
                </Card>
              ))}
            </div>

            <div className="hidden lg:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Etapa</TableHeader>
                    <TableHeader align="right">Total</TableHeader>
                    <TableHeader align="right">Unidade</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.resumoPorEtapa.map((item) => (
                    <TableRow key={item.etapaNome}>
                      <TableCell>{item.etapaNome}</TableCell>
                      <TableCell align="right" className="font-semibold">
                        {formatCriticalNumber(item.totalQuantidade)}
                      </TableCell>
                      <TableCell align="right" className="text-[var(--color-text-secondary)]">
                        {item.unidade}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {data.producaoPorCoordenadoria.length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Por coordenadoria ({data.producaoPorCoordenadoria.length})
            </h4>
            <div className="grid gap-3">
              {data.producaoPorCoordenadoria.map((item) => (
                <Card key={item.coordenadoriaSigla} padding="sm" className="space-y-2">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {item.coordenadoriaNome}
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        {item.coordenadoriaSigla}
                      </p>
                    </div>
                    <div className="text-sm text-[var(--color-text-secondary)]">
                      {formatCriticalNumber(item.totalCaixas)} caixas ·{' '}
                      {formatCriticalNumber(item.totalImagens)} imagens
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function PreviewOperacionalModal({
  rows,
  onClose,
  onExportExcel,
}: {
  rows: OperacionalRow[];
  onClose: () => void;
  onExportExcel: () => void;
}): JSX.Element {
  const visibleRows = rows.slice(0, 100);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Preview — Detalhamento Operacional (${rows.length} registros)`}
      subtitle=""
      size="xl"
      scrollable
      footer={
        <div className="flex flex-col-reverse gap-3 px-5 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} fullWidth>
            Fechar
          </Button>
          <Button variant="primary" onClick={onExportExcel} fullWidth>
            Exportar Excel
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
            Nenhum registro no período.
          </p>
        ) : (
          <>
            <div className="grid gap-3 lg:hidden">
              {visibleRows.map((row, index) => (
                <Card key={row.id || index} padding="sm" className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {row.colaborador}
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{row.data}</p>
                    </div>
                    <span className="rounded-full bg-[var(--color-primary-100)] px-2 py-1 text-xs font-semibold text-[var(--color-primary-800)]">
                      {formatCriticalNumber(row.quantidade)}
                    </span>
                  </div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-[var(--color-text-tertiary)]">Etapa</dt>
                      <dd className="text-[var(--color-text-primary)]">{row.etapa}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--color-text-tertiary)]">Funcao</dt>
                      <dd className="text-[var(--color-text-primary)]">{row.funcao || '—'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-[var(--color-text-tertiary)]">Repositorio</dt>
                      <dd className="break-all font-mono text-[var(--color-text-primary)]">
                        {row.repositorio || '—'}
                      </dd>
                    </div>
                  </dl>
                </Card>
              ))}
            </div>

            <div className="hidden lg:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Data</TableHeader>
                    <TableHeader>Colaborador</TableHeader>
                    <TableHeader>Etapa</TableHeader>
                    <TableHeader>Repositorio</TableHeader>
                    <TableHeader align="right">Qtd</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleRows.length === 0 ? (
                    <TableEmptyState
                      colSpan={5}
                      title="Nenhum registro"
                      description="Não há registros no período."
                    />
                  ) : (
                    visibleRows.map((row, index) => (
                      <TableRow key={row.id || index}>
                        <TableCell>{row.data}</TableCell>
                        <TableCell>{row.colaborador}</TableCell>
                        <TableCell>{row.etapa}</TableCell>
                        <TableCell className="font-mono text-xs">{row.repositorio}</TableCell>
                        <TableCell align="right" className="font-semibold">
                          {formatCriticalNumber(row.quantidade)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {rows.length > 100 ? (
              <p className="text-center text-xs text-[var(--color-text-tertiary)]">
                Mostrando 100 de {rows.length} registros. Exporte para ver todos.
              </p>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}

export function ExportacoesPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );
  const [exportando, setExportando] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewOperacional, setPreviewOperacional] = useState<OperacionalRow[] | null>(null);

  const dataInicioPadrao = useMemo(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return toDateInputValue(date);
  }, []);
  const dataFimPadrao = useMemo(() => toDateInputValue(new Date()), []);

  const [dataInicio, setDataInicio] = useState(dataInicioPadrao);
  const [dataFim, setDataFim] = useState(dataFimPadrao);
  const [draftDataInicio, setDraftDataInicio] = useState(dataInicioPadrao);
  const [draftDataFim, setDraftDataFim] = useState(dataFimPadrao);
  const ultimoAutoPreviewRef = useRef<string | null>(null);

  const filtrosUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const preview = params.get('preview');

    return {
      dataInicio: params.get('dataInicio') ?? dataInicioPadrao,
      dataFim: params.get('dataFim') ?? dataFimPadrao,
      preview: preview === 'gerencial' || preview === 'operacional' ? preview : '',
    };
  }, [dataFimPadrao, dataInicioPadrao, location.search]);

  useEffect(() => {
    setDataInicio(filtrosUrl.dataInicio);
    setDataFim(filtrosUrl.dataFim);
    setDraftDataInicio(filtrosUrl.dataInicio);
    setDraftDataFim(filtrosUrl.dataFim);
  }, [filtrosUrl.dataFim, filtrosUrl.dataInicio]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (dataInicio) params.set('dataInicio', dataInicio);
    if (dataFim) params.set('dataFim', dataFim);
    if (previewData) params.set('preview', 'gerencial');
    if (previewOperacional) params.set('preview', 'operacional');

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
    dataFim,
    dataInicio,
    location.pathname,
    location.search,
    navigate,
    previewData,
    previewOperacional,
  ]);

  const validarPeriodo = useCallback((): boolean => {
    const inicio = draftDataInicio;
    const fim = draftDataFim;
    if (!inicio || !fim) {
      setMensagem({ tipo: 'error', texto: 'Selecione a data de início e fim.' });
      return false;
    }
    if (new Date(inicio) > new Date(fim)) {
      setMensagem({
        tipo: 'error',
        texto: 'A data de início deve ser anterior à data de fim.',
      });
      return false;
    }
    return true;
  }, [draftDataFim, draftDataInicio]);

  const handleExportar = async (tipo: string, formato: 'pdf' | 'excel') => {
    if (!validarPeriodo()) return;

    const inicio = draftDataInicio;
    const fim = draftDataFim;
    const key = `${tipo}-${formato}`;
    setExportando(key);
    setMensagem(null);
    setDataInicio(inicio);
    setDataFim(fim);

    try {
      const extension = formato === 'pdf' ? 'pdf' : 'xlsx';

      if (tipo === 'operacional') {
        const endpoint = `/api/relatorios/operacional/export?dataInicio=${inicio}&dataFim=${fim}&formato=${formato}`;
        await api.download(
          endpoint,
          `detalhamento_operacional_${inicio}_${fim}.${extension}`
        );
      } else {
        const endpoint = `/api/relatorios?formato=${formato}&dataInicio=${inicio}&dataFim=${fim}`;
        await api.download(endpoint, `relatorio_gerencial_${inicio}_${fim}.${extension}`);
      }

      setMensagem({ tipo: 'success', texto: `Exportação ${formato.toUpperCase()} concluída.` });
    } catch (error) {
      setMensagem({
        tipo: 'error',
        texto: error instanceof Error ? error.message : 'Erro ao exportar relatório',
      });
    } finally {
      setExportando(null);
    }
  };

  const handlePreview = useCallback(
    async (tipo: string) => {
      if (!validarPeriodo()) return;

      const inicio = draftDataInicio;
      const fim = draftDataFim;
      setExportando(`${tipo}-preview`);
      setMensagem(null);
      setDataInicio(inicio);
      setDataFim(fim);

      try {
        if (tipo === 'gerencial') {
          setPreviewOperacional(null);
          const data = await api.get<PreviewData>(
            `/relatorios?formato=json&dataInicio=${inicio}&dataFim=${fim}`
          );
          setPreviewData(data);
        } else {
          setPreviewData(null);
          const data = await api.get<{
            registros: {
              id: string;
              data_producao: string;
              colaborador: string;
              etapa: string;
              funcao: string;
              repositorio: string;
              quantidade: number;
            }[];
          }>(`/relatorios/operacional?dataInicio=${inicio}&dataFim=${fim}`);

          setPreviewOperacional(
            (data.registros ?? []).map((registro) => ({
              id: registro.id,
              data: formatDateBR(registro.data_producao),
              colaborador: registro.colaborador ?? '',
              etapa: registro.etapa ?? '',
              funcao: registro.funcao ?? '',
              repositorio: registro.repositorio ?? '',
              quantidade: Number.isFinite(Number(registro.quantidade))
                ? Number(registro.quantidade)
                : Number.NaN,
            }))
          );
        }
      } catch (error) {
        setMensagem({
          tipo: 'error',
          texto: error instanceof Error ? error.message : 'Erro ao carregar preview',
        });
    } finally {
      setExportando(null);
    }
  },
    [draftDataFim, draftDataInicio, validarPeriodo]
  );

  useEffect(() => {
    if (!filtrosUrl.preview || !dataInicio || !dataFim) {
      ultimoAutoPreviewRef.current = null;
      return;
    }

    if (new Date(dataInicio) > new Date(dataFim)) {
      return;
    }

    const key = [filtrosUrl.preview, dataInicio, dataFim].join('|');
    if (ultimoAutoPreviewRef.current === key) return;

    ultimoAutoPreviewRef.current = key;
    void handlePreview(filtrosUrl.preview);
  }, [dataFim, dataInicio, filtrosUrl.preview, handlePreview]);

  const colorClasses: Record<string, { bg: string; icon: string; border: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-200' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Exportações</h1>
        <p className="mt-1 text-gray-500">Exporte relatórios em PDF e Excel.</p>
      </div>

      {mensagem ? (
        <ActionFeedback
          type={mensagem.tipo}
          title=""
          message={mensagem.texto}
          onDismiss={() => setMensagem(null)}
        />
      ) : null}

      <Card padding="none">
        <div className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
            Período da exportação
          </h2>
          <DateRangePicker
            startDate={draftDataInicio}
            endDate={draftDataFim}
            onStartDateChange={setDraftDataInicio}
            onEndDateChange={setDraftDataFim}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {EXPORTACOES.map((item) => {
          const colors = colorClasses[item.color] ?? colorClasses.blue!;

          return (
            <div
              key={item.id}
              className={`overflow-hidden rounded-xl border ${colors.border} bg-[var(--color-bg-primary)] shadow-sm`}
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 rounded-xl p-3 ${colors.bg}`}>
                    <Icon name={item.icon} className={`h-6 w-6 ${colors.icon}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-gray-900">{item.nome}</h3>
                    <p className="mt-1 text-sm text-gray-500">{item.descricao}</p>
                    <ul className="mt-3 space-y-1">
                      {item.detalhes.map((detail, index) => (
                        <li key={index} className="flex items-start gap-2 text-xs text-gray-600">
                          <Icon
                            name="check"
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${colors.icon}`}
                          />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t bg-gray-50 px-5 py-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button
                  variant="outline"
                  size="sm"
                  icon="eye"
                  onClick={() => void handlePreview(item.id)}
                  loading={exportando === `${item.id}-preview`}
                  disabled={exportando !== null}
                  fullWidth
                >
                  Visualizar
                </Button>

                {item.formatos.includes('pdf') ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="file-text"
                    onClick={() => void handleExportar(item.id, 'pdf')}
                    loading={exportando === `${item.id}-pdf`}
                    disabled={exportando !== null}
                    fullWidth
                  >
                    PDF
                  </Button>
                ) : null}

                {item.formatos.includes('excel') ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="download"
                    onClick={() => void handleExportar(item.id, 'excel')}
                    loading={exportando === `${item.id}-excel`}
                    disabled={exportando !== null}
                    fullWidth
                  >
                    Excel
                  </Button>
                ) : null}

                <span className="text-xs text-gray-400 sm:ml-auto">
                  {item.formatos.map((format) => format.toUpperCase()).join(' / ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {previewData ? (
        <PreviewGerencialModal
          data={previewData}
          onClose={() => setPreviewData(null)}
          onExportPdf={() => {
            setPreviewData(null);
            void handleExportar('gerencial', 'pdf');
          }}
          onExportExcel={() => {
            setPreviewData(null);
            void handleExportar('gerencial', 'excel');
          }}
        />
      ) : null}

      {previewOperacional ? (
        <PreviewOperacionalModal
          rows={previewOperacional}
          onClose={() => setPreviewOperacional(null)}
          onExportExcel={() => {
            setPreviewOperacional(null);
            void handleExportar('operacional', 'excel');
          }}
        />
      ) : null}
    </div>
  );
}
