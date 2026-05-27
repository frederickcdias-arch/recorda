import { useEffect, useMemo, useState } from 'react';
import { useDebounce } from '../hooks/useDebounce';
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
      return 'border-[var(--color-error-200)] bg-[var(--color-error-50)] text-[var(--color-error-700)]';
    case 'MEDIA':
      return 'border-[var(--color-warning-200)] bg-[var(--color-warning-50)] text-[var(--color-warning-700)]';
    default:
      return 'border-[var(--color-primary-200)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)]';
  }
}

function getPrioridadeLabel(prioridade: ComunicadoPrioridade): string {
  switch (prioridade) {
    case 'ALTA':
      return 'Alta';
    case 'MEDIA':
      return 'Média';
    default:
      return 'Baixa';
  }
}

function isNaoLido(item: ComunicadoUsuarioItem): boolean {
  return item.destinatario.lidoEm === null;
}

function getTimestamp(item: ComunicadoUsuarioItem): number {
  return new Date(item.publicadoEm ?? item.criadoEm).getTime();
}

function getResumoConteudo(item: ComunicadoUsuarioItem): string {
  const texto = item.conteudo.replace(/\s+/g, ' ').trim();
  if (texto.length <= 140) return texto;
  return `${texto.slice(0, 140).trim()}...`;
}

interface ListaComunicadosProps {
  itens: ComunicadoUsuarioItem[];
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
}

function ListaComunicados({
  itens,
  selecionadoId,
  onSelecionar,
}: ListaComunicadosProps): JSX.Element {
  return (
    <div className="space-y-3">
      {itens.map((comunicado) => {
        const naoLido = isNaoLido(comunicado);
        const selecionado = comunicado.id === selecionadoId;

        return (
          <button
            key={comunicado.id}
            type="button"
            onClick={() => onSelecionar(comunicado.id)}
            className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${
              selecionado
                ? 'border-[var(--color-primary-300)] bg-[var(--color-primary-50)] shadow-sm'
                : 'border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:border-[var(--color-border-secondary)] hover:bg-[var(--color-bg-secondary)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getPrioridadeBadge(comunicado.prioridade)}`}
                  >
                    {getPrioridadeLabel(comunicado.prioridade)}
                  </span>
                  {naoLido ? (
                    <span className="rounded-full bg-[var(--color-warning-50)] px-2.5 py-1 text-xs font-medium text-[var(--color-warning-700)]">
                      Pendente
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">
                  {comunicado.titulo}
                </h3>
              </div>
              {naoLido ? (
                <span className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-[var(--color-primary-600)]" />
              ) : null}
            </div>

            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              {getResumoConteudo(comunicado)}
            </p>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-tertiary)]">
              <span>{formatDateTimeBR(comunicado.publicadoEm ?? comunicado.criadoEm)}</span>
              {naoLido ? (
                <span>Entregue em {formatDateTimeBR(comunicado.destinatario.entregueEm)}</span>
              ) : (
                <span>Lido em {formatDateTimeBR(comunicado.destinatario.lidoEm)}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function ComunicadosPage(): JSX.Element {
  const toast = useToastHelpers();
  const comunicadosQuery = useComunicadosUsuario();
  const marcarComoLido = useMarcarComunicadoLido();
  const [visao, setVisao] = useState<FiltroVisao>('ativos');
  const [filtro, setFiltro] = useState<FiltroLeitura>('todos');
  const [busca, setBusca] = useState('');
  const debouncedBusca = useDebounce(busca, 600);
  const [prioridade, setPrioridade] = useState<FiltroPrioridade>('todas');
  const [ordenacao, setOrdenacao] = useState<FiltroOrdenacao>('mais-recentes');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const comunicados = comunicadosQuery.data?.comunicados ?? [];
  const ativos = comunicados.filter((item) => item.status === 'PUBLICADO');
  const historico = comunicados.filter((item) => item.status === 'ENCERRADO');
  const totalNaoLidos =
    comunicadosQuery.data?.totalNaoLidos ?? comunicados.filter((item) => isNaoLido(item)).length;
  const totalLidos = Math.max(ativos.length - totalNaoLidos, 0);

  const itensFiltrados = useMemo(() => {
    const base = visao === 'historico' ? historico : ativos;
    const termo = debouncedBusca.trim().toLowerCase();
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
        return getTimestamp(a) - getTimestamp(b);
      }
      if (ordenacao === 'prioridade') {
        const peso: Record<ComunicadoPrioridade, number> = { ALTA: 3, MEDIA: 2, BAIXA: 1 };
        if (peso[b.prioridade] !== peso[a.prioridade]) {
          return peso[b.prioridade] - peso[a.prioridade];
        }
      }
      return getTimestamp(b) - getTimestamp(a);
    });
  }, [ativos, debouncedBusca, filtro, historico, ordenacao, prioridade, visao]);

  const itensPendentes = useMemo(
    () => itensFiltrados.filter((item) => isNaoLido(item)),
    [itensFiltrados]
  );
  const itensRecentes = useMemo(
    () => itensFiltrados.filter((item) => !isNaoLido(item)),
    [itensFiltrados]
  );

  useEffect(() => {
    if (itensFiltrados.length === 0) {
      setSelecionadoId(null);
      return;
    }

    const existeSelecionado = selecionadoId
      ? itensFiltrados.some((item) => item.id === selecionadoId)
      : false;

    if (existeSelecionado) return;

    setSelecionadoId(itensPendentes[0]?.id ?? itensFiltrados[0]?.id ?? null);
  }, [itensFiltrados, itensPendentes, selecionadoId]);

  const comunicadoSelecionado =
    itensFiltrados.find((item) => item.id === selecionadoId) ??
    itensPendentes[0] ??
    itensFiltrados[0] ??
    null;

  const handleMarcarComoLido = async (comunicadoId: string): Promise<void> => {
    try {
      await marcarComoLido.mutateAsync(comunicadoId);
      toast.success('Comunicado marcado como lido');
    } catch (error) {
      toast.error('Erro ao atualizar leitura', extractErrorMessage(error, 'Tente novamente.'));
    }
  };

  const textoResumo =
    totalNaoLidos > 0
      ? `${totalNaoLidos} comunicado(s) aguardando sua leitura.`
      : 'Sua caixa de entrada está em dia.';

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
          subtitle={textoResumo}
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
          <Card className="overflow-hidden">
            <div className="space-y-5 p-5 md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={visao === 'ativos' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setVisao('ativos')}
                    >
                      Caixa de entrada
                    </Button>
                    <Button
                      variant={visao === 'historico' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setVisao('historico')}
                    >
                      Histórico
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-4 py-3">
                      <p className="text-xs font-medium text-[var(--color-text-tertiary)]">
                        Pendentes
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">
                        {totalNaoLidos}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-4 py-3">
                      <p className="text-xs font-medium text-[var(--color-text-tertiary)]">Lidos</p>
                      <p className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">
                        {totalLidos}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-4 py-3">
                      <p className="text-xs font-medium text-[var(--color-text-tertiary)]">
                        Encerrados
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">
                        {historico.length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-xl">
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
                    label="Leitura"
                    value={filtro}
                    onChange={(event) => setFiltro(event.target.value as FiltroLeitura)}
                    options={[
                      { value: 'todos', label: 'Todos' },
                      { value: 'nao-lidos', label: 'Pendentes' },
                      { value: 'lidos', label: 'Lidos' },
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
                </div>
              </div>

              {itensFiltrados.length === 0 ? (
                <Card className="border-dashed text-center">
                  <Icon name="mail" className="mx-auto h-8 w-8 text-[var(--color-gray-300)]" />
                  <h2 className="mt-3 text-base font-semibold text-[var(--color-text-primary)]">
                    Nenhum comunicado encontrado
                  </h2>
                  <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                    {visao === 'historico'
                      ? 'Ainda não existem comunicados encerrados para esta visualização.'
                      : 'Ajuste os filtros ou aguarde novos comunicados.'}
                  </p>
                </Card>
              ) : comunicadoSelecionado ? (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_320px]">
                  <div className="rounded-3xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-4 border-b border-[var(--color-border-primary)] pb-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getPrioridadeBadge(comunicadoSelecionado.prioridade)}`}
                        >
                          {getPrioridadeLabel(comunicadoSelecionado.prioridade)}
                        </span>
                        {isNaoLido(comunicadoSelecionado) ? (
                          <span className="rounded-full bg-[var(--color-warning-50)] px-2.5 py-1 text-xs font-medium text-[var(--color-warning-700)]">
                            Precisa da sua leitura
                          </span>
                        ) : (
                          <span className="rounded-full bg-[var(--color-success-50)] px-2.5 py-1 text-xs font-medium text-[var(--color-success-700)]">
                            Lido
                          </span>
                        )}
                        {comunicadoSelecionado.leituraObrigatoria ? (
                          <span className="rounded-full bg-[var(--color-error-50)] px-2.5 py-1 text-xs font-medium text-[var(--color-error-700)]">
                            Leitura obrigatória
                          </span>
                        ) : null}
                        {comunicadoSelecionado.fixado ? (
                          <span className="rounded-full bg-[var(--color-primary-50)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary-700)]">
                            Fixado
                          </span>
                        ) : null}
                      </div>

                      <div className="space-y-3">
                        <h2 className="text-2xl font-semibold leading-tight text-[var(--color-text-primary)]">
                          {comunicadoSelecionado.titulo}
                        </h2>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--color-text-secondary)]">
                          <span>
                            Publicado em{' '}
                            {formatDateTimeBR(
                              comunicadoSelecionado.publicadoEm ?? comunicadoSelecionado.criadoEm
                            )}
                          </span>
                          <span>
                            Entregue em{' '}
                            {formatDateTimeBR(comunicadoSelecionado.destinatario.entregueEm)}
                          </span>
                          {comunicadoSelecionado.destinatario.lidoEm ? (
                            <span>
                              Lido em {formatDateTimeBR(comunicadoSelecionado.destinatario.lidoEm)}
                            </span>
                          ) : null}
                          {comunicadoSelecionado.encerradoEm ? (
                            <span>
                              Encerrado em {formatDateTimeBR(comunicadoSelecionado.encerradoEm)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="pt-5">
                      <p className="whitespace-pre-wrap text-base leading-8 text-[var(--color-text-primary)]">
                        {comunicadoSelecionado.conteudo}
                      </p>
                    </div>

                    {isNaoLido(comunicadoSelecionado) ? (
                      <div className="mt-6 flex justify-end">
                        <Button
                          variant="primary"
                          loading={marcarComoLido.isPending}
                          onClick={() => void handleMarcarComoLido(comunicadoSelecionado.id)}
                        >
                          Marcar como lido
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-3xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {visao === 'historico' ? 'Itens encerrados' : 'Pendentes primeiro'}
                          </h3>
                          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                            {visao === 'historico'
                              ? `${itensFiltrados.length} comunicado(s) no histórico filtrado.`
                              : `${itensPendentes.length} pendente(s) e ${itensRecentes.length} recente(s).`}
                          </p>
                        </div>
                        {visao === 'ativos' && itensPendentes.length > 0 ? (
                          <span className="rounded-full bg-[var(--color-warning-50)] px-2.5 py-1 text-xs font-medium text-[var(--color-warning-700)]">
                            {itensPendentes.length} pendente(s)
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {visao === 'ativos' && itensPendentes.length > 0 ? (
                      <div>
                        <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                          Precisa da sua leitura
                        </h3>
                        <ListaComunicados
                          itens={itensPendentes}
                          selecionadoId={comunicadoSelecionado.id}
                          onSelecionar={setSelecionadoId}
                        />
                      </div>
                    ) : null}

                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                        {visao === 'historico'
                          ? 'Histórico'
                          : itensPendentes.length > 0
                            ? 'Recentes'
                            : 'Caixa de entrada'}
                      </h3>
                      <ListaComunicados
                        itens={visao === 'historico' ? itensFiltrados : itensRecentes}
                        selecionadoId={comunicadoSelecionado.id}
                        onSelecionar={setSelecionadoId}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </PageState>
  );
}
