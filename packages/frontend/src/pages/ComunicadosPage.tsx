import { useMemo, useState } from 'react';
import type { ComunicadoPrioridade, ComunicadoUsuarioItem } from '@recorda/shared';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { PageState } from '../components/ui/PageState';
import { Select } from '../components/ui/Select';
import { useToastHelpers } from '../components/ui/Toast';
import { useComunicadosUsuario, useMarcarComunicadoLido } from '../hooks/useQueries';
import { extractErrorMessage } from '../utils/errors';
import { formatDateTimeBR } from '../utils/date';

type FiltroLeitura = 'todos' | 'nao-lidos' | 'lidos';
type FiltroVisao = 'ativos' | 'historico';
type FiltroPrioridade = 'todas' | ComunicadoPrioridade;
type FiltroOrdenacao = 'mais-recentes' | 'mais-antigos' | 'prioridade';

function getPrioridadeBadge(prioridade: ComunicadoPrioridade): string {
  switch (prioridade) {
    case 'ALTA':
      return 'bg-[var(--color-error-50)] text-[var(--color-error-700)] border-[var(--color-error-200)]';
    case 'MEDIA':
      return 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)] border-[var(--color-warning-200)]';
    default:
      return 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)] border-[var(--color-primary-200)]';
  }
}

function isNaoLido(item: ComunicadoUsuarioItem): boolean {
  return item.destinatario.lidoEm === null;
}

export function ComunicadosPage(): JSX.Element {
  const toast = useToastHelpers();
  const comunicadosQuery = useComunicadosUsuario();
  const marcarComoLido = useMarcarComunicadoLido();
  const [visao, setVisao] = useState<FiltroVisao>('ativos');
  const [filtro, setFiltro] = useState<FiltroLeitura>('todos');
  const [busca, setBusca] = useState('');
  const [prioridade, setPrioridade] = useState<FiltroPrioridade>('todas');
  const [ordenacao, setOrdenacao] = useState<FiltroOrdenacao>('mais-recentes');

  const comunicados = comunicadosQuery.data?.comunicados ?? [];
  const totalNaoLidos =
    comunicadosQuery.data?.totalNaoLidos ?? comunicados.filter((item) => isNaoLido(item)).length;
  const totalLidos = Math.max(comunicados.length - totalNaoLidos, 0);
  const ativos = comunicados.filter((item) => item.status === 'PUBLICADO');
  const historico = comunicados.filter((item) => item.status === 'ENCERRADO');

  const itensFiltrados = useMemo(() => {
    const base = visao === 'historico' ? historico : ativos;
    const termo = busca.trim().toLowerCase();
    const filtrados = base.filter((item) => {
      if (filtro === 'nao-lidos' && !isNaoLido(item)) return false;
      if (filtro === 'lidos' && isNaoLido(item)) return false;
      if (prioridade !== 'todas' && item.prioridade !== prioridade) return false;
      if (!termo) return true;
      return (
        item.titulo.toLowerCase().includes(termo) || item.conteudo.toLowerCase().includes(termo)
      );
    });

    return [...filtrados].sort((a, b) => {
      if (ordenacao === 'mais-antigos') {
        return (
          new Date(a.publicadoEm ?? a.criadoEm).getTime() -
          new Date(b.publicadoEm ?? b.criadoEm).getTime()
        );
      }
      if (ordenacao === 'prioridade') {
        const peso: Record<ComunicadoPrioridade, number> = { ALTA: 3, MEDIA: 2, BAIXA: 1 };
        return peso[b.prioridade] - peso[a.prioridade];
      }
      return (
        new Date(b.publicadoEm ?? b.criadoEm).getTime() -
        new Date(a.publicadoEm ?? a.criadoEm).getTime()
      );
    });
  }, [ativos, busca, filtro, historico, ordenacao, prioridade, visao]);

  const handleMarcarComoLido = async (comunicadoId: string): Promise<void> => {
    try {
      await marcarComoLido.mutateAsync(comunicadoId);
      toast.success('Comunicado marcado como lido');
    } catch (error) {
      toast.error('Erro ao atualizar leitura', extractErrorMessage(error, 'Tente novamente.'));
    }
  };

  return (
    <PageState
      loading={comunicadosQuery.isLoading}
      loadingMessage="Carregando comunicados..."
      error={
        comunicadosQuery.error
          ? {
              message: 'Não foi possível carregar seus comunicados.',
              details: extractErrorMessage(comunicadosQuery.error, 'Tente novamente em instantes.'),
              action: {
                label: 'Atualizar',
                onClick: () => void comunicadosQuery.refetch(),
              },
            }
          : null
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Comunicados"
          subtitle="Consulte os comunicados e registre a leitura."
          actions={
            <Button
              variant="secondary"
              icon="refresh-cw"
              onClick={() => void comunicadosQuery.refetch()}
            >
              Atualizar
            </Button>
          }
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-[var(--color-text-secondary)]">Total recebidos</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-3xl font-bold text-[var(--color-text-primary)]">
                {comunicados.length}
              </p>
              <Icon name="mail" className="h-7 w-7 text-[var(--color-primary-600)]" />
            </div>
          </Card>
          <Card>
            <p className="text-sm text-[var(--color-text-secondary)]">Não lidos</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-3xl font-bold text-[var(--color-text-primary)]">{totalNaoLidos}</p>
              <Icon name="alert-triangle" className="h-7 w-7 text-[var(--color-warning-600)]" />
            </div>
          </Card>
          <Card>
            <p className="text-sm text-[var(--color-text-secondary)]">Lidos</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-3xl font-bold text-[var(--color-text-primary)]">{totalLidos}</p>
              <Icon name="check-circle" className="h-7 w-7 text-[var(--color-success-600)]" />
            </div>
          </Card>
        </div>

        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                  Caixa de entrada
                </h2>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Separe ativos do histórico e filtre as leituras.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={visao === 'ativos' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setVisao('ativos')}
                  >
                    Ativos ({ativos.length})
                  </Button>
                  <Button
                    variant={visao === 'historico' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setVisao('historico')}
                  >
                    Histórico ({historico.length})
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={filtro === 'todos' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setFiltro('todos')}
                  >
                    Todos
                  </Button>
                  <Button
                    variant={filtro === 'nao-lidos' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setFiltro('nao-lidos')}
                  >
                    Não lidos
                  </Button>
                  <Button
                    variant={filtro === 'lidos' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setFiltro('lidos')}
                  >
                    Lidos
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <Input
                label="Buscar"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Título ou conteúdo"
              />
              <Select
                label="Prioridade"
                value={prioridade}
                onChange={(event) => setPrioridade(event.target.value as FiltroPrioridade)}
                options={[
                  { value: 'todas', label: 'Todas' },
                  { value: 'ALTA', label: 'Alta' },
                  { value: 'MEDIA', label: 'Média' },
                  { value: 'BAIXA', label: 'Baixa' },
                ]}
              />
              <Select
                label="Ordenação"
                value={ordenacao}
                onChange={(event) => setOrdenacao(event.target.value as FiltroOrdenacao)}
                options={[
                  { value: 'mais-recentes', label: 'Mais recentes' },
                  { value: 'mais-antigos', label: 'Mais antigos' },
                  { value: 'prioridade', label: 'Prioridade' },
                ]}
              />
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={() => {
                    setBusca('');
                    setPrioridade('todas');
                    setOrdenacao('mais-recentes');
                    setFiltro('todos');
                    setVisao('ativos');
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {itensFiltrados.length === 0 ? (
          <Card className="text-center">
            <Icon name="mail" className="mx-auto h-12 w-12 text-[var(--color-gray-300)]" />
            <h2 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">
              Nenhum comunicado encontrado
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {visao === 'historico'
                ? 'Ainda não existem comunicados encerrados para esta visualização.'
                : 'Ajuste os filtros ou aguarde novos comunicados.'}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {itensFiltrados.map((comunicado) => {
              const naoLido = isNaoLido(comunicado);
              return (
                <Card
                  key={comunicado.id}
                  className={
                    naoLido
                      ? 'border-[var(--color-primary-200)] shadow-sm'
                      : 'border-[var(--color-border-primary)]'
                  }
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                            {comunicado.titulo}
                          </h2>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getPrioridadeBadge(comunicado.prioridade)}`}
                          >
                            {comunicado.prioridade}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              naoLido
                                ? 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)]'
                                : 'bg-[var(--color-success-50)] text-[var(--color-success-700)]'
                            }`}
                          >
                            {naoLido ? 'Não lido' : 'Lido'}
                          </span>
                          <span className="rounded-full bg-[var(--color-gray-100)] px-2.5 py-1 text-xs font-medium text-[var(--color-gray-700)]">
                            {comunicado.status === 'ENCERRADO' ? 'Encerrado' : 'Ativo'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                          Publicado em{' '}
                          {formatDateTimeBR(comunicado.publicadoEm ?? comunicado.criadoEm)}
                        </p>
                      </div>

                      {naoLido ? (
                        <Button
                          variant="primary"
                          size="sm"
                          loading={marcarComoLido.isPending}
                          onClick={() => void handleMarcarComoLido(comunicado.id)}
                        >
                          Marcar como lido
                        </Button>
                      ) : (
                        <div className="text-xs text-[var(--color-text-secondary)]">
                          Lido em {formatDateTimeBR(comunicado.destinatario.lidoEm)}
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-primary)]">
                        {comunicado.conteudo}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-[var(--color-text-secondary)]">
                      <span>
                        Entregue em {formatDateTimeBR(comunicado.destinatario.entregueEm)}
                      </span>
                      {comunicado.encerradoEm ? (
                        <span>Encerrado em {formatDateTimeBR(comunicado.encerradoEm)}</span>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PageState>
  );
}
