import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { PageState } from '../components/ui';
import { SkeletonCards } from '../components/ui/Skeleton';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useDashboard, type DashboardData } from '../hooks/useQueries';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { getEtapaProducaoStyle } from '../utils/etapa';
import { formatDateBR } from '../utils/date';
import { formatCriticalNumber, parseFiniteNumber } from '../utils/number';

interface StatCardProps {
  title: string;
  value: string;
  rawValue?: number;
  icon: string;
  subtitle?: string;
  onClick?: () => void;
  index?: number;
}

function useCountUp(target: number, duration = 700): number {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * target));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return count;
}

function StatCard({ title, value, rawValue, icon, subtitle, onClick, index = 0 }: StatCardProps): JSX.Element {
  const animated = useCountUp(rawValue ?? 0);
  const displayValue = rawValue !== undefined ? animated.toLocaleString('pt-BR') : value;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 75}ms` }}
      className="animate-fade-in-up [animation-fill-mode:both] bg-white rounded-xl p-6 shadow-sm border border-gray-100 w-full text-left hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.98]"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{displayValue}</p>
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

interface TipoStats {
  tipo: string;
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
  producaoPorTipo?: TipoStats[];
}

const tipoCores: Record<string, { bg: string; text: string; icon: string }> = {
  Imagens: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'image' },
  Caixas: { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'box' },
  'Não informado': { bg: 'bg-gray-50', text: 'text-gray-500', icon: 'help-circle' },
};

function getTipoCor(tipo: string): { bg: string; text: string; icon: string } {
  const normalizado = Object.keys(tipoCores).find((k) =>
    tipo.toLowerCase().includes(k.toLowerCase())
  );
  return tipoCores[normalizado ?? ''] ?? { bg: 'bg-gray-50', text: 'text-gray-600', icon: 'file' };
}

function DashboardColaborador(): JSX.Element {
  const navigate = useNavigate();
  const { usuario } = useAuth();

  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: ['meu-historico'],
    queryFn: () => api.get<MeuHistoricoResponse>('/producao/meu-historico'),
  });

  const producoes = data?.producoes ?? [];
  const producoesRecentes = producoes.slice(0, 10);
  const totalProducoes = parseFiniteNumber(data?.total);
  const totalQuantidade = parseFiniteNumber(data?.totalQuantidade);
  const registrosUltimos7Dias = parseFiniteNumber(data?.registrosUltimos7Dias);
  const quantidadeUltimos7Dias = parseFiniteNumber(data?.quantidadeUltimos7Dias);
  const producaoPorEtapa = data?.producaoPorEtapa ?? [];
  const producaoPorTipo = data?.producaoPorTipo ?? [];
  const maxQuantidadeEtapa = Math.max(...producaoPorEtapa.map((e) => e.quantidade), 1);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Bem-vindo, {usuario?.nome}</p>
        </header>
        <SkeletonCards count={4} />
      </div>
    );
  }

  if (isError) {
    return (
      <PageState
        loading={false}
        error={{
          message: 'Não foi possível carregar os números agora. Tente novamente em instantes.',
          details:
            error instanceof Error
              ? error.message
              : 'Falha ao carregar o dashboard do colaborador.',
          action: {
            label: 'Tentar novamente',
            onClick: () => {
              void refetch();
            },
          },
        }}
      >
        <div />
      </PageState>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total de Registros"
            value={formatCriticalNumber(totalProducoes)}
            rawValue={totalProducoes}
            icon="clipboard"
            index={0}
          />
          <StatCard
            title="Quantidade Total"
            value={formatCriticalNumber(totalQuantidade)}
            rawValue={totalQuantidade}
            icon="bar-chart"
            index={1}
          />
          <StatCard
            title="Registros (7 dias)"
            value={formatCriticalNumber(registrosUltimos7Dias)}
            rawValue={registrosUltimos7Dias}
            icon="calendar"
            subtitle="registros"
            index={2}
          />
          <StatCard
            title="Quantidade (7 dias)"
            value={formatCriticalNumber(quantidadeUltimos7Dias)}
            rawValue={quantidadeUltimos7Dias}
            icon="trending-up"
            subtitle="produzidos"
            index={3}
          />
        </div>
      </section>

      {/* Produção por Etapa + Produção por Tipo */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Produção por Etapa */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">Produção por Etapa</h3>
          {producaoPorEtapa.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">Nenhuma produção registrada</p>
          ) : (
            <div className="space-y-3">
              {producaoPorEtapa.map((item) => {
                const cor = getEtapaProducaoStyle(item.etapa);
                return (
                  <div key={item.etapa} className="group">
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cor.bg} ${cor.text}`}
                        >
                          {item.etapa}
                        </span>
                        <span className="text-gray-400 text-xs">
                          {item.registros.toLocaleString('pt-BR')} registro
                          {item.registros !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className="font-semibold text-gray-900">
                        {item.quantidade.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${cor.bar} rounded-full transition-all duration-700`}
                        style={{
                          width: `${Math.max((item.quantidade / maxQuantidadeEtapa) * 100, 2)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Produção por Tipo (Imagens / Caixas) */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">Por Tipo</h3>
          {producaoPorTipo.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">Nenhum dado</p>
          ) : (
            <div className="space-y-3">
              {producaoPorTipo.map((item) => {
                const cor = getTipoCor(item.tipo);
                return (
                  <div
                    key={item.tipo}
                    className={`p-4 rounded-lg border ${cor.bg} border-opacity-50`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${cor.bg} ${cor.text}`}>
                        <Icon name={cor.icon} className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${cor.text}`}>{item.tipo}</p>
                        <p className="text-xs text-gray-500">
                          {item.registros.toLocaleString('pt-BR')} registro
                          {item.registros !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {item.quantidade.toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
                      Coordenadoria
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
                  {producoesRecentes.map((p) => {
                    const label = p.etapa_label ?? p.etapa;
                    const coordenadoria =
                      p.coordenadoria_label ?? p.marcadores?.coordenadoria ?? '—';
                    const cor = getEtapaProducaoStyle(label);
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {formatDateBR(p.data_producao)}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {p.id_repositorio_ged}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">{coordenadoria}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${cor.bg} ${cor.text}`}>
                            {label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                          {p.quantidade.toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    );
                  })}
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

  const producaoPorEtapa = Array.isArray(data.producaoPorEtapa) ? data.producaoPorEtapa : [];
  const statusProducao = Array.isArray(data.statusRecebimento) ? data.statusRecebimento : [];
  const retrabalhoCQ = Array.isArray(data.retrabalhoCQ) ? data.retrabalhoCQ : [];

  const producaoTotal = parseFiniteNumber(data.stats?.producaoTotal);
  const processosAtivos = parseFiniteNumber(data.stats?.processosAtivos);
  const processosNovosHoje = parseFiniteNumber(data.stats?.processosNovosHoje);
  const colaboradoresAtivos = parseFiniteNumber(data.stats?.colaboradoresAtivos);
  const maxProducao = Math.max(...producaoPorEtapa.map((e) => parseFiniteNumber(e?.valor) ?? 0), 1);

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
            value={formatCriticalNumber(producaoTotal)}
            rawValue={producaoTotal ?? 0}
            icon="bar-chart"
            subtitle={data.stats.producaoTrend !== '0%' ? data.stats.producaoTrend : undefined}
            onClick={() => navigate('/producao')}
            index={0}
          />
          <StatCard
            title="Repositórios com Produção"
            value={formatCriticalNumber(processosAtivos)}
            rawValue={processosAtivos ?? 0}
            icon="folder"
            subtitle={
              typeof processosNovosHoje === 'number' && processosNovosHoje > 0
                ? `${processosNovosHoje.toLocaleString('pt-BR')} importados hoje`
                : undefined
            }
            onClick={() => navigate('/producao')}
            index={1}
          />
          <StatCard
            title="Usuários Ativos"
            value={formatCriticalNumber(colaboradoresAtivos)}
            rawValue={colaboradoresAtivos ?? 0}
            icon="users"
            onClick={() => navigate('/producao')}
            index={2}
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
                const valor = parseFiniteNumber(item?.valor);
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
                        {formatCriticalNumber(valor)}
                      </span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${((valor ?? 0) / maxProducao) * 100}%` }}
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
                  {formatCriticalNumber(item?.valor)}
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
                      {formatCriticalNumber(item?.total)}
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

function DashboardAdminPage(): JSX.Element {
  const { data, isLoading, error, refetch } = useDashboard();

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

export function DashboardPage(): JSX.Element {
  const { usuario } = useAuth();

  // Se o usuário for colaborador, mostrar dashboard personalizado
  if (usuario?.perfil === 'colaborador') {
    return <DashboardColaborador />;
  }

  return <DashboardAdminPage />;
}
