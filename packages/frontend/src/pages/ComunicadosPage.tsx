import { useEffect, useMemo, useState } from 'react';
import type { ComunicadoPrioridade, ComunicadoUsuarioItem } from '@recorda/shared';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { PageState } from '../components/ui/PageState';
import { useToastHelpers } from '../components/ui/Toast';
import { useComunicadosUsuario, useMarcarComunicadoLido } from '../hooks/useQueries';
import { extractErrorMessage } from '../utils/errors';
import { formatDateTimeBR } from '../utils/date';

function isNaoLido(item: ComunicadoUsuarioItem): boolean {
  return item.destinatario.lidoEm === null;
}

function prioridadePeso(prioridade: ComunicadoPrioridade): number {
  switch (prioridade) {
    case 'ALTA':
      return 3;
    case 'MEDIA':
      return 2;
    default:
      return 1;
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

function getDataPublicacao(item: ComunicadoUsuarioItem): number {
  return new Date(item.publicadoEm ?? item.criadoEm).getTime();
}

function ordenarPendentes(a: ComunicadoUsuarioItem, b: ComunicadoUsuarioItem): number {
  if (Number(b.leituraObrigatoria) !== Number(a.leituraObrigatoria)) {
    return Number(b.leituraObrigatoria) - Number(a.leituraObrigatoria);
  }
  if (Number(b.fixado) !== Number(a.fixado)) {
    return Number(b.fixado) - Number(a.fixado);
  }
  if (prioridadePeso(b.prioridade) !== prioridadePeso(a.prioridade)) {
    return prioridadePeso(b.prioridade) - prioridadePeso(a.prioridade);
  }
  return getDataPublicacao(b) - getDataPublicacao(a);
}

function ordenarSecundarios(a: ComunicadoUsuarioItem, b: ComunicadoUsuarioItem): number {
  return getDataPublicacao(b) - getDataPublicacao(a);
}

function resumir(texto: string, limite = 120): string {
  const normalizado = texto.replace(/\s+/g, ' ').trim();
  if (normalizado.length <= limite) return normalizado;
  return `${normalizado.slice(0, limite).trim()}...`;
}

interface ListaCompactaProps {
  itens: ComunicadoUsuarioItem[];
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
  emptyLabel: string;
}

function ListaCompacta({
  itens,
  selecionadoId,
  onSelecionar,
  emptyLabel,
}: ListaCompactaProps): JSX.Element {
  if (itens.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border-primary)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {itens.map((item) => {
        const selecionado = item.id === selecionadoId;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelecionar(item.id)}
            className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
              selecionado
                ? 'border-[var(--color-primary-300)] bg-[var(--color-primary-50)]'
                : 'border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-secondary)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getPrioridadeBadge(item.prioridade)}`}
                  >
                    {getPrioridadeLabel(item.prioridade)}
                  </span>
                  {isNaoLido(item) ? (
                    <span className="rounded-full bg-[var(--color-warning-50)] px-2 py-1 text-xs font-medium text-[var(--color-warning-700)]">
                      Pendente
                    </span>
                  ) : null}
                </div>

                <h3 className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">
                  {item.titulo}
                </h3>
                <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
                  {resumir(item.conteudo)}
                </p>
              </div>

              {isNaoLido(item) ? (
                <span className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-[var(--color-primary-600)]" />
              ) : null}
            </div>

            <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
              {formatDateTimeBR(item.publicadoEm ?? item.criadoEm)}
            </p>
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

  const [caixaAberta, setCaixaAberta] = useState(false);
  const [buscaCaixa, setBuscaCaixa] = useState('');
  const [selecionadoPendenteId, setSelecionadoPendenteId] = useState<string | null>(null);
  const [selecionadoCaixaId, setSelecionadoCaixaId] = useState<string | null>(null);

  const comunicados = comunicadosQuery.data?.comunicados ?? [];
  const ativos = useMemo(
    () => comunicados.filter((item) => item.status === 'PUBLICADO'),
    [comunicados]
  );
  const encerrados = useMemo(
    () => comunicados.filter((item) => item.status === 'ENCERRADO').sort(ordenarSecundarios),
    [comunicados]
  );

  const pendentes = useMemo(
    () => ativos.filter((item) => isNaoLido(item)).sort(ordenarPendentes),
    [ativos]
  );
  const lidos = useMemo(
    () => ativos.filter((item) => !isNaoLido(item)).sort(ordenarSecundarios),
    [ativos]
  );

  const totalNaoLidos =
    comunicadosQuery.data?.totalNaoLidos ?? comunicados.filter((item) => isNaoLido(item)).length;

  const caixaFiltrada = useMemo(() => {
    const termo = buscaCaixa.trim().toLowerCase();
    const base = [...lidos, ...encerrados];
    if (!termo) return base;
    return base.filter(
      (item) =>
        item.titulo.toLowerCase().includes(termo) || item.conteudo.toLowerCase().includes(termo)
    );
  }, [buscaCaixa, encerrados, lidos]);

  const lidosFiltrados = useMemo(
    () => caixaFiltrada.filter((item) => item.status === 'PUBLICADO'),
    [caixaFiltrada]
  );
  const encerradosFiltrados = useMemo(
    () => caixaFiltrada.filter((item) => item.status === 'ENCERRADO'),
    [caixaFiltrada]
  );

  useEffect(() => {
    const proximoId = pendentes[0]?.id ?? null;
    if (!proximoId) {
      setSelecionadoPendenteId(null);
      return;
    }

    const existeSelecionado = selecionadoPendenteId
      ? pendentes.some((item) => item.id === selecionadoPendenteId)
      : false;

    if (!existeSelecionado) {
      setSelecionadoPendenteId(proximoId);
    }
  }, [pendentes, selecionadoPendenteId]);

  useEffect(() => {
    if (!caixaAberta) return;

    const proximoId = caixaFiltrada[0]?.id ?? null;
    if (!proximoId) {
      setSelecionadoCaixaId(null);
      return;
    }

    const existeSelecionado = selecionadoCaixaId
      ? caixaFiltrada.some((item) => item.id === selecionadoCaixaId)
      : false;

    if (!existeSelecionado) {
      setSelecionadoCaixaId(proximoId);
    }
  }, [caixaAberta, caixaFiltrada, selecionadoCaixaId]);

  const comunicadoPrincipal =
    pendentes.find((item) => item.id === selecionadoPendenteId) ?? pendentes[0] ?? null;
  const comunicadoCaixa =
    caixaFiltrada.find((item) => item.id === selecionadoCaixaId) ?? caixaFiltrada[0] ?? null;

  const handleMarcarComoLido = async (comunicadoId: string): Promise<void> => {
    try {
      await marcarComoLido.mutateAsync(comunicadoId);
      toast.success('Comunicado marcado como lido');
    } catch (error) {
      toast.error('Erro ao atualizar leitura', extractErrorMessage(error, 'Tente novamente.'));
    }
  };

  const subtitle =
    totalNaoLidos > 0
      ? `${totalNaoLidos} comunicado(s) aguardando sua leitura.`
      : 'Nenhum comunicado pendente no momento.';

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
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Comunicados"
          subtitle={subtitle}
          actions={
            <div className="flex gap-2">
              <Button
                variant={caixaAberta ? 'secondary' : 'outline'}
                icon={caixaAberta ? 'chevron-up' : 'inbox'}
                onClick={() => setCaixaAberta((current) => !current)}
              >
                {caixaAberta ? 'Ocultar caixa de entrada' : 'Abrir caixa de entrada'}
              </Button>
              <Button
                variant="secondary"
                icon="refresh-cw"
                onClick={() => void comunicadosQuery.refetch()}
              >
                Atualizar
              </Button>
            </div>
          }
        />

        {comunicadoPrincipal ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="overflow-hidden">
              <div className="space-y-5 p-5 md:p-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getPrioridadeBadge(comunicadoPrincipal.prioridade)}`}
                  >
                    {getPrioridadeLabel(comunicadoPrincipal.prioridade)}
                  </span>
                  <span className="rounded-full bg-[var(--color-warning-50)] px-2.5 py-1 text-xs font-medium text-[var(--color-warning-700)]">
                    Pendente
                  </span>
                  {comunicadoPrincipal.leituraObrigatoria ? (
                    <span className="rounded-full bg-[var(--color-error-50)] px-2.5 py-1 text-xs font-medium text-[var(--color-error-700)]">
                      Leitura obrigatória
                    </span>
                  ) : null}
                  {comunicadoPrincipal.fixado ? (
                    <span className="rounded-full bg-[var(--color-primary-50)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary-700)]">
                      Fixado
                    </span>
                  ) : null}
                </div>

                <div className="space-y-3 border-b border-[var(--color-border-primary)] pb-5">
                  <h2 className="max-w-4xl text-2xl font-semibold leading-tight text-[var(--color-text-primary)] md:text-3xl">
                    {comunicadoPrincipal.titulo}
                  </h2>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--color-text-secondary)]">
                    <span>
                      Publicado em{' '}
                      {formatDateTimeBR(
                        comunicadoPrincipal.publicadoEm ?? comunicadoPrincipal.criadoEm
                      )}
                    </span>
                    <span>
                      Entregue em {formatDateTimeBR(comunicadoPrincipal.destinatario.entregueEm)}
                    </span>
                  </div>
                </div>

                <div className="max-w-4xl">
                  <p className="whitespace-pre-wrap text-base leading-8 text-[var(--color-text-primary)]">
                    {comunicadoPrincipal.conteudo}
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    loading={marcarComoLido.isPending}
                    onClick={() => void handleMarcarComoLido(comunicadoPrincipal.id)}
                  >
                    Marcar como lido
                  </Button>
                </div>
              </div>
            </Card>

            <Card>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Outros pendentes
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    Escolha o próximo comunicado que precisa da sua leitura.
                  </p>
                </div>

                <ListaCompacta
                  itens={pendentes}
                  selecionadoId={comunicadoPrincipal.id}
                  onSelecionar={setSelecionadoPendenteId}
                  emptyLabel="Nenhum outro pendente."
                />
              </div>
            </Card>
          </div>
        ) : (
          <Card className="text-center">
            <Icon
              name="check-circle"
              className="mx-auto h-10 w-10 text-[var(--color-success-600)]"
            />
            <h2 className="mt-4 text-xl font-semibold text-[var(--color-text-primary)]">
              Tudo lido por aqui
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
              Não há comunicados pendentes. Os itens já lidos e encerrados ficam guardados na sua
              caixa de entrada.
            </p>
            <div className="mt-5">
              <Button variant="outline" icon="inbox" onClick={() => setCaixaAberta(true)}>
                Abrir caixa de entrada
              </Button>
            </div>
          </Card>
        )}

        {caixaAberta ? (
          <Card className="overflow-hidden">
            <div className="space-y-5 p-5 md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                    Caixa de entrada
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    Lidos recentes e comunicados encerrados ficam aqui, sem competir com os
                    pendentes.
                  </p>
                </div>

                <div className="w-full lg:max-w-sm">
                  <Input
                    label="Buscar na caixa"
                    value={buscaCaixa}
                    onChange={(event) => setBuscaCaixa(event.target.value)}
                    placeholder="Título ou conteúdo"
                  />
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="space-y-5">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                      Lidos recentes
                    </h3>
                    <ListaCompacta
                      itens={lidosFiltrados}
                      selecionadoId={selecionadoCaixaId}
                      onSelecionar={setSelecionadoCaixaId}
                      emptyLabel="Nenhum comunicado lido neste filtro."
                    />
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                      Encerrados
                    </h3>
                    <ListaCompacta
                      itens={encerradosFiltrados}
                      selecionadoId={selecionadoCaixaId}
                      onSelecionar={setSelecionadoCaixaId}
                      emptyLabel="Nenhum comunicado encerrado neste filtro."
                    />
                  </div>
                </div>

                <Card variant="ghost" className="min-h-[320px]">
                  {comunicadoCaixa ? (
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getPrioridadeBadge(comunicadoCaixa.prioridade)}`}
                        >
                          {getPrioridadeLabel(comunicadoCaixa.prioridade)}
                        </span>
                        <span className="rounded-full bg-[var(--color-bg-primary)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                          {comunicadoCaixa.status === 'ENCERRADO' ? 'Encerrado' : 'Lido'}
                        </span>
                      </div>

                      <div className="space-y-3 border-b border-[var(--color-border-primary)] pb-4">
                        <h3 className="text-xl font-semibold text-[var(--color-text-primary)]">
                          {comunicadoCaixa.titulo}
                        </h3>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--color-text-secondary)]">
                          <span>
                            Publicado em{' '}
                            {formatDateTimeBR(
                              comunicadoCaixa.publicadoEm ?? comunicadoCaixa.criadoEm
                            )}
                          </span>
                          {comunicadoCaixa.destinatario.lidoEm ? (
                            <span>
                              Lido em {formatDateTimeBR(comunicadoCaixa.destinatario.lidoEm)}
                            </span>
                          ) : null}
                          {comunicadoCaixa.encerradoEm ? (
                            <span>
                              Encerrado em {formatDateTimeBR(comunicadoCaixa.encerradoEm)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--color-text-primary)]">
                        {comunicadoCaixa.conteudo}
                      </p>
                    </div>
                  ) : (
                    <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
                      <Icon name="inbox" className="h-8 w-8 text-[var(--color-gray-300)]" />
                      <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                        Selecione um comunicado para revisar o conteúdo.
                      </p>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </PageState>
  );
}
