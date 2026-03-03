import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ActionFeedback } from '../../components/ui/PageState';
import { api } from '../../services/api';

interface PreviewData {
  titulo: string;
  resumoPorEtapa: { etapaNome: string; totalQuantidade: number; unidade: string }[];
  producaoPorCoordenadoria: { coordenadoriaNome: string; coordenadoriaSigla: string; colaboradores: { colaboradorNome: string; total: number }[]; totalGeral: number }[];
  totais: { totalGeral: number; totalColaboradores: number; totalCoordenadorias: number; totalEtapas: number };
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
      'Resumo geral por etapa (totais e unidades)',
      'Produção por coordenadoria e etapa',
      'Produção individual por colaborador',
      'Glossário das etapas',
    ],
    icon: 'briefcase',
    color: 'blue',
    formatos: ['pdf', 'excel'],
  },
  {
    id: 'operacional',
    nome: 'Detalhamento Operacional',
    descricao: 'Lista detalhada de todos os registros de produção no período.',
    detalhes: [
      'Data, colaborador, etapa, quantidade',
      'Repositório e função de cada registro',
      'Ideal para análise e auditoria',
    ],
    icon: 'clipboard',
    color: 'blue',
    formatos: ['excel'],
  },
];

export function ExportacoesPage(): JSX.Element {
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const [exportando, setExportando] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewOperacional, setPreviewOperacional] = useState<OperacionalRow[] | null>(null);
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0] ?? '';
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split('T')[0] ?? '');

  const validarPeriodo = (): boolean => {
    if (!dataInicio || !dataFim) {
      setMensagem({ tipo: 'error', texto: 'Selecione a data de início e fim.' });
      return false;
    }
    if (new Date(dataInicio) > new Date(dataFim)) {
      setMensagem({ tipo: 'error', texto: 'A data de início deve ser anterior à data de fim.' });
      return false;
    }
    return true;
  };

  const handleExportar = async (tipo: string, formato: 'pdf' | 'excel') => {
    if (!validarPeriodo()) return;
    const key = `${tipo}-${formato}`;
    setExportando(key);
    setMensagem(null);
    try {
      const extension = formato === 'pdf' ? 'pdf' : 'xlsx';

      if (tipo === 'operacional') {
        const endpoint = `/api/relatorios/operacional/export?dataInicio=${dataInicio}&dataFim=${dataFim}&formato=${formato}`;
        await api.download(endpoint, `detalhamento_operacional_${dataInicio}_${dataFim}.${extension}`);
      } else {
        const endpoint = `/api/relatorios?formato=${formato}&dataInicio=${dataInicio}&dataFim=${dataFim}`;
        await api.download(endpoint, `relatorio_gerencial_${dataInicio}_${dataFim}.${extension}`);
      }

      setMensagem({ tipo: 'success', texto: `Exportação ${formato.toUpperCase()} concluída!` });
    } catch (error) {
      setMensagem({
        tipo: 'error',
        texto: error instanceof Error ? error.message : 'Erro ao Exportar Relatório',
      });
    } finally {
      setExportando(null);
    }
  };

  const handlePreview = async (tipo: string) => {
    if (!validarPeriodo()) return;
    setExportando(`${tipo}-preview`);
    setMensagem(null);
    try {
      if (tipo === 'gerencial') {
        const data = await api.get<PreviewData>(`/relatorios?formato=json&dataInicio=${dataInicio}&dataFim=${dataFim}`);
        setPreviewData(data);
      } else {
        const data = await api.get<{ registros: { id: string; data_producao: string; colaborador: string; etapa: string; funcao: string; repositorio: string; quantidade: number }[] }>(`/relatorios/operacional?dataInicio=${dataInicio}&dataFim=${dataFim}`);
        setPreviewOperacional(
          (data.registros ?? []).map((r) => ({
            id: r.id,
            data: r.data_producao ? new Date(r.data_producao).toLocaleDateString('pt-BR') : '',
            colaborador: r.colaborador ?? '',
            etapa: r.etapa ?? '',
            funcao: r.funcao ?? '',
            repositorio: r.repositorio ?? '',
            quantidade: Number(r.quantidade ?? 0),
          }))
        );
      }
    } catch (error) {
      setMensagem({ tipo: 'error', texto: error instanceof Error ? error.message : 'Erro ao carregar preview' });
    } finally {
      setExportando(null);
    }
  };

  const colorClasses: Record<string, { bg: string; icon: string; border: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-200' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Exportações</h1>
        <p className="text-gray-500 mt-1">Exporte Relatórios em PDF e Excel</p>
      </div>

      {mensagem && <ActionFeedback type={mensagem.tipo} title="" message={mensagem.texto} onDismiss={() => setMensagem(null)} />}

      {/* Filtro de período */}
      <Card>
        <div className="p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Período da Exportação</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data Início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="h-9 px-3 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data Fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="h-9 px-3 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Export cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {EXPORTACOES.map((item) => {
          const colors = colorClasses[item.color] ?? colorClasses.blue!;
          return (
            <div key={item.id} className={`bg-white rounded-xl border ${colors.border} shadow-sm overflow-hidden`}>
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`p-3 ${colors.bg} rounded-xl shrink-0`}>
                    <Icon name={item.icon} className={`w-6 h-6 ${colors.icon}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">{item.nome}</h3>
                    <p className="text-sm text-gray-500 mt-1">{item.descricao}</p>
                    <ul className="mt-3 space-y-1">
                      {item.detalhes.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                          <Icon name="check" className={`w-3.5 h-3.5 ${colors.icon} shrink-0 mt-0.5`} />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 bg-gray-50 border-t flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon="eye"
                  onClick={() => void handlePreview(item.id)}
                  loading={exportando === `${item.id}-preview`}
                  disabled={exportando !== null}
                >
                  Visualizar
                </Button>
                {item.formatos.includes('pdf') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="file-text"
                    onClick={() => void handleExportar(item.id, 'pdf')}
                    loading={exportando === `${item.id}-pdf`}
                    disabled={exportando !== null}
                  >
                    PDF
                  </Button>
                )}
                {item.formatos.includes('excel') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="download"
                    onClick={() => void handleExportar(item.id, 'excel')}
                    loading={exportando === `${item.id}-excel`}
                    disabled={exportando !== null}
                  >
                    Excel
                  </Button>
                )}
                <span className="text-xs text-gray-400 ml-auto">
                  {item.formatos.map(f => f.toUpperCase()).join(' / ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {/* Preview modal — gerencial JSON */}
      {previewData ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Preview — Relatório Gerencial</h3>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setPreviewData(null); void handleExportar('gerencial', 'pdf'); }}>Exportar PDF</Button>
                <Button size="sm" variant="secondary" onClick={() => { setPreviewData(null); void handleExportar('gerencial', 'excel'); }}>Exportar Excel</Button>
                <Button size="sm" variant="secondary" onClick={() => setPreviewData(null)}>Fechar</Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {/* Totais */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Total Geral</p>
                  <p className="text-lg font-bold text-gray-900">{previewData.totais.totalGeral.toLocaleString('pt-BR')}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Colaboradores</p>
                  <p className="text-lg font-bold text-gray-900">{previewData.totais.totalColaboradores}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Coordenadorias</p>
                  <p className="text-lg font-bold text-gray-900">{previewData.totais.totalCoordenadorias}</p>
                </div>
              </div>
              {/* Resumo por Etapa */}
              {previewData.resumoPorEtapa.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">Resumo por Etapa</h4>
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Etapa</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Unidade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewData.resumoPorEtapa.map((r) => (
                        <tr key={r.etapaNome} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-700">{r.etapaNome}</td>
                          <td className="px-3 py-2 text-right text-gray-900 font-medium">{r.totalQuantidade.toLocaleString('pt-BR')}</td>
                          <td className="px-3 py-2 text-right text-gray-500 text-xs">{r.unidade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Por Coordenadoria */}
              {previewData.producaoPorCoordenadoria.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">Por Coordenadoria ({previewData.producaoPorCoordenadoria.length})</h4>
                  <div className="space-y-1">
                    {previewData.producaoPorCoordenadoria.map((c) => (
                      <div key={c.coordenadoriaSigla} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm text-gray-700">{c.coordenadoriaNome} ({c.coordenadoriaSigla})</span>
                        <span className="text-sm font-medium text-gray-900">{c.totalGeral.toLocaleString('pt-BR')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Preview modal — operacional data table */}
      {previewOperacional ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Preview — Detalhamento Operacional ({previewOperacional.length} registros)</h3>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setPreviewOperacional(null); void handleExportar('operacional', 'excel'); }}>Exportar Excel</Button>
                <Button size="sm" variant="secondary" onClick={() => setPreviewOperacional(null)}>Fechar</Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {previewOperacional.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">Nenhum registro encontrado no período.</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Data</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Colaborador</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Etapa</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Repositório</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Qtd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewOperacional.slice(0, 100).map((row, idx) => (
                      <tr key={row.id || idx} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-700">{row.data}</td>
                        <td className="px-3 py-1.5 text-gray-700">{row.colaborador}</td>
                        <td className="px-3 py-1.5 text-gray-700">{row.etapa}</td>
                        <td className="px-3 py-1.5 text-gray-700 font-mono text-xs">{row.repositorio}</td>
                        <td className="px-3 py-1.5 text-right text-gray-900 font-medium">{row.quantidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {previewOperacional.length > 100 && (
                <p className="text-xs text-gray-400 mt-2 text-center">Mostrando 100 de {previewOperacional.length} registros. Exporte para ver todos.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
