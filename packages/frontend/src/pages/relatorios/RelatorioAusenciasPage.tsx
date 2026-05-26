import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '../../hooks/useQueries';
import type { RelatorioAusenciasParams, RelatorioAusenciasResponse } from '@recorda/shared';
import { api } from '../../services/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FilterBar';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ActionFeedback } from '../../components/ui/PageState';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  TableEmptyState,
} from '../../components/ui/Table';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDateBR } from '../../utils/date';

type AusenciaStatus = 'pendente' | 'aprovado' | 'rejeitado' | 'cancelado';

const STATUS_OPTIONS = [
  { value: 'TODOS', label: 'Todos os status' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'rejeitado', label: 'Rejeitado' },
  { value: 'cancelado', label: 'Cancelado' },
];

const STATUS_BADGE: Record<
  AusenciaStatus,
  { variant: 'warning' | 'success' | 'error' | 'default'; label: string }
> = {
  pendente: { variant: 'warning', label: 'Pendente' },
  aprovado: { variant: 'success', label: 'Aprovado' },
  rejeitado: { variant: 'error', label: 'Rejeitado' },
  cancelado: { variant: 'default', label: 'Cancelado' },
};

const PERIODO_LABEL: Record<string, string> = {
  dia_completo: 'Dia completo',
  meio_periodo_manha: 'Meio período — manhã',
  meio_periodo_tarde: 'Meio período — tarde',
  horas: 'Horas',
};

function periodoLabel(p: string): string {
  return PERIODO_LABEL[p] ?? p;
}

function StatusBadge({ status }: { status: AusenciaStatus }): JSX.Element {
  const cfg = STATUS_BADGE[status] ?? { variant: 'neutral' as const, label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function getAusenciaColorClass(cor: string): string {
  switch ((cor || '').toUpperCase()) {
    case '#22C55E':
      return 'bg-[#22C55E]';
    case '#EAB308':
      return 'bg-[#EAB308]';
    case '#3B82F6':
      return 'bg-[#3B82F6]';
    case '#F97316':
      return 'bg-[#F97316]';
    case '#EF4444':
      return 'bg-[#EF4444]';
    case '#14B8A6':
      return 'bg-[#14B8A6]';
    case '#6B7280':
      return 'bg-[#6B7280]';
    case '#F472B6':
      return 'bg-[#F472B6]';
    case '#DC2626':
      return 'bg-[#DC2626]';
    case '#7C3AED':
      return 'bg-[#7C3AED]';
    default:
      return 'bg-[var(--color-gray-300)]';
  }
}

// ─── Totals summary cards ──────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}): JSX.Element {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? 'border-[var(--color-primary-200)] bg-[var(--color-primary-50)]'
          : 'border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]'
      }`}
    >
      <p className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          highlight ? 'text-[var(--color-primary-700)]' : 'text-[var(--color-text-primary)]'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function RelatorioAusenciasPage(): JSX.Element {
  const qc = useQueryClient();
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [colaboradorId, setColaboradorId] = useState('');
  const [tipoAusenciaId, setTipoAusenciaId] = useState('');
  const [status, setStatus] = useState('TODOS');
  const [carregando, setCarregando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioAusenciasResponse | null>(null);
  const [mensagem, setMensagem] = useState<{
    tipo: 'success' | 'error';
    texto: string;
    detalhes?: string;
  } | null>(null);

  // Stash filter options from the last successful fetch
  const [colaboradoresOpcoes, setColaboradoresOpcoes] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  const [tiposOpcoes, setTiposOpcoes] = useState<Array<{ id: string; nome: string; cor: string }>>(
    []
  );

  const [exportando, setExportando] = useState(false);
  const lastParamsRef = useRef<string>('');

  // Pre-load filter options on mount (empty query)
  const loadFiltros = useCallback(async (): Promise<void> => {
    if (colaboradoresOpcoes.length > 0) return;
    try {
      const data = await api.get<RelatorioAusenciasResponse>('/relatorios/ausencias');
      setColaboradoresOpcoes(data.filtros.colaboradores);
      setTiposOpcoes(data.filtros.tipos);
    } catch {
      // silent — filter options are optional
    }
  }, [colaboradoresOpcoes.length]);

  // Run on first render
  useState(() => {
    void loadFiltros();
  });

  const buildParams = useCallback((): RelatorioAusenciasParams => {
    const p: RelatorioAusenciasParams = {};
    if (dataInicio) p.dataInicio = dataInicio;
    if (dataFim) p.dataFim = dataFim;
    if (colaboradorId) p.colaboradorId = colaboradorId;
    if (tipoAusenciaId) p.tipoAusenciaId = tipoAusenciaId;
    if (status && status !== 'TODOS') p.status = status as AusenciaStatus;
    return p;
  }, [dataInicio, dataFim, colaboradorId, tipoAusenciaId, status]);

  const handleGerar = useCallback(async (): Promise<void> => {
    const params = buildParams();
    const key = JSON.stringify(params);
    if (key === lastParamsRef.current && relatorio !== null) return;

    setCarregando(true);
    setMensagem(null);
    setRelatorio(null);

    try {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
      }
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const data = await api.get<RelatorioAusenciasResponse>(`/relatorios/ausencias${suffix}`);
      setRelatorio(data);
      lastParamsRef.current = key;
      if (data.filtros.colaboradores.length > 0) setColaboradoresOpcoes(data.filtros.colaboradores);
      if (data.filtros.tipos.length > 0) setTiposOpcoes(data.filtros.tipos);
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : ((error as { error?: string })?.error ?? 'Erro ao gerar relatório');
      setMensagem({ tipo: 'error', texto: 'Erro ao gerar relatório', detalhes: msg });
    } finally {
      setCarregando(false);
    }
    // Invalidate cached query so detail panels refresh
    void qc.invalidateQueries({ queryKey: ['relatorio-ausencias'] });
  }, [buildParams, relatorio, qc]);

  const handleExportar = useCallback(async (): Promise<void> => {
    const params = buildParams();
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const today = new Date().toISOString().slice(0, 10);
    setExportando(true);
    setMensagem(null);
    try {
      await api.download(`/relatorios/ausencias/exportar${suffix}`, `ausencias-${today}.csv`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao exportar relatório';
      setMensagem({ tipo: 'error', texto: 'Erro ao exportar', detalhes: msg });
    } finally {
      setExportando(false);
    }
  }, [buildParams]);

  const totais = relatorio?.totais;
  const registros = relatorio?.registros ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório de Ausências"
        subtitle="Visão mensal para fechamento administrativo."
      />

      {mensagem && (
        <ActionFeedback
          type={mensagem.tipo}
          title={mensagem.texto}
          message={mensagem.detalhes ?? ''}
          onDismiss={() => setMensagem(null)}
        />
      )}

      {/* ── Filtros ── */}
      <FilterBar
        actions={
          <div className="flex gap-2">
            <Button
              variant="primary"
              icon="search"
              onClick={() => void handleGerar()}
              loading={carregando}
              disabled={carregando}
            >
              Gerar relatório
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleExportar()}
              loading={exportando}
              disabled={exportando || carregando}
            >
              Exportar CSV
            </Button>
          </div>
        }
      >
        <div className="sm:col-span-2 lg:col-span-2">
          <DateRangePicker
            startDate={dataInicio}
            endDate={dataFim}
            onStartDateChange={setDataInicio}
            onEndDateChange={setDataFim}
            showPresets={false}
          />
        </div>

        <Select
          label="Colaborador"
          value={colaboradorId}
          onChange={(e) => setColaboradorId(e.target.value)}
          options={[
            { value: '', label: 'Todos' },
            ...colaboradoresOpcoes.map((c) => ({ value: c.id, label: c.nome })),
          ]}
        />

        <Select
          label="Tipo de ausência"
          value={tipoAusenciaId}
          onChange={(e) => setTipoAusenciaId(e.target.value)}
          options={[
            { value: '', label: 'Todos' },
            ...tiposOpcoes.map((t) => ({ value: t.id, label: t.nome })),
          ]}
        />

        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={STATUS_OPTIONS}
        />
      </FilterBar>

      {/* ── Skeleton ── */}
      {carregando && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {/* ── Totais ── */}
      {!carregando && totais && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCard label="Total de registros" value={totais.totalRegistros} />
            <SummaryCard
              label="Pendentes"
              value={totais.totalPorStatus['pendente'] ?? 0}
              highlight={(totais.totalPorStatus['pendente'] ?? 0) > 0}
            />
            <SummaryCard label="Aprovados" value={totais.totalPorStatus['aprovado'] ?? 0} />
            <SummaryCard label="Rejeitados" value={totais.totalPorStatus['rejeitado'] ?? 0} />
            <SummaryCard label="Cancelados" value={totais.totalPorStatus['cancelado'] ?? 0} />
            <SummaryCard
              label="Dias aprovados"
              value={totais.diasAprovados}
              highlight={totais.diasAprovados > 0}
            />
          </div>

          {/* Totais por tipo */}
          {totais.totalPorTipo.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-[var(--color-gray-50)] border-b border-[var(--color-border-primary)]">
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Totais por tipo de ausência
                </span>
              </div>
              <div className="flex flex-wrap gap-3 p-4">
                {totais.totalPorTipo
                  .slice()
                  .sort((a, b) => b.quantidade - a.quantidade)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg border border-[var(--color-border-primary)] px-3 py-2 text-sm"
                    >
                      <span
                        className={`inline-block h-3 w-3 rounded-full shrink-0 ${getAusenciaColorClass(t.cor)}`}
                      />
                      <span className="text-[var(--color-text-primary)] font-medium">{t.nome}</span>
                      <span className="ml-1 font-bold tabular-nums text-[var(--color-text-secondary)]">
                        {t.quantidade}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Totais por colaborador */}
          {totais.totalPorColaborador.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-[var(--color-gray-50)] border-b border-[var(--color-border-primary)]">
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Totais por colaborador
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Colaborador</TableHeader>
                      <TableHeader align="right">Ausências</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {totais.totalPorColaborador
                      .slice()
                      .sort((a, b) => b.quantidade - a.quantidade)
                      .map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>{c.nome}</TableCell>
                          <TableCell align="right" className="font-medium tabular-nums">
                            {c.quantidade}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* ── Listagem detalhada ── */}
          <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-[var(--color-gray-50)] border-b border-[var(--color-border-primary)]">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                Registros detalhados ({registros.length})
              </span>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 p-3 md:hidden">
              {registros.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--color-text-tertiary)]">
                  Nenhum registro encontrado para os filtros selecionados.
                </p>
              ) : (
                registros.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-[var(--color-border-primary)] p-3 space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {r.colaboradorNome}
                      </p>
                      <StatusBadge status={r.status as AusenciaStatus} />
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {r.tipoAusenciaNome}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {formatDateBR(r.dataInicio)} → {formatDateBR(r.dataFim)} •{' '}
                      {periodoLabel(r.periodo)}
                    </p>
                    {r.justificativa ? (
                      <p className="text-xs text-[var(--color-text-secondary)] italic truncate">
                        {r.justificativa}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Colaborador</TableHeader>
                    <TableHeader>Tipo</TableHeader>
                    <TableHeader>Início</TableHeader>
                    <TableHeader>Fim</TableHeader>
                    <TableHeader>Período</TableHeader>
                    <TableHeader align="right">Dias</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Observação</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {registros.length === 0 ? (
                    <TableEmptyState
                      colSpan={8}
                      title="Nenhum registro encontrado para os filtros selecionados."
                    />
                  ) : (
                    registros.map((r) => (
                      <TableRow
                        key={r.id}
                        className={
                          r.status === 'cancelado' || r.status === 'rejeitado'
                            ? 'opacity-60'
                            : undefined
                        }
                      >
                        <TableCell className="font-medium">{r.colaboradorNome}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${getAusenciaColorClass(r.tipoAusenciaCor)}`}
                            />
                            {r.tipoAusenciaNome}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatDateBR(r.dataInicio)}</TableCell>
                        <TableCell className="tabular-nums">{formatDateBR(r.dataFim)}</TableCell>
                        <TableCell>{periodoLabel(r.periodo)}</TableCell>
                        <TableCell align="right" className="tabular-nums">
                          {r.diasAusencia}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status as AusenciaStatus} />
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-[var(--color-text-secondary)]">
                          {r.status === 'rejeitado' && r.motivoRejeicao
                            ? r.motivoRejeicao
                            : (r.justificativa ?? '—')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Regra de contagem */}
          <p className="text-xs text-[var(--color-text-tertiary)]">
            * Somente ausências com status <strong>aprovado</strong> são contabilizadas nos dias
            abonados para fechamento. Pendentes são destacadas como pendência administrativa.
            Rejeitadas e canceladas aparecem como histórico.
          </p>
        </>
      )}

      {/* Empty state — user hasn't searched yet */}
      {!carregando && !relatorio && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border-primary)] py-16 text-center">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            Selecione os filtros e clique em <strong>Gerar relatório</strong> para visualizar os
            dados.
          </p>
        </div>
      )}
    </div>
  );
}
