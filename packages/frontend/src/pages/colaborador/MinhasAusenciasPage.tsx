import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageState } from '../../components/ui/PageState';
import { useToastHelpers } from '../../components/ui/Toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useCancelarMinhaAusencia, useMinhasAusencias } from '../../hooks/useQueries';
import { api } from '../../services/api';
import type { ListarMinhasAusenciasParams, MinhaAusenciaItem } from '@recorda/shared';

const PERIODO_OPTIONS = [
  { value: 'dia_completo', label: 'Dia completo' },
  { value: 'meio_periodo_manha', label: 'Meio periodo (manha)' },
  { value: 'meio_periodo_tarde', label: 'Meio periodo (tarde)' },
  { value: 'horas', label: 'Horas' },
];

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  cancelado: 'Cancelado',
};

const STATUS_BADGE: Record<string, string> = {
  pendente: 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)]',
  aprovado: 'bg-[var(--color-success-50)] text-[var(--color-success-700)]',
  rejeitado: 'bg-[var(--color-error-50)] text-[var(--color-error-700)]',
  cancelado: 'bg-[var(--color-gray-100)] text-[var(--color-text-secondary)]',
};

function formatDate(value: string | undefined | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return d.toLocaleDateString('pt-BR');
}

function getPeriodoLabel(periodo: string): string {
  return PERIODO_OPTIONS.find((item) => item.value === periodo)?.label ?? periodo;
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-[var(--color-gray-100)] text-[var(--color-text-secondary)]'}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function AusenciaCard({
  item,
  onCancelar,
}: {
  item: MinhaAusenciaItem;
  onCancelar: (item: MinhaAusenciaItem) => void;
}): JSX.Element {
  const podeCancelar = item.status === 'pendente';

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-[var(--color-text-primary)]">
              {item.tipoAusenciaNome}
            </span>
            <StatusBadge status={item.status} />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]">
            <span>
              {formatDate(item.dataInicio)}
              {item.dataFim !== item.dataInicio ? ` - ${formatDate(item.dataFim)}` : ''}
            </span>
            <span>{getPeriodoLabel(item.periodo)}</span>
            {item.horasAusencia ? <span>{item.horasAusencia}h</span> : null}
          </div>

          {item.justificativa ? (
            <p className="line-clamp-2 text-xs text-[var(--color-text-secondary)]">
              {item.justificativa}
            </p>
          ) : null}

          {item.motivoRejeicao ? (
            <p className="text-xs text-[var(--color-error-600)]">
              <span className="font-medium">Motivo: </span>
              {item.motivoRejeicao}
            </p>
          ) : null}

          {item.documentoAnexo ? (
            <button
              type="button"
              onClick={() => void api.openAnexo(`/ausencias/${item.id}/anexo`)}
              className="text-xs font-medium text-[var(--color-primary-700)] underline underline-offset-2 transition-colors hover:text-[var(--color-primary-900)]"
            >
              Ver anexo
            </button>
          ) : null}

          <p className="text-xs text-[var(--color-text-tertiary)]">
            Solicitado em {formatDate(item.criadoEm)}
          </p>
        </div>

        {podeCancelar ? (
          <Button
            variant="ghost"
            size="sm"
            icon="x"
            onClick={() => onCancelar(item)}
            className="shrink-0 text-[var(--color-error-600)] hover:bg-[var(--color-error-50)]"
          >
            Cancelar
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export function MinhasAusenciasPage(): JSX.Element {
  const { success: toastSuccess, error: toastError } = useToastHelpers();
  const confirmDialog = useConfirmDialog();

  const [filters] = useState<ListarMinhasAusenciasParams>({});
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  const ausenciasQuery = useMinhasAusencias(filters);
  const cancelarMutation = useCancelarMinhaAusencia();

  const ausencias = ausenciasQuery.data?.itens ?? [];

  const ausenciasFiltradas = ausencias
    .filter((item) => (filtroStatus ? item.status === filtroStatus : true))
    .filter((item) => (filtroTipo ? item.tipoAusenciaId === filtroTipo : true))
    .slice()
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());

  const tiposPresentes = Array.from(
    new Map(ausencias.map((item) => [item.tipoAusenciaId, item.tipoAusenciaNome])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  function handleCancelar(item: MinhaAusenciaItem): void {
    confirmDialog.confirm({
      title: 'Cancelar ausência',
      message: `Cancelar "${item.tipoAusenciaNome}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Cancelar',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await cancelarMutation.mutateAsync({
            id: item.id,
            body: { motivo: 'Cancelado pelo colaborador' },
          });
          toastSuccess('Solicitacao cancelada.');
        } catch (err: unknown) {
          const msg =
            err && typeof err === 'object' && 'error' in err
              ? String((err as { error: string }).error)
              : 'Erro ao cancelar solicitacao.';
          toastError(msg);
        }
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Minhas Ausências" subtitle="Histórico de ausências." />

      <PageState
        loading={ausenciasQuery.isLoading}
        loadingMessage="Carregando histórico..."
        error={
          ausenciasQuery.isError
            ? {
                message: 'Não foi possível carregar suas ausências.',
                action: { label: 'Tentar novamente', onClick: () => void ausenciasQuery.refetch() },
              }
            : null
        }
        empty={
          ausencias.length === 0 && !ausenciasQuery.isLoading && !ausenciasQuery.isError
            ? {
                icon: 'calendar',
                title: 'Nenhuma ausência registrada',
                description: 'Nenhuma ausência vinculada ao seu perfil.',
              }
            : null
        }
      >
        {ausencias.length > 0 ? (
          <div className="flex flex-wrap gap-3 pb-3">
            <div className="min-w-[140px] flex-1">
              <select
                className="w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-400)] focus:ring-2 focus:ring-[var(--color-primary-100)]"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                aria-label="Filtrar por status"
              >
                <option value="">Todos os status</option>
                <option value="pendente">Pendente</option>
                <option value="aprovado">Aprovado</option>
                <option value="rejeitado">Rejeitado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>

            {tiposPresentes.length > 1 ? (
              <div className="min-w-[160px] flex-1">
                <select
                  className="w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-400)] focus:ring-2 focus:ring-[var(--color-primary-100)]"
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                  aria-label="Filtrar por tipo"
                >
                  <option value="">Todos os tipos</option>
                  {tiposPresentes.map(([id, nome]) => (
                    <option key={id} value={id}>
                      {nome}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          {ausenciasFiltradas.length === 0 && ausencias.length > 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-tertiary)]">
              Nenhuma solicitação encontrada.
            </p>
          ) : null}

          {ausenciasFiltradas.map((item) => (
            <AusenciaCard key={item.id} item={item} onCancelar={handleCancelar} />
          ))}
        </div>
      </PageState>

      <ConfirmDialog
        state={confirmDialog.state}
        loading={confirmDialog.loading}
        onConfirm={() => void confirmDialog.handleConfirm()}
        onCancel={confirmDialog.close}
      />
    </div>
  );
}

