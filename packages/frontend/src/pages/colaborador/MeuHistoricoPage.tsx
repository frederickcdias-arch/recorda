import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { PageState } from '../../components/ui/PageState';
import { useAuth } from '../../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

interface ProducaoItem {
  id: string;
  data_producao: string;
  etapa: string;
  quantidade: number;
  id_repositorio_ged: string;
}

export function MeuHistoricoPage(): JSX.Element {
  const { usuario } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['meu-historico'],
    queryFn: () => api.get<{ producoes: ProducaoItem[]; total: number }>('/producao/meu-historico'),
  });

  const producoes = data?.producoes ?? [];
  const totalProducao = producoes.reduce((acc, p) => acc + p.quantidade, 0);

  return (
    <PageState loading={isLoading} loadingMessage="Carregando histórico...">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meu Histórico</h1>
          <p className="text-gray-500 mt-1">
            Acompanhe sua produção - {usuario?.nome}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total de Registros</p>
                  <p className="text-2xl font-bold text-gray-900">{producoes.length}</p>
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
                  <p className="text-2xl font-bold text-gray-900">{totalProducao}</p>
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
                      <p>Nenhuma produção registrada ainda</p>
                      <p className="text-sm mt-2">
                        Comece lançando sua primeira produção em &quot;Lançar Produção&quot;
                      </p>
                    </td>
                  </tr>
                ) : (
                  producoes.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-900">
                        {new Date(p.data_producao).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">{p.id_repositorio_ged}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                          {p.etapa}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-gray-900">
                        {p.quantidade}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </PageState>
  );
}
