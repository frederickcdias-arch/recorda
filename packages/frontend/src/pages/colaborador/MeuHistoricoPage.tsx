import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { PageState } from '../../components/ui/PageState';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

interface ProducaoItem {
  id: string;
  data_producao: string;
  etapa: string;
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
  pagina: number;
  totalPaginas: number;
}

const etapaCores: Record<string, { bg: string; text: string }> = {
  'Recebimento': { bg: 'bg-purple-50', text: 'text-purple-700' },
  'Preparação': { bg: 'bg-amber-50', text: 'text-amber-700' },
  'Preparacao': { bg: 'bg-amber-50', text: 'text-amber-700' },
  'Digitalização': { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  'Digitalizacao': { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  'Conferência': { bg: 'bg-green-50', text: 'text-green-700' },
  'Conferencia': { bg: 'bg-green-50', text: 'text-green-700' },
  'Montagem': { bg: 'bg-orange-50', text: 'text-orange-700' },
  'Reconferência': { bg: 'bg-rose-50', text: 'text-rose-700' },
  'Reconferencia': { bg: 'bg-rose-50', text: 'text-rose-700' },
  'Entrega': { bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

function getEtapaCor(etapa: string): { bg: string; text: string } {
  const found = Object.keys(etapaCores).find((k) =>
    etapa.toLowerCase().includes(k.toLowerCase())
  );
  return etapaCores[found ?? ''] ?? { bg: 'bg-blue-50', text: 'text-blue-700' };
}

export function MeuHistoricoPage(): JSX.Element {
  const { usuario } = useAuth();
  const [pagina, setPagina] = useState(1);
  const [etapaFiltro, setEtapaFiltro] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const limite = 50;

  const queryParams = new URLSearchParams();
  queryParams.set('limite', String(limite));
  queryParams.set('pagina', String(pagina));
  if (etapaFiltro) queryParams.set('etapa', etapaFiltro);
  if (dataInicio) queryParams.set('dataInicio', dataInicio);
  if (dataFim) queryParams.set('dataFim', dataFim);

  const { data, isLoading } = useQuery({
    queryKey: ['meu-historico', pagina, etapaFiltro, dataInicio, dataFim],
    queryFn: () => api.get<MeuHistoricoResponse>(`/producao/meu-historico?${queryParams.toString()}`),
  });

  const producoes = data?.producoes ?? [];
  const total = data?.total ?? 0;
  const totalQuantidade = data?.totalQuantidade ?? 0;
  const totalPaginas = data?.totalPaginas ?? 1;
  const producaoPorEtapa = data?.producaoPorEtapa ?? [];

  const etapasDisponiveis = producaoPorEtapa.map((e) => e.etapa);

  const handleLimparFiltros = (): void => {
    setEtapaFiltro('');
    setDataInicio('');
    setDataFim('');
    setPagina(1);
  };

  const temFiltros = etapaFiltro || dataInicio || dataFim;

  return (
    <PageState loading={isLoading} loadingMessage="Carregando histórico...">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meu Histórico</h1>
          <p className="text-gray-500 mt-1">
            Acompanhe sua produção - {usuario?.nome}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total de Registros</p>
                  <p className="text-2xl font-bold text-gray-900">{total.toLocaleString('pt-BR')}</p>
                </div>
                <Icon name="clipboard" className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Quantidade Total</p>
                  <p className="text-2xl font-bold text-gray-900">{totalQuantidade.toLocaleString('pt-BR')}</p>
                </div>
                <Icon name="bar-chart" className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Último Registro</p>
                  <p className="text-lg font-bold text-gray-900">
                    {producoes[0]?.data_producao
                      ? new Date(producoes[0].data_producao).toLocaleDateString('pt-BR')
                      : '-'}
                  </p>
                </div>
                <Icon name="calendar" className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Filtros */}
        <Card>
          <div className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Data Início</label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => { setDataInicio(e.target.value); setPagina(1); }}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Data Fim</label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => { setDataFim(e.target.value); setPagina(1); }}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Etapa</label>
                <select
                  value={etapaFiltro}
                  onChange={(e) => { setEtapaFiltro(e.target.value); setPagina(1); }}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todas</option>
                  {etapasDisponiveis.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              {temFiltros ? (
                <Button variant="ghost" onClick={handleLimparFiltros}>
                  <Icon name="x" className="w-4 h-4 mr-1" />
                  Limpar
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        {/* Tabela */}
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Data
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Repositório
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Etapa
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Quantidade
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {producoes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                      <Icon name="inbox" className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>Nenhuma produção encontrada</p>
                      {temFiltros ? (
                        <p className="text-sm mt-2">Tente ajustar os filtros</p>
                      ) : (
                        <p className="text-sm mt-2">
                          Comece lançando sua primeira produção em &quot;Lançar Produção&quot;
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  producoes.map((p) => {
                    const cor = getEtapaCor(p.etapa);
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-gray-900">
                          {new Date(p.data_producao).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">{p.id_repositorio_ged}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${cor.bg} ${cor.text}`}>
                            {p.etapa}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-gray-900">
                          {p.quantidade.toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPaginas > 1 ? (
            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
              <p className="text-sm text-gray-500">
                Mostrando {((pagina - 1) * limite) + 1}-{Math.min(pagina * limite, total)} de{' '}
                <span className="font-medium">{total.toLocaleString('pt-BR')}</span> registros
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
                <span className="flex items-center text-sm text-gray-600 px-2">
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
        </Card>
      </div>
    </PageState>
  );
}
