import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { PageState } from '../components/ui';
import { SkeletonCards } from '../components/ui/Skeleton';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useDashboard, type DashboardData } from '../hooks/useQueries';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

interface StatCardProps {
  title: string;
  value: string;
  icon: string;
  subtitle?: string;
  onClick?: () => void;
}

function StatCard({ title, value, icon, subtitle, onClick }: StatCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 w-full text-left hover:border-blue-200 hover:shadow-md transition"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle ? <p className="text-sm mt-2 text-blue-600">{subtitle}</p> : null}
        </div>
        <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
          <Icon name={icon} className="w-6 h-6" />
        </div>
      </div>
    </button>
  );
}

interface ProducaoItem {
  id: string;
  data_producao: string;
  etapa: string;
  quantidade: number;
  id_repositorio_ged: string;
}

function DashboardColaborador(): JSX.Element {
  const navigate = useNavigate();
  const { usuario } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['meu-historico'],
    queryFn: () => api.get<{ producoes: ProducaoItem[]; total: number; totalQuantidade?: number; registrosUltimos7Dias?: number }>('/producao/meu-historico'),
  });

  const producoes = data?.producoes ?? [];
  const producoesRecentes = producoes.slice(0, 10);
  const totalProducoes = data?.total ?? producoes.length;
  const totalQuantidade = data?.totalQuantidade ?? producoes.reduce((acc, p) => acc + p.quantidade, 0);
  const producoesUltimos7Dias = data?.registrosUltimos7Dias ?? producoes.filter(
    (p) => new Date(p.data_producao) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ).length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Bem-vindo, {usuario?.nome}</p>
        </header>
        <SkeletonCards count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Bem-vindo, {usuario?.nome}</p>
      </header>

      {/* Estatísticas Pessoais */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Minhas Estatísticas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="Total de Registros"
            value={totalProducoes.toLocaleString('pt-BR')}
            icon="clipboard"
          />
          <StatCard
            title="Quantidade Total"
            value={totalQuantidade.toLocaleString('pt-BR')}
            icon="bar-chart"
          />
          <StatCard
            title="Últimos 7 Dias"
            value={producoesUltimos7Dias.toLocaleString('pt-BR')}
            icon="calendar"
            subtitle="registros"
          />
        </div>
      </section>

      {/* Ação Rápida */}
      <section>
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Lançar Nova Produção</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Registre sua produção do dia de forma rápida
                </p>
              </div>
              <Button variant="primary" onClick={() => navigate('/minha-producao/lancar')}>
                <Icon name="plus-circle" className="w-4 h-4 mr-2" />
                Lançar Agora
              </Button>
            </div>
          </div>
        </Card>
      </section>

      {/* Histórico Recente */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Histórico Recente</h2>
          <button
            onClick={() => navigate('/minha-producao/historico')}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Ver tudo →
          </button>
        </div>

        <Card>
          {producoesRecentes.length === 0 ? (
            <div className="p-12 text-center">
              <Icon name="inbox" className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 mb-4">Nenhuma produção registrada ainda</p>
              <Button variant="primary" onClick={() => navigate('/minha-producao/lancar')}>
                Lançar Primeira Produção
              </Button>
            </div>
          ) : (
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
                  {producoesRecentes.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {new Date(p.data_producao).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {p.id_repositorio_ged}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                          {p.etapa}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                        {p.quantidade}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function DashboardContent({ data }: { data: DashboardData }): JSX.Element {
  const navigate = useNavigate();
  const toSafeNumber = (value: unknown): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const producaoPorEtapa = Array.isArray(data.producaoPorEtapa) ? data.producaoPorEtapa : [];
  const statusProducao = Array.isArray(data.statusRecebimento) ? data.statusRecebimento : [];
  const retrabalhoCQ = Array.isArray(data.retrabalhoCQ) ? data.retrabalhoCQ : [];

  const producaoTotal = toSafeNumber(data.stats?.producaoTotal);
  const processosAtivos = toSafeNumber(data.stats?.processosAtivos);
  const processosNovosHoje = toSafeNumber(data.stats?.processosNovosHoje);
  const colaboradoresAtivos = toSafeNumber(data.stats?.colaboradoresAtivos);
  const maxProducao = Math.max(...producaoPorEtapa.map((e) => toSafeNumber(e?.valor)), 1);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      </header>
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Visão Geral</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="Produção do Mês"
            value={producaoTotal.toLocaleString('pt-BR')}
            icon="bar-chart"
            subtitle={data.stats.producaoTrend !== '0%' ? data.stats.producaoTrend : undefined}
            onClick={() => navigate('/producao')}
          />
          <StatCard
            title="Repositórios Ativos"
            value={processosAtivos.toLocaleString('pt-BR')}
            icon="folder"
            subtitle={
              processosNovosHoje > 0
                ? `${processosNovosHoje.toLocaleString('pt-BR')} importados hoje`
                : undefined
            }
            onClick={() => navigate('/producao')}
          />
          <StatCard
            title="Usuários Ativos"
            value={colaboradoresAtivos.toLocaleString('pt-BR')}
            icon="users"
            onClick={() => navigate('/producao')}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">Produção por Etapa</h3>
          <div className="space-y-4">
            {producaoPorEtapa.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhuma produção registrada no período</p>
            ) : (
              producaoPorEtapa.map((item) => {
                const valor = toSafeNumber(item?.valor);
                return (
                  <button
                    key={item.etapa}
                    type="button"
                    onClick={() => navigate('/producao')}
                    className="w-full text-left"
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{item.etapa}</span>
                      <span className="font-medium text-gray-900">
                        {valor.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${(valor / maxProducao) * 100}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">Status da Produção</h3>
          <div className="space-y-3">
            {statusProducao.map((item) => (
              <button
                key={item.status}
                type="button"
                onClick={() => navigate('/producao')}
                className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg text-left hover:bg-blue-50 transition"
              >
                <div className="flex items-center gap-3">
                  <Icon name={item.icon} className="w-5 h-5 text-blue-600" />
                  <span className="text-gray-700">{item.status}</span>
                </div>
                <span className="font-semibold text-gray-900">
                  {toSafeNumber(item?.valor).toLocaleString('pt-BR')}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {retrabalhoCQ.length > 0 ? (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-4">Retrabalho CQ</h3>
            <div className="space-y-3">
              {retrabalhoCQ.map((item, i) => (
                <div key={i} className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800">{item.motivo}</span>
                    <span className="text-sm font-bold text-blue-700">
                      {toSafeNumber(item?.total).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {item.repositorios ? (
                    <p className="text-xs text-gray-500 truncate" title={item.repositorios}>
                      {item.repositorios}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function DashboardPage(): JSX.Element {
  const { usuario } = useAuth();
  const { data, isLoading, error, refetch } = useDashboard();

  // Se o usuário for colaborador, mostrar dashboard personalizado
  if (usuario?.perfil === 'colaborador') {
    return <DashboardColaborador />;
  }

  const errorObj = error
    ? {
        message: 'Não foi possível carregar os dados do dashboard',
        details:
          error instanceof Error
            ? error.message
            : ((error as { error?: string })?.error ?? 'Verifique sua conexão'),
        action: { label: 'Tentar novamente', onClick: () => void refetch() },
      }
    : null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        </header>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Visão Geral</h2>
          <SkeletonCards count={4} />
        </div>
      </div>
    );
  }

  return (
    <PageState loading={false} error={errorObj}>
      {data ? <DashboardContent data={data} /> : null}
    </PageState>
  );
}
