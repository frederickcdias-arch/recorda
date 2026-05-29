import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { useDebounce } from '../../hooks/useDebounce';
import {
  usePainelEtapa,
  type PainelEtapaItem,
  type PainelDivergencia,
} from '../../hooks/useQueries';
import { getOperacaoEtapaConfig, isOperacaoEtapaSlug } from '../../config/operacao-etapas';
import { OperacaoEtapasNav } from './EtapaOperacionalPage';

const PAINEL_SLUGS = ['preparacao', 'digitalizacao', 'conferencia', 'reconferencia'] as const;
type PainelSlug = (typeof PAINEL_SLUGS)[number];

function isPainelSlug(slug: string): slug is PainelSlug {
  return (PAINEL_SLUGS as readonly string[]).includes(slug);
}

function OrigemBadge({ origem }: { origem: PainelEtapaItem['origem'] }): JSX.Element {
  if (!origem) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]">
        —
      </span>
    );
  }
  if (origem === 'LEGADA') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
        Produção legada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
      Produção lançada
    </span>
  );
}

function StatusEtapaBadge({ status }: { status: PainelEtapaItem['statusEtapa'] }): JSX.Element {
  if (status === 'PENDENTE') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
        Pendente
      </span>
    );
  }
  if (status === 'DIVERGENTE') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
        Divergência
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--color-primary-100)] text-[var(--color-primary-700)]">
      Concluído
    </span>
  );
}

function DivergenciasBadge({
  divergencias,
}: {
  divergencias: PainelDivergencia[];
}): JSX.Element | null {
  if (!divergencias.length) return null;
  return (
    <span
      title={divergencias.map((d) => d.mensagem).join('\n')}
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 cursor-help"
    >
      {divergencias.length} atenção
    </span>
  );
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

export function PainelEtapaPage(): JSX.Element {
  const { pathname } = useLocation();
  // As rotas são estáticas (sem :etapa), então derivamos o slug do último segmento do pathname.
  // Ex: /operacao/preparacao → 'preparacao'
  const etapaSlug = pathname.split('/').filter(Boolean).pop() ?? '';

  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [origem, setOrigem] = useState<'LANCADA' | 'LEGADA' | ''>('');
  const [statusEtapa, setStatusEtapa] = useState<'CONCLUIDA' | 'PENDENTE' | 'DIVERGENTE' | ''>('');
  const [somentePendentes, setSomentePendentes] = useState(false);

  const buscaDebounced = useDebounce(busca, 400);

  const etapaConfig =
    isOperacaoEtapaSlug(etapaSlug) && isPainelSlug(etapaSlug)
      ? getOperacaoEtapaConfig(etapaSlug)
      : null;
  const etapaApi = etapaConfig?.etapaApi ?? '';

  const { data, isLoading, isError } = usePainelEtapa(etapaApi, {
    page: pagina,
    limit: 20,
    repositorio: buscaDebounced || undefined,
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    origem: origem || undefined,
    statusEtapa: statusEtapa || undefined,
    somentePendentes,
  });

  if (!isOperacaoEtapaSlug(etapaSlug) || !isPainelSlug(etapaSlug)) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-sm text-[var(--color-text-tertiary)]">Etapa não encontrada.</p>
      </div>
    );
  }

  if (!etapaConfig) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-sm text-[var(--color-text-tertiary)]">Etapa não encontrada.</p>
      </div>
    );
  }

  const itens = data?.data ?? [];
  const meta = data?.meta;
  const total = meta?.total ?? 0;
  const totalPaginas = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;

  function handleFiltroChange() {
    setPagina(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <OperacaoEtapasNav etapaAtual={etapaSlug} />

      <PageHeader
        title={`Painel de ${etapaConfig.label}`}
        subtitle="Acompanhe os repositórios com base na produção lançada e legada."
      />

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Buscar por repositório ou entidade…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                handleFiltroChange();
              }}
            />
          </div>

          <div className="flex gap-2">
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value);
                handleFiltroChange();
              }}
              className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
              title="Data início"
            />
            <input
              type="date"
              value={dataFim}
              onChange={(e) => {
                setDataFim(e.target.value);
                handleFiltroChange();
              }}
              className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
              title="Data fim"
            />
          </div>

          <select
            value={origem}
            title="Origem da produção"
            aria-label="Origem da produção"
            onChange={(e) => {
              setOrigem(e.target.value as 'LANCADA' | 'LEGADA' | '');
              handleFiltroChange();
            }}
            className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            <option value="">Todas as origens</option>
            <option value="LANCADA">Lançada no sistema</option>
            <option value="LEGADA">Produção legada</option>
          </select>

          <select
            value={statusEtapa}
            title="Status da etapa"
            aria-label="Status da etapa"
            onChange={(e) => {
              setStatusEtapa(e.target.value as 'CONCLUIDA' | 'PENDENTE' | 'DIVERGENTE' | '');
              handleFiltroChange();
            }}
            className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
          >
            <option value="">Todos os status</option>
            <option value="CONCLUIDA">Concluída</option>
            <option value="PENDENTE">Pendente</option>
            <option value="DIVERGENTE">Com divergência</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={somentePendentes}
              onChange={(e) => {
                setSomentePendentes(e.target.checked);
                setOrigem('');
                handleFiltroChange();
              }}
              className="rounded border-[var(--color-border-primary)]"
            />
            Somente pendentes
          </label>
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-[var(--color-text-tertiary)] text-sm">
            Carregando…
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center p-12 text-[var(--color-text-tertiary)] text-sm">
            Erro ao carregar dados. Tente novamente.
          </div>
        ) : itens.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <p className="text-[var(--color-text-tertiary)] text-sm">
              {somentePendentes
                ? 'Nenhum repositório pendente nesta etapa.'
                : 'Nenhum registro de produção encontrado para os filtros aplicados.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-primary)] text-left text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                  <th className="px-4 py-3">Repositório</th>
                  <th className="px-4 py-3">Entidade</th>
                  <th className="px-4 py-3">Responsável</th>
                  <th className="px-4 py-3">Data de Execução</th>
                  <th className="px-4 py-3 text-right">Quantidade</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Etapa Calculada</th>
                  <th className="px-4 py-3">Divergências</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-primary)]">
                {itens.map((item) => (
                  <tr
                    key={item.producaoId ?? `${item.repositorioId}-${item.dataExecucao}`}
                    className="hover:bg-[var(--color-bg-secondary)] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-[var(--color-text-primary)]">
                      {item.repositorioCodigo}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {item.entidade}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {item.responsavelNome ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-tertiary)]">
                      {formatDate(item.dataExecucao)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[var(--color-text-primary)]">
                      {item.statusEtapa === 'PENDENTE' ? (
                        <span className="text-[var(--color-text-tertiary)]">—</span>
                      ) : (
                        <span>
                          {item.quantidade.toLocaleString('pt-BR')}{' '}
                          <span className="text-xs font-normal text-[var(--color-text-tertiary)]">
                            {item.unidade === 'IMAGENS' ? 'img' : 'rep.'}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <OrigemBadge origem={item.origem} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusEtapaBadge status={item.statusEtapa} />
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-text-tertiary)]">
                      {item.etapaAtualCalculada ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <DivergenciasBadge divergencias={item.divergencias ?? []} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !isError && total > 0 && (
          <div className="flex items-center justify-between border-t border-[var(--color-border-primary)] px-4 py-3">
            <p className="text-sm text-[var(--color-text-tertiary)]">
              {total} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
            </p>
            <Pagination pagina={pagina} totalPaginas={totalPaginas} onChange={setPagina} />
          </div>
        )}
      </Card>
    </div>
  );
}
