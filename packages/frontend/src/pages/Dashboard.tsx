import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { PageState } from '../components/ui';
import { SkeletonCards } from '../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/Table';
import { useAuth } from '../contexts/AuthContext';
import { useDashboard, type DashboardData } from '../hooks/useQueries';
import { api } from '../services/api';
import { formatDateBR } from '../utils/date';
import { getEtapaProducaoStyle } from '../utils/etapa';
import { formatCriticalNumber, parseFiniteNumber } from '../utils/number';

interface StatCardProps {
  title: string;
  value: string;
  rawValue?: number | null;
  icon: string;
  subtitle?: string;
  tone?: 'primary' | 'success' | 'warning' | 'neutral';
  onClick?: () => void;
  index?: number;
}

interface InsightCardProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon: string;
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
  Imagens: {
    bg: 'bg-[var(--color-primary-50)]',
    text: 'text-[var(--color-primary-700)]',
    icon: 'image',
  },
  Caixas: {
    bg: 'bg-[var(--color-warning-50)]',
    text: 'text-[var(--color-warning-700)]',
    icon: 'box',
  },
  'Não informado': {
    bg: 'bg-[var(--color-gray-100)]',
    text: 'text-[var(--color-text-secondary)]',
    icon: 'help-circle',
  },
};

const statToneClasses: Record<
  NonNullable<StatCardProps['tone']>,
  { surface: string; icon: string; text: string }
> = {
  primary: {
    surface: 'bg-[var(--color-primary-50)]',
    icon: 'text-[var(--color-primary-700)]',
    text: 'text-[var(--color-primary-700)]',
  },
  success: {
    surface: 'bg-[var(--color-success-50)]',
    icon: 'text-[var(--color-success-700)]',
    text: 'text-[var(--color-success-700)]',
  },
  warning: {
    surface: 'bg-[var(--color-warning-50)]',
    icon: 'text-[var(--color-warning-700)]',
    text: 'text-[var(--color-warning-700)]',
  },
  neutral: {
    surface: 'bg-[var(--color-gray-100)]',
    icon: 'text-[var(--color-text-secondary)]',
    text: 'text-[var(--color-text-secondary)]',
  },
};

function useCountUp(target: number, duration = 700): number {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === 0) {
      setCount(0);
      return;
    }

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

function DashboardShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      {children}
    </div>
  );
}

function StatCard({
  title,
  value,
  rawValue,
  icon,
  subtitle,
  tone = 'primary',
  onClick,
  index = 0,
}: StatCardProps): JSX.Element {
  const animated = useCountUp(rawValue ?? 0);
  const displayValue = rawValue != null ? animated.toLocaleString('pt-BR') : value;
  const toneClass = statToneClasses[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 75}ms` }}
      className="animate-fade-in-up [animation-fill-mode:both] w-full text-left"
    >
      <Card padding="sm" hover={!!onClick} className="h-full border-[var(--color-border-primary)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">{title}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
              {displayValue}
            </p>
            {subtitle ? (
              <p className={`mt-2 text-sm ${toneClass.text}`}>{subtitle}</p>
            ) : (
              <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">Atualizado agora</p>
            )}
          </div>
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl ${toneClass.surface} ${toneClass.icon}`}
          >
            <Icon name={icon} className="h-6 w-6" />
          </div>
        </div>
      </Card>
    </button>
  );
}

function InsightCard({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: InsightCardProps): JSX.Element {
  return (
    <Card padding="lg">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-primary-50)] text-[var(--color-primary-700)]">
          <Icon name={icon} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>
          {actionLabel && onAction ? (
            <Button variant="ghost" size="sm" className="mt-3 px-0" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function getTipoCor(tipo: string): { bg: string; text: string; icon: string } {
  const normalizado = Object.keys(tipoCores).find((k) =>
    tipo.toLowerCase().includes(k.toLowerCase())
  );
  return tipoCores[normalizado ?? ''] ?? tipoCores['Não informado']!;
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
      <DashboardShell title="Dashboard" subtitle={`Bem-vindo, ${usuario?.nome ?? ''}`}>
        <SkeletonCards count={4} />
      </DashboardShell>
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
    <DashboardShell
      title="Dashboard"
      subtitle={`Bem-vindo, ${usuario?.nome ?? ''}`}
      actions={
        <Button
          variant="primary"
          icon="plus-circle"
          onClick={() => navigate('/minha-producao/lancar')}
        >
          Lançar produção
        </Button>
      }
    >
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total de registros"
          value={formatCriticalNumber(totalProducoes)}
          rawValue={totalProducoes}
          icon="clipboard"
          tone="primary"
          index={0}
        />
        <StatCard
          title="Quantidade total"
          value={formatCriticalNumber(totalQuantidade)}
          rawValue={totalQuantidade}
          icon="bar-chart"
          tone="success"
          index={1}
        />
        <StatCard
          title="Registros nos últimos 7 dias"
          value={formatCriticalNumber(registrosUltimos7Dias)}
          rawValue={registrosUltimos7Dias}
          icon="calendar"
          subtitle="atividade recente"
          tone="warning"
          index={2}
        />
        <StatCard
          title="Quantidade nos últimos 7 dias"
          value={formatCriticalNumber(quantidadeUltimos7Dias)}
          rawValue={quantidadeUltimos7Dias}
          icon="trending-up"
          subtitle="produção recente"
          tone="neutral"
          index={3}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card padding="lg">
          <CardHeader
            title="Produção por etapa"
            description="Distribuição da sua produção por fase do fluxo operacional."
          />
          {producaoPorEtapa.length === 0 ? (
            <p className="py-4 text-sm text-[var(--color-text-secondary)]">
              Nenhuma produção registrada.
            </p>
          ) : (
            <div className="space-y-4">
              {producaoPorEtapa.map((item) => {
                const cor = getEtapaProducaoStyle(item.etapa);
                return (
                  <div key={item.etapa}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cor.bg} ${cor.text}`}
                        >
                          {item.etapa}
                        </span>
                        <span className="text-xs text-[var(--color-text-tertiary)]">
                          {item.registros.toLocaleString('pt-BR')} registro
                          {item.registros !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {item.quantidade.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-[var(--color-gray-100)]">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${cor.bar}`}
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
        </Card>

        <Card padding="lg">
          <CardHeader
            title="Produção por tipo"
            description="Resumo por classificação principal do que foi lançado."
          />
          {producaoPorTipo.length === 0 ? (
            <p className="py-4 text-sm text-[var(--color-text-secondary)]">
              Nenhum dado disponível para o período.
            </p>
          ) : (
            <div className="space-y-3">
              {producaoPorTipo.map((item) => {
                const cor = getTipoCor(item.tipo);
                return (
                  <div
                    key={item.tipo}
                    className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${cor.bg} ${cor.text}`}
                      >
                        <Icon name={cor.icon} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${cor.text}`}>{item.tipo}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          {item.registros.toLocaleString('pt-BR')} registro
                          {item.registros !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-[var(--color-text-primary)]">
                          {item.quantidade.toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Card padding="none">
          <CardHeader
            title="Histórico recente"
            description="Últimos lançamentos para conferência rápida."
            className="px-5 pt-5"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/minha-producao/historico')}
              >
                Ver histórico completo
              </Button>
            }
          />
          {producoesRecentes.length === 0 ? (
            <div className="p-12 text-center">
              <Icon
                name="inbox"
                className="mx-auto mb-4 h-16 w-16 text-[var(--color-text-tertiary)]"
              />
              <p className="mb-4 text-[var(--color-text-secondary)]">
                Nenhuma produção registrada ainda.
              </p>
              <Button variant="primary" onClick={() => navigate('/minha-producao/lancar')}>
                Lançar primeira produção
              </Button>
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Data</TableHeader>
                  <TableHeader>Repositório</TableHeader>
                  <TableHeader>Coordenadoria</TableHeader>
                  <TableHeader>Etapa</TableHeader>
                  <TableHeader align="right">Quantidade</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {producoesRecentes.length === 0 ? (
                  <TableEmptyState colSpan={5} title="Nenhuma produção registrada ainda" />
                ) : (
                  producoesRecentes.map((p) => {
                    const label = p.etapa_label ?? p.etapa;
                    const coordenadoria =
                      p.coordenadoria_label ?? p.marcadores?.coordenadoria ?? '—';
                    const cor = getEtapaProducaoStyle(label);

                    return (
                      <TableRow key={p.id}>
                        <TableCell>{formatDateBR(p.data_producao)}</TableCell>
                        <TableCell className="font-medium">{p.id_repositorio_ged}</TableCell>
                        <TableCell>{coordenadoria}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${cor.bg} ${cor.text}`}
                          >
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
          )}
        </Card>

        <div className="space-y-6">
          <InsightCard
            title="Lançamento rápido"
            description="Registre sua produção diária sem sair do fluxo principal."
            actionLabel="Abrir lançamento"
            onAction={() => navigate('/minha-producao/lancar')}
            icon="plus-circle"
          />
          <InsightCard
            title="Conferência de histórico"
            description="Revise seus lançamentos anteriores e acompanhe a evolução recente."
            actionLabel="Abrir histórico"
            onAction={() => navigate('/minha-producao/historico')}
            icon="history"
          />
        </div>
      </section>
    </DashboardShell>
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
    <DashboardShell
      title="Dashboard"
      subtitle="Visão consolidada da produção, do fluxo e dos principais sinais operacionais."
    >
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Produção do mês"
          value={formatCriticalNumber(producaoTotal)}
          rawValue={producaoTotal ?? 0}
          icon="bar-chart"
          subtitle={data.stats.producaoTrend !== '0%' ? data.stats.producaoTrend : undefined}
          tone="primary"
          onClick={() => navigate('/producao')}
          index={0}
        />
        <StatCard
          title="Repositórios com produção"
          value={formatCriticalNumber(processosAtivos)}
          rawValue={processosAtivos ?? 0}
          icon="folder"
          subtitle={
            typeof processosNovosHoje === 'number' && processosNovosHoje > 0
              ? `${processosNovosHoje.toLocaleString('pt-BR')} importados hoje`
              : undefined
          }
          tone="success"
          onClick={() => navigate('/producao')}
          index={1}
        />
        <StatCard
          title="Usuários ativos"
          value={formatCriticalNumber(colaboradoresAtivos)}
          rawValue={colaboradoresAtivos ?? 0}
          icon="users"
          tone="warning"
          onClick={() => navigate('/producao')}
          index={2}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card padding="lg">
          <CardHeader
            title="Produção por etapa"
            description="Distribuição consolidada da produção nas fases do fluxo."
          />
          <div className="space-y-4">
            {producaoPorEtapa.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Nenhuma produção registrada no período.
              </p>
            ) : (
              producaoPorEtapa.map((item) => {
                const valor = parseFiniteNumber(item?.valor) ?? 0;
                const percentual = ((valor ?? 0) / maxProducao) * 100;

                return (
                  <button
                    key={item.etapa}
                    type="button"
                    onClick={() => navigate('/producao')}
                    className="w-full text-left"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="text-[var(--color-text-secondary)]">{item.etapa}</span>
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {formatCriticalNumber(valor)}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-[var(--color-gray-100)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-primary-500)] transition-all duration-500"
                        style={{ width: `${Math.max(percentual, 2)}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <Card padding="lg">
          <CardHeader
            title="Status da produção"
            description="Situação atual dos indicadores vindos do recebimento e do fluxo."
          />
          <div className="space-y-3">
            {statusProducao.map((item) => (
              <button
                key={item.status}
                type="button"
                onClick={() => navigate('/producao')}
                className="flex w-full items-center justify-between rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 text-left transition-colors hover:bg-[var(--color-primary-50)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-50)] text-[var(--color-primary-700)]">
                    <Icon name={item.icon} className="h-5 w-5" />
                  </div>
                  <span className="text-[var(--color-text-primary)]">{item.status}</span>
                </div>
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {formatCriticalNumber(item?.valor)}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </section>

      {retrabalhoCQ.length > 0 ? (
        <section>
          <Card padding="lg">
            <CardHeader
              title="Retrabalho em CQ"
              description="Principais motivos e repositórios envolvidos em retrabalho recente."
            />
            <div className="grid gap-3 lg:grid-cols-3">
              {retrabalhoCQ.map((item, i) => (
                <div
                  key={`${item.motivo}-${i}`}
                  className="rounded-2xl border border-[var(--color-primary-100)] bg-[var(--color-primary-50)] p-4"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {item.motivo}
                    </span>
                    <Badge variant="info">{formatCriticalNumber(item?.total)}</Badge>
                  </div>
                  {item.repositorios ? (
                    <p
                      className="truncate text-xs text-[var(--color-text-secondary)]"
                      title={item.repositorios}
                    >
                      {item.repositorios}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      Sem repositórios destacados.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}
    </DashboardShell>
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
      <DashboardShell title="Dashboard" subtitle="Carregando a visão consolidada da operação.">
        <SkeletonCards count={4} />
      </DashboardShell>
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

  if (usuario?.perfil === 'colaborador') {
    return <DashboardColaborador />;
  }

  return <DashboardAdminPage />;
}
