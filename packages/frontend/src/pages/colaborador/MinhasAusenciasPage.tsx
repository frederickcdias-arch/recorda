import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageState } from '../../components/ui/PageState';
import { useToastHelpers } from '../../components/ui/Toast';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { api } from '../../services/api';
import {
  useTiposAusencia,
  useMinhasAusencias,
  useCriarMinhaAusencia,
  useCancelarMinhaAusencia,
} from '../../hooks/useQueries';
import type { MinhaAusenciaItem, TipoAusencia, ListarMinhasAusenciasParams } from '@recorda/shared';

// ─── Constantes ───────────────────────────────────────────────

const PERIODO_OPTIONS = [
  { value: 'dia_completo', label: 'Dia completo' },
  { value: 'meio_periodo_manha', label: 'Meio período (manhã)' },
  { value: 'meio_periodo_tarde', label: 'Meio período (tarde)' },
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

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXT_LABEL = 'PDF, JPG ou PNG';

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(value: string | undefined | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return d.toLocaleDateString('pt-BR');
}

function getPeriodoLabel(periodo: string): string {
  return PERIODO_OPTIONS.find((p) => p.value === periodo)?.label ?? periodo;
}

// ─── Componente de badge de status ────────────────────────────

function StatusBadge({ status }: { status: string }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-[var(--color-gray-100)] text-[var(--color-text-secondary)]'}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Card de ausência ─────────────────────────────────────────

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
              {item.dataFim !== item.dataInicio ? ` — ${formatDate(item.dataFim)}` : ''}
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
              className="text-xs font-medium text-[var(--color-primary-700)] underline underline-offset-2 hover:text-[var(--color-primary-900)] transition-colors"
            >
              📎 Ver anexo
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

// ─── Formulário de nova solicitação ──────────────────────────

interface FormState {
  tipoAusenciaId: string;
  dataInicio: string;
  dataFim: string;
  periodo: string;
  horasAusencia: string;
  justificativa: string;
  observacoes: string;
}

const FORM_INITIAL: FormState = {
  tipoAusenciaId: '',
  dataInicio: '',
  dataFim: '',
  periodo: '',
  horasAusencia: '',
  justificativa: '',
  observacoes: '',
};

interface FormErrors {
  tipoAusenciaId?: string;
  dataInicio?: string;
  dataFim?: string;
  periodo?: string;
  horasAusencia?: string;
  justificativa?: string;
  arquivo?: string;
}

function NovaSolicitacaoForm({
  tipos,
  onSuccess,
}: {
  tipos: TipoAusencia[];
  onSuccess: () => void;
}): JSX.Element {
  const { success: toastSuccess, error: toastError } = useToastHelpers();
  const criarMutation = useCriarMinhaAusencia();

  const [form, setForm] = useState<FormState>(FORM_INITIAL);
  const [errors, setErrors] = useState<FormErrors>({});
  const [arquivo, setArquivo] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tipoSelecionado = tipos.find((t) => t.id === form.tipoAusenciaId) ?? null;

  function handleChange(field: keyof FormState, value: string): void {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleArquivo(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setArquivo(null);
      return;
    }
    if (!ALLOWED_MIME.has(file.type)) {
      setErrors((prev) => ({ ...prev, arquivo: `Formato inválido. Use ${ALLOWED_EXT_LABEL}.` }));
      setArquivo(null);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrors((prev) => ({ ...prev, arquivo: 'Arquivo excede 5 MB.' }));
      setArquivo(null);
      e.target.value = '';
      return;
    }
    setArquivo(file);
    setErrors((prev) => ({ ...prev, arquivo: undefined }));
  }

  function removerArquivo(): void {
    setArquivo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setErrors((prev) => ({ ...prev, arquivo: undefined }));
  }

  function validate(): boolean {
    const errs: FormErrors = {};

    if (!form.tipoAusenciaId) errs.tipoAusenciaId = 'Selecione o tipo de ausência.';
    if (!form.dataInicio) errs.dataInicio = 'Informe a data de início.';
    if (!form.dataFim) errs.dataFim = 'Informe a data de fim.';
    if (form.dataInicio && form.dataFim && form.dataFim < form.dataInicio) {
      errs.dataFim = 'Data de fim não pode ser anterior à data de início.';
    }
    if (!form.periodo) errs.periodo = 'Selecione o período.';
    if (form.periodo === 'horas' && !form.horasAusencia) {
      errs.horasAusencia = 'Informe a quantidade de horas.';
    }
    if (tipoSelecionado?.requerJustificativa && !form.justificativa.trim()) {
      errs.justificativa = 'Justificativa obrigatória para este tipo de ausência.';
    }
    if (tipoSelecionado?.requerDocumento && !arquivo) {
      errs.arquivo = 'Documento comprobatório obrigatório para este tipo de ausência.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!validate()) return;

    const fd = new FormData();
    fd.append('tipoAusenciaId', form.tipoAusenciaId);
    fd.append('dataInicio', form.dataInicio);
    fd.append('dataFim', form.dataFim);
    fd.append('periodo', form.periodo);
    if (form.periodo === 'horas' && form.horasAusencia) {
      fd.append('horasAusencia', form.horasAusencia);
    }
    if (form.justificativa.trim()) fd.append('justificativa', form.justificativa.trim());
    if (form.observacoes.trim()) fd.append('observacoes', form.observacoes.trim());
    if (arquivo) fd.append('arquivo', arquivo, arquivo.name);

    try {
      await criarMutation.mutateAsync(fd);
      toastSuccess('Solicitação enviada com sucesso.');
      setForm(FORM_INITIAL);
      setArquivo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setErrors({});
      onSuccess();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'error' in err
          ? String((err as { error: string }).error)
          : 'Erro ao enviar solicitação.';
      toastError(msg);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {/* Tipo */}
      <Select
        label="Tipo de ausência"
        value={form.tipoAusenciaId}
        onChange={(e) => handleChange('tipoAusenciaId', e.target.value)}
        error={errors.tipoAusenciaId}
        placeholder="Selecione..."
        options={tipos.map((t) => ({ value: t.id, label: t.nome }))}
        required
      />

      {tipoSelecionado ? (
        <div className="flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]">
          {tipoSelecionado.requerJustificativa && (
            <span className="rounded-full bg-[var(--color-warning-50)] px-2 py-0.5 text-[var(--color-warning-700)]">
              Exige justificativa
            </span>
          )}
          {tipoSelecionado.requerDocumento && (
            <span className="rounded-full bg-[var(--color-warning-50)] px-2 py-0.5 text-[var(--color-warning-700)]">
              Exige documento
            </span>
          )}
        </div>
      ) : null}

      {/* Datas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Data de início"
          type="date"
          value={form.dataInicio}
          onChange={(e) => handleChange('dataInicio', e.target.value)}
          error={errors.dataInicio}
          required
        />
        <Input
          label="Data de fim"
          type="date"
          value={form.dataFim}
          min={form.dataInicio || undefined}
          onChange={(e) => handleChange('dataFim', e.target.value)}
          error={errors.dataFim}
          required
        />
      </div>

      {/* Período */}
      <Select
        label="Período"
        value={form.periodo}
        onChange={(e) => handleChange('periodo', e.target.value)}
        error={errors.periodo}
        placeholder="Selecione..."
        options={PERIODO_OPTIONS}
        required
      />

      {/* Horas */}
      {form.periodo === 'horas' ? (
        <Input
          label="Horas de ausência"
          type="number"
          min="0.5"
          max="24"
          step="0.5"
          value={form.horasAusencia}
          onChange={(e) => handleChange('horasAusencia', e.target.value)}
          error={errors.horasAusencia}
          required
        />
      ) : null}

      {/* Justificativa */}
      <div className="w-full">
        <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
          Justificativa
          {tipoSelecionado?.requerJustificativa ? (
            <span className="text-[var(--color-error-600)]"> *</span>
          ) : null}
        </label>
        <textarea
          className="w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3.5 py-2 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary-400)] focus:ring-2 focus:ring-[var(--color-primary-100)] disabled:opacity-50"
          rows={3}
          value={form.justificativa}
          onChange={(e) => handleChange('justificativa', e.target.value)}
          required={tipoSelecionado?.requerJustificativa}
          placeholder="Descreva o motivo da ausência..."
        />
        {errors.justificativa ? (
          <p className="mt-1 text-xs text-[var(--color-error-600)]">{errors.justificativa}</p>
        ) : null}
      </div>

      {/* Documento */}
      <div className="w-full">
        <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
          Documento comprobatório
          {tipoSelecionado?.requerDocumento ? (
            <span className="text-[var(--color-error-600)]"> *</span>
          ) : null}
        </label>
        <div className="flex flex-col gap-2">
          {arquivo ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-[var(--color-text-primary)]">
                {arquivo.name}
              </span>
              <button
                type="button"
                onClick={removerArquivo}
                className="shrink-0 text-[var(--color-error-600)] hover:text-[var(--color-error-700)]"
                aria-label="Remover arquivo"
              >
                ✕
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-3 transition-colors hover:border-[var(--color-primary-400)] hover:bg-[var(--color-primary-50)]">
              <span className="text-sm text-[var(--color-text-secondary)]">
                Clique para selecionar ({ALLOWED_EXT_LABEL}, máx. 5 MB)
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                onChange={handleArquivo}
              />
            </label>
          )}
        </div>
        {errors.arquivo ? (
          <p className="mt-1 text-xs text-[var(--color-error-600)]">{errors.arquivo}</p>
        ) : null}
      </div>

      {/* Observações */}
      <div className="w-full">
        <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
          Observações
        </label>
        <textarea
          className="w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3.5 py-2 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-primary-400)] focus:ring-2 focus:ring-[var(--color-primary-100)] disabled:opacity-50"
          rows={2}
          value={form.observacoes}
          onChange={(e) => handleChange('observacoes', e.target.value)}
          placeholder="Informações adicionais (opcional)..."
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          variant="primary"
          loading={criarMutation.isPending}
          disabled={criarMutation.isPending}
        >
          Enviar solicitação
        </Button>
      </div>
    </form>
  );
}

// ─── Componente principal ─────────────────────────────────────

type Tab = 'historico' | 'nova';

export function MinhasAusenciasPage(): JSX.Element {
  const { success: toastSuccess, error: toastError } = useToastHelpers();
  const confirmDialog = useConfirmDialog();

  const [activeTab, setActiveTab] = useState<Tab>('historico');
  const [filters] = useState<ListarMinhasAusenciasParams>({});
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  const tiposQuery = useTiposAusencia();
  const ausenciasQuery = useMinhasAusencias(filters);
  const cancelarMutation = useCancelarMinhaAusencia();

  const tipos = (tiposQuery.data?.tipos ?? []).filter((t) => t.ativo);
  const ausencias = ausenciasQuery.data?.itens ?? [];

  // Client-side filter + sort most-recent-first
  const ausenciasFiltradas = ausencias
    .filter((a) => (filtroStatus ? a.status === filtroStatus : true))
    .filter((a) => (filtroTipo ? a.tipoAusenciaId === filtroTipo : true))
    .slice()
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());

  // Unique tipos from loaded ausências for the filter select
  const tiposPresentes = Array.from(
    new Map(ausencias.map((a) => [a.tipoAusenciaId, a.tipoAusenciaNome])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  function handleCancelar(item: MinhaAusenciaItem): void {
    confirmDialog.confirm({
      title: 'Cancelar solicitação',
      message: `Deseja cancelar a solicitação de "${item.tipoAusenciaNome}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Cancelar solicitação',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await cancelarMutation.mutateAsync({
            id: item.id,
            body: { motivo: 'Cancelado pelo colaborador' },
          });
          toastSuccess('Solicitação cancelada.');
        } catch (err: unknown) {
          const msg =
            err && typeof err === 'object' && 'error' in err
              ? String((err as { error: string }).error)
              : 'Erro ao cancelar solicitação.';
          toastError(msg);
        }
      },
    });
  }

  function handleNovaSolicitacaoSuccess(): void {
    setActiveTab('historico');
  }

  const tabClass = (tab: Tab): string =>
    `px-4 py-2.5 text-sm font-medium transition-colors rounded-t-xl border-b-2 ${
      activeTab === tab
        ? 'border-[var(--color-primary-600)] text-[var(--color-primary-700)] bg-[var(--color-primary-50)]'
        : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gray-50)]'
    }`;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Justificativas de Ausência"
        subtitle="Consulte suas solicitações ou registre uma nova ausência."
        actions={
          activeTab === 'historico' ? (
            <Button
              variant="primary"
              icon="plus"
              size="sm"
              onClick={() => setActiveTab('nova')}
            >
              Nova solicitação
            </Button>
          ) : undefined
        }
      />

      {/* Abas */}
      <div className="flex gap-1 border-b border-[var(--color-border-primary)]">
        <button className={tabClass('historico')} onClick={() => setActiveTab('historico')}>
          Histórico
        </button>
        <button className={tabClass('nova')} onClick={() => setActiveTab('nova')}>
          Nova Solicitação
        </button>
      </div>

      {/* Aba Histórico */}
      {activeTab === 'historico' ? (
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
                  title: 'Nenhuma solicitação',
                  description: 'Você ainda não registrou nenhuma justificativa de ausência.',
                  action: {
                    label: 'Nova solicitação',
                    onClick: () => setActiveTab('nova'),
                  },
                }
              : null
          }
        >
          {/* Filtros client-side */}
          {ausencias.length > 0 && (
            <div className="flex flex-wrap gap-3 pb-3">
              <div className="flex-1 min-w-[140px]">
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
              {tiposPresentes.length > 1 && (
                <div className="flex-1 min-w-[160px]">
                  <select
                    className="w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary-400)] focus:ring-2 focus:ring-[var(--color-primary-100)]"
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value)}
                    aria-label="Filtrar por tipo"
                  >
                    <option value="">Todos os tipos</option>
                    {tiposPresentes.map(([id, nome]) => (
                      <option key={id} value={id}>{nome}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          <div className="space-y-3">
            {ausenciasFiltradas.length === 0 && ausencias.length > 0 ? (
              <p className="py-6 text-center text-sm text-[var(--color-text-tertiary)]">
                Nenhuma solicitação encontrada para os filtros selecionados.
              </p>
            ) : null}
            {ausenciasFiltradas.map((item) => (
              <AusenciaCard
                key={item.id}
                item={item}
                onCancelar={handleCancelar}
              />
            ))}
          </div>
        </PageState>
      ) : null}

      {/* Aba Nova Solicitação */}
      {activeTab === 'nova' ? (
        <Card className="p-4 sm:p-6">
          <PageState
            loading={tiposQuery.isLoading}
            loadingMessage="Carregando tipos de ausência..."
            error={
              tiposQuery.isError
                ? {
                    message: 'Não foi possível carregar os tipos de ausência.',
                    action: { label: 'Tentar novamente', onClick: () => void tiposQuery.refetch() },
                  }
                : null
            }
            empty={
              tipos.length === 0 && !tiposQuery.isLoading && !tiposQuery.isError
                ? {
                    icon: 'calendar',
                    title: 'Nenhum tipo disponível',
                    description: 'Não há tipos de ausência ativos no momento.',
                  }
                : null
            }
          >
            <NovaSolicitacaoForm tipos={tipos} onSuccess={handleNovaSolicitacaoSuccess} />
          </PageState>
        </Card>
      ) : null}

      <ConfirmDialog
        state={confirmDialog.state}
        loading={confirmDialog.loading}
        onConfirm={() => void confirmDialog.handleConfirm()}
        onCancel={confirmDialog.close}
      />
    </div>
  );
}
