import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Select';
import { FilterBar } from '../../components/ui/FilterBar';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { ActionFeedback, PageState } from '../../components/ui/PageState';
import { useToastHelpers } from '../../components/ui/Toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import {
  useAusenciasAdmin,
  useAprovarAusencia,
  useQueryClient,
  useRejeitarAusencia,
} from '../../hooks/useQueries';
import type { AusenciaAdminItem, ListarAusenciasAdminParams } from '@recorda/shared';

const STATUS_OPTIONS = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'rejeitado', label: 'Rejeitado' },
  { value: 'cancelado', label: 'Cancelado' },
] as const;

const statusBadgeClass: Record<string, string> = {
  pendente: 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)]',
  aprovado: 'bg-[var(--color-success-50)] text-[var(--color-success-700)]',
  rejeitado: 'bg-[var(--color-error-50)] text-[var(--color-error-700)]',
  cancelado: 'bg-[var(--color-gray-100)] text-[var(--color-text-secondary)]',
};

function formatDate(value: string | undefined | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function getPeriodoLabel(periodo: string): string {
  switch (periodo) {
    case 'meio_periodo_manha':
      return 'Meio período (manhã)';
    case 'meio_periodo_tarde':
      return 'Meio período (tarde)';
    case 'horas':
      return 'Horas';
    default:
      return 'Dia completo';
  }
}

export function AusenciasPage(): JSX.Element {
  const [filters, setFilters] = useState<ListarAusenciasAdminParams>({
    pagina: 1,
    limite: 20,
    status: 'TODOS',
    busca: '',
  });
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [rejeicaoAberta, setRejeicaoAberta] = useState(false);
  const [selecionada, setSelecionada] = useState<AusenciaAdminItem | null>(null);
  const [mensagemAcao, setMensagemAcao] = useState<{
    tipo: 'success' | 'error';
    texto: string;
  } | null>(null);

  const queryClient = useQueryClient();
  const toast = useToastHelpers();
  const confirmDialog = useConfirmDialog();
  const ausenciasQuery = useAusenciasAdmin(filters);
  const aprovarAusencia = useAprovarAusencia();
  const rejeitarAusencia = useRejeitarAusencia();

  const ausencias = useMemo<AusenciaAdminItem[]>(
    () => ausenciasQuery.data?.itens ?? [],
    [ausenciasQuery.data]
  );
  const total = ausenciasQuery.data?.total ?? 0;
  const carregando = ausenciasQuery.isLoading;
  const erro = ausenciasQuery.error
    ? {
        message: 'Erro ao carregar ausências',
        details: ausenciasQuery.error instanceof Error ? ausenciasQuery.error.message : '',
      }
    : null;

  const resumo = useMemo(
    () => ({
      total,
      pendentes: ausencias.filter((item) => item.status === 'pendente').length,
      aprovadas: ausencias.filter((item) => item.status === 'aprovado').length,
      rejeitadas: ausencias.filter((item) => item.status === 'rejeitado').length,
    }),
    [ausencias, total]
  );

  const invalidarAusencias = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['ausencias-admin'] });
  };

  const handleFilterChange = (field: keyof ListarAusenciasAdminParams, value: string): void => {
    setFilters((prev) => ({
      ...prev,
      [field]: value || undefined,
      pagina: 1,
    }));
  };

  const handleAprovar = (ausencia: AusenciaAdminItem): void => {
    confirmDialog.confirm({
      title: 'Aprovar ausência',
      message: `Deseja aprovar a ausência de ${ausencia.usuarioNome} de ${formatDate(
        ausencia.dataInicio
      )} a ${formatDate(ausencia.dataFim)}?`,
      confirmLabel: 'Aprovar',
      variant: 'default',
      onConfirm: async () => {
        try {
          await aprovarAusencia.mutateAsync({ id: ausencia.id, body: {} });
          setMensagemAcao({ tipo: 'success', texto: 'Ausência aprovada com sucesso.' });
          await invalidarAusencias();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao aprovar ausência';
          setMensagemAcao({ tipo: 'error', texto: message });
        }
      },
    });
  };

  const handleAbrirRejeicao = (ausencia: AusenciaAdminItem): void => {
    setSelecionada(ausencia);
    setMotivoRejeicao('');
    setRejeicaoAberta(true);
  };

  const handleConfirmarRejeicao = async (): Promise<void> => {
    if (!selecionada) return;

    if (!motivoRejeicao.trim()) {
      toast.error('Informe o motivo da rejeição.');
      return;
    }

    try {
      await rejeitarAusencia.mutateAsync({
        id: selecionada.id,
        body: { motivoRejeicao: motivoRejeicao.trim() },
      });
      setMensagemAcao({ tipo: 'success', texto: 'Ausência rejeitada com sucesso.' });
      setRejeicaoAberta(false);
      setSelecionada(null);
      setMotivoRejeicao('');
      await invalidarAusencias();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao rejeitar ausência';
      setMensagemAcao({ tipo: 'error', texto: message });
    }
  };

  const handleFecharRejeicao = (): void => {
    setRejeicaoAberta(false);
    setSelecionada(null);
    setMotivoRejeicao('');
  };

  return (
    <PageState loading={carregando} loadingMessage="Carregando ausências..." error={erro}>
      <div className="space-y-6">
        <PageHeader
          title="Justificativas de Ausência"
          subtitle="Acompanhe, aprove e rejeite solicitações de ausência dos colaboradores."
        />

        {mensagemAcao ? (
          <ActionFeedback
            type={mensagemAcao.tipo}
            title={mensagemAcao.tipo === 'success' ? 'Operação concluída' : 'Ação não concluída'}
            message={mensagemAcao.texto}
            onDismiss={() => setMensagemAcao(null)}
          />
        ) : null}

        <Card padding="sm">
          <FilterBar
            actions={
              <Button variant="secondary" onClick={() => void invalidarAusencias()}>
                Atualizar
              </Button>
            }
          >
            <Input
              label="Buscar"
              value={filters.busca ?? ''}
              onChange={(event) => handleFilterChange('busca', event.target.value)}
              placeholder="Colaborador, justificativa ou observações"
            />
            <Select
              label="Status"
              value={filters.status ?? 'TODOS'}
              onChange={(event) => handleFilterChange('status', event.target.value)}
              options={STATUS_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
            <Input
              label="Data início"
              type="date"
              value={filters.dataInicio ?? ''}
              onChange={(event) => handleFilterChange('dataInicio', event.target.value)}
            />
            <Input
              label="Data fim"
              type="date"
              value={filters.dataFim ?? ''}
              onChange={(event) => handleFilterChange('dataFim', event.target.value)}
            />
          </FilterBar>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card padding="sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              Resultados
            </p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{total}</p>
          </Card>
          <Card padding="sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              Pendentes na página
            </p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
              {resumo.pendentes}
            </p>
          </Card>
          <Card padding="sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              Aprovadas na página
            </p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
              {resumo.aprovadas}
            </p>
          </Card>
        </div>

        <Card padding="none">
          <CardHeader
            title="Solicitações de ausência"
            description="Visualize as solicitações e realize decisões administrativas de aprovação ou rejeição."
            className="px-5 pt-5"
          />
          <Table>
            <TableHead>
              <tr>
                <TableHeader>Colaborador</TableHeader>
                <TableHeader>Tipo</TableHeader>
                <TableHeader>Período</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Justificativa</TableHeader>
                <TableHeader align="right">Ações</TableHeader>
              </tr>
            </TableHead>
            <TableBody>
              {ausencias.length === 0 ? (
                <TableEmptyState
                  colSpan={6}
                  title="Nenhuma ausência encontrada"
                  description="Ajuste os filtros ou aguarde novas solicitações."
                />
              ) : (
                ausencias.map((ausencia) => (
                  <TableRow key={ausencia.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[var(--color-text-primary)]">
                          {ausencia.usuarioNome}
                        </p>
                        <p className="truncate text-xs text-[var(--color-text-secondary)]">
                          {ausencia.usuarioEmail}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-2 rounded-full bg-[var(--color-gray-100)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)]"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: ausencia.tipoAusenciaCor }}
                        />
                        {ausencia.tipoAusenciaNome}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        <p>{formatDate(ausencia.dataInicio)}</p>
                        <p>{formatDate(ausencia.dataFim)}</p>
                        <p>{getPeriodoLabel(ausencia.periodo)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass[ausencia.status]}`}>
                        {ausencia.status}
                      </span>
                    </TableCell>
                    <TableCell hideOnMobile>
                      <p className="truncate text-sm text-[var(--color-text-secondary)]">
                        {ausencia.justificativa ?? ausencia.observacoes ?? '-'}
                      </p>
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex justify-end gap-2">
                        {ausencia.status === 'pendente' ? (
                          <>
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => handleAprovar(ausencia)}
                            >
                              Aprovar
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleAbrirRejeicao(ausencia)}
                            >
                              Rejeitar
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            Sem ações disponíveis
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <Modal
          open={rejeicaoAberta}
          onClose={handleFecharRejeicao}
          title="Rejeitar ausência"
          subtitle={selecionada ? `${selecionada.usuarioNome} • ${formatDate(selecionada.dataInicio)} até ${formatDate(selecionada.dataFim)}` : undefined}
          size="md"
        >
          <div className="space-y-4 p-5">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Informe o motivo da rejeição para registrar a decisão administrativa.
            </p>
            <textarea
              value={motivoRejeicao}
              onChange={(event) => setMotivoRejeicao(event.target.value)}
              rows={5}
              className="w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-primary-600)] focus:ring-2 focus:ring-[var(--color-primary-200)]"
              placeholder="Motivo da rejeição"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handleFecharRejeicao}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmarRejeicao}
                loading={rejeitarAusencia.status === 'pending'}
              >
                Confirmar rejeição
              </Button>
            </div>
          </div>
        </Modal>

        <ConfirmDialog
          state={confirmDialog.state}
          loading={confirmDialog.loading}
          onConfirm={() => void confirmDialog.handleConfirm()}
          onCancel={confirmDialog.close}
        />
      </div>
    </PageState>
  );
}
