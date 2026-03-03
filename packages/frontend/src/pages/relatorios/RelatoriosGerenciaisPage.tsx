import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { ActionFeedback } from '../../components/ui/PageState';
import { api } from '../../services/api';
import { useCoordenadorias } from '../../hooks/useQueries';

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
    totalColaboradores: number;
    totalCoordenadorias: number;
    totalEtapas: number;
  };
}

function formatNum(n: number): string {
  return n.toLocaleString('pt-BR');
}

export function RelatoriosGerenciaisPage(): JSX.Element {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [coordenadoriaId, setCoordenadoriaId] = useState('');
  const coordenadoriasQuery = useCoordenadorias();
  const coordenadorias = (coordenadoriasQuery.data ?? []) as Coordenadoria[];
  const carregandoCoordenadorias = coordenadoriasQuery.isLoading;
  const [gerando, setGerando] = useState<'pdf' | 'excel' | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string; detalhes?: string } | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioCompleto | null>(null);
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);

  const validarPeriodo = (): boolean => {
    if (!dataInicio || !dataFim) {
      setMensagem({ 
        tipo: 'error', 
        texto: 'Período Obrigatório',
        detalhes: 'Selecione a data de início e fim para gerar o relatório'
      });
      return false;
    }
    if (new Date(dataInicio) > new Date(dataFim)) {
      setMensagem({ 
        tipo: 'error', 
        texto: 'Período Inválido',
        detalhes: 'A data de início deve ser anterior à data de fim'
      });
      return false;
    }
    return true;
  };

  const handleVisualizar = async (): Promise<void> => {
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
      const msg = error instanceof Error
        ? error.message
        : (error as { error?: string })?.error ?? 'Erro ao carregar relatório';
      setMensagem({ tipo: 'error', texto: 'Erro ao Gerar Relatório', detalhes: msg });
    } finally {
      setCarregandoRelatorio(false);
    }
  };

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
          texto: 'Erro ao Exportar Relatório',
          detalhes: error instanceof Error ? error.message : 'Verifique sua conexão e tente novamente'
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
    coordEtapaRows.sort((a, b) => a.coordenadoria.localeCompare(b.coordenadoria) || ordemEtapa(a.etapa) - ordemEtapa(b.etapa));
  }

  // Montar linhas da tabela "Produção por Colaborador" (agregar por colaborador+função across coordenadorias)
  const colabRows: { colaborador: string; etapa: string; producao: number; unidade: string }[] = [];
  if (relatorio) {
    const colabMap = new Map<string, { colaborador: string; etapa: string; producao: number; unidade: string }>();
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
    colabRows.sort((a, b) => a.colaborador.localeCompare(b.colaborador) || ordemEtapa(a.etapa) - ordemEtapa(b.etapa));
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumo Gerencial de Produção</h2>

        {mensagem && (
          <div className="mb-4">
            <ActionFeedback
              type={mensagem.tipo}
              title={mensagem.texto}
              message={mensagem.detalhes ?? ''}
              onDismiss={() => setMensagem(null)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Data Início</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-full h-9 px-3 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Data Fim</label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full h-9 px-3 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Coordenadoria</label>
            <select
              value={coordenadoriaId}
              onChange={(e) => setCoordenadoriaId(e.target.value)}
              disabled={carregandoCoordenadorias}
              className="w-full h-9 px-2 text-sm border rounded-lg disabled:opacity-50"
            >
              <option value="">{carregandoCoordenadorias ? 'Carregando...' : 'Todas'}</option>
              {coordenadorias.map((c) => (
                <option key={c.id} value={c.id}>{c.sigla} - {c.nome}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3 flex items-end gap-3">
            <Button
              variant="primary"
              icon="search"
              onClick={() => void handleVisualizar()}
              loading={carregandoRelatorio}
              disabled={carregandoRelatorio || gerando !== null}
            >
              Visualizar
            </Button>
            <Button
              variant="primary"
              icon="file-text"
              onClick={() => void handleExportar('pdf')}
              loading={gerando === 'pdf'}
              disabled={gerando !== null || carregandoRelatorio}
              className="bg-blue-700 hover:bg-blue-800"
            >
              PDF
            </Button>
            <Button
              variant="primary"
              icon="table"
              onClick={() => void handleExportar('excel')}
              loading={gerando === 'excel'}
              disabled={gerando !== null || carregandoRelatorio}
              className="bg-blue-500 hover:bg-blue-600"
            >
              Excel
            </Button>
          </div>
        </div>
      </div>

      {/* Dados do Relatório */}
      {relatorio && (
        <>
          {/* Cabeçalho do relatório */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center">
            <h3 className="text-lg font-bold text-blue-900">{relatorio.titulo.toUpperCase()}</h3>
            <p className="text-sm text-blue-700 mt-1">
              Período: {new Date(relatorio.periodo.inicio).toLocaleDateString('pt-BR')} a {new Date(relatorio.periodo.fim).toLocaleDateString('pt-BR')}
              {' | '}Emitido em: {new Date(relatorio.dataGeracao).toLocaleString('pt-BR')}
            </p>
          </div>

          {/* RESUMO GERAL POR ETAPA */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-blue-800 text-white">
              <Icon name="bar-chart" className="w-4 h-4" />
              <h3 className="font-semibold text-sm">RESUMO GERAL POR ETAPA</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-blue-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Etapa</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Unidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {relatorio.resumoPorEtapa.map((etapa) => (
                    <tr key={etapa.etapaId} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-800">{etapa.etapaNome}</td>
                      <td className="px-4 py-2 text-sm text-gray-800 text-right font-medium tabular-nums">{formatNum(etapa.totalQuantidade)}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{etapa.unidade}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-4 py-2 text-sm text-gray-900">TOTAL GERAL</td>
                    <td className="px-4 py-2 text-sm text-gray-900 text-right tabular-nums">{formatNum(relatorio.totais.totalGeral)}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">LANÇAMENTOS</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* POR COORDENADORIA E ETAPA */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-blue-700 text-white">
              <Icon name="building" className="w-4 h-4" />
              <h3 className="font-semibold text-sm">POR COORDENADORIA E ETAPA</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-blue-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Coordenadoria</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Etapa</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {coordEtapaRows.map((row, i) => (
                    <tr key={`${row.coordenadoria}-${row.etapa}-${i}`} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-800 font-medium">{row.coordenadoria}</td>
                      <td className="px-4 py-2 text-sm text-gray-800">{row.etapa}</td>
                      <td className="px-4 py-2 text-sm text-gray-800 text-right tabular-nums">{formatNum(row.total)}</td>
                    </tr>
                  ))}
                  {coordEtapaRows.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-4 text-center text-sm text-gray-400">Sem dados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* PRODUÇÃO POR COLABORADOR */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white">
              <Icon name="users" className="w-4 h-4" />
              <h3 className="font-semibold text-sm">PRODUÇÃO POR COLABORADOR</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-blue-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Colaborador</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Etapa</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase">Produção</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {colabRows.map((row, i) => (
                    <tr key={`${row.colaborador}-${row.etapa}-${i}`} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-800 font-medium">{row.colaborador}</td>
                      <td className="px-4 py-2 text-sm text-gray-800">{row.etapa}</td>
                      <td className="px-4 py-2 text-sm text-gray-800 text-right tabular-nums">{formatNum(row.producao)} {row.unidade}</td>
                    </tr>
                  ))}
                  {colabRows.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-4 text-center text-sm text-gray-400">Sem dados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* GLOSSÁRIO */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-gray-600 text-white">
              <Icon name="book" className="w-4 h-4" />
              <h3 className="font-semibold text-sm">GLOSSÁRIO DAS ETAPAS</h3>
            </div>
            <div className="p-5 space-y-2">
              {relatorio.glossario.map((item) => (
                <p key={item.termo} className="text-sm text-gray-700">
                  <span className="font-semibold text-gray-900">{item.termo}:</span> {item.definicao}
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
          <p className="text-gray-500 text-sm">Selecione o período e clique em <strong>Visualizar</strong> para gerar o relatório.</p>
        </div>
      )}
    </div>
  );
}
