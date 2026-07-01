import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Select';
import { FilterBar } from '../../components/ui/FilterBar';
import { api } from '../../services/api';
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
import { Pagination } from '../../components/ui/Pagination';
import { useToastHelpers } from '../../components/ui/Toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useDebounce } from '../../hooks/useDebounce';
import { formatDateBR } from '../../utils/date';
import {
  useAusenciasAdmin,
  useAprovarAusencia,
  useQueryClient,
  useRejeitarAusencia,
  useUsuariosColaboradores,
  useTiposAusencia,
  useCriarAusenciaAdmin,
  useCancelarAusenciaAdmin,
  useEditarAusenciaAdmin,
  useBackfillAusenciasAnexos,
  useCriarJustificativaColetivaAdmin,
  useEditarJustificativaColetivaAdmin,
  useJustificativasColetivasAdmin,
} from '../../hooks/useQueries';
import type {
  AusenciaAdminItem,
  JustificativaColetivaItem,
  ListarAusenciasAdminParams,
  TipoAusencia,
} from '@recorda/shared';

const STATUS_OPTIONS = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'rejeitado', label: 'Rejeitado' },
  { value: 'cancelado', label: 'Cancelado' },
] as const;

const STATUS_LANCAMENTO_OPTIONS = [
  { value: 'pendente', label: 'Pendente (aguarda aprovação)' },
  { value: 'aprovado', label: 'Aprovado (lançamento direto)' },
] as const;

const PERIODO_OPTIONS = [
  { value: 'dia_completo', label: 'Dia completo' },
  { value: 'meio_periodo_manha', label: 'Meio período (manhã)' },
  { value: 'meio_periodo_tarde', label: 'Meio período (tarde)' },
  { value: 'horas', label: 'Por horas' },
] as const;

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXT_LABEL = 'PDF, JPG ou PNG — máx. 5 MB';

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  cancelado: 'Cancelado',
};

const statusBadgeClass: Record<string, string> = {
  pendente: 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)]',
  aprovado: 'bg-[var(--color-success-50)] text-[var(--color-success-700)]',
  rejeitado: 'bg-[var(--color-error-50)] text-[var(--color-error-700)]',
  cancelado: 'bg-[var(--color-gray-100)] text-[var(--color-text-secondary)]',
};

interface BackfillResumo {
  total: number;
  atualizados: number;
  ignorados: number;
  erros: Array<{ id: string; motivo: string }>;
}

function getAusenciaColorClass(cor: string): string {
  switch (cor.toUpperCase()) {
    case '#10B981':
      return 'bg-[#10B981]';
    case '#EF4444':
      return 'bg-[#EF4444]';
    case '#3B82F6':
      return 'bg-[#3B82F6]';
    case '#8B5CF6':
      return 'bg-[#8B5CF6]';
    case '#EC4899':
      return 'bg-[#EC4899]';
    case '#06B6D4':
      return 'bg-[#06B6D4]';
    case '#F59E0B':
      return 'bg-[#F59E0B]';
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

function formatDate(value: string | undefined | null): string {
  return formatDateBR(value);
}

function getPeriodoLabel(periodo: string): string {
  switch (periodo) {
    case 'dia_completo':
      return 'Dia completo';
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

// ─── Lançar Ausência Modal ────────────────────────────────────────────────────

interface LancarAusenciaModalProps {
  open: boolean;
  onClose: () => void;
  colaboradores: { id: string; nome: string; email: string; perfil?: string }[];
  tipos: TipoAusencia[];
  initialData?: AusenciaAdminItem | null;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

function LancarAusenciaModal({
  open,
  onClose,
  colaboradores,
  tipos,
  initialData,
  onSuccess,
  onError,
}: LancarAusenciaModalProps): JSX.Element {
  const criarMutation = useCriarAusenciaAdmin();
  const editarMutation = useEditarAusenciaAdmin();
  const fileRef = useRef<HTMLInputElement>(null);

  const [usuarioId, setUsuarioId] = useState('');
  const [tipoAusenciaId, setTipoAusenciaId] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [periodo, setPeriodo] = useState<
    'dia_completo' | 'meio_periodo_manha' | 'meio_periodo_tarde' | 'horas'
  >('dia_completo');
  const [horasAusencia, setHorasAusencia] = useState('');
  const [statusInicial, setStatusInicial] = useState<'pendente' | 'aprovado'>('pendente');
  const [justificativa, setJustificativa] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arquivoErro, setArquivoErro] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});

  const tipoSelecionado = tipos.find((t) => t.id === tipoAusenciaId) ?? null;
  useEffect(() => {
    if (!open) return;

    if (initialData) {
      setUsuarioId(initialData.usuarioId);
      setTipoAusenciaId(initialData.tipoAusenciaId);
      setDataInicio(initialData.dataInicio);
      setDataFim(initialData.dataFim);
      setPeriodo(initialData.periodo);
      setHorasAusencia(initialData.horasAusencia ? String(initialData.horasAusencia) : '');
      setStatusInicial(initialData.status === 'aprovado' ? 'aprovado' : 'pendente');
      setJustificativa(initialData.justificativa ?? '');
      setObservacoes(initialData.observacoes ?? '');
      setArquivo(null);
      setArquivoErro('');
      setErros({});
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    resetForm();
  }, [open, initialData]);

  function resetForm(): void {
    setUsuarioId('');
    setTipoAusenciaId('');
    setDataInicio('');
    setDataFim('');
    setPeriodo('dia_completo');
    setHorasAusencia('');
    setStatusInicial('pendente');
    setJustificativa('');
    setObservacoes('');
    setArquivo(null);
    setArquivoErro('');
    setErros({});
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleClose(): void {
    resetForm();
    onClose();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setArquivo(null);
      setArquivoErro('');
      return;
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      setArquivo(null);
      setArquivoErro(`Formato inválido. Aceito: ${ALLOWED_EXT_LABEL}`);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setArquivo(null);
      setArquivoErro('Arquivo muito grande. Máximo permitido: 5 MB.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setArquivo(file);
    setArquivoErro('');
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!usuarioId) e.usuarioId = 'Selecione um colaborador.';
    if (!tipoAusenciaId) e.tipoAusenciaId = 'Selecione o tipo de ausência.';
    if (!dataInicio) e.dataInicio = 'Informe a data de início.';
    if (!dataFim) e.dataFim = 'Informe a data de fim.';
    if (dataInicio && dataFim && dataFim < dataInicio)
      e.dataFim = 'Data fim não pode ser anterior à data início.';
    if (periodo === 'horas') {
      const h = Number(horasAusencia);
      if (!horasAusencia || isNaN(h) || h <= 0 || h > 24)
        e.horasAusencia = 'Informe um valor entre 0.5 e 24.';
    }
    if (tipoSelecionado?.requerJustificativa && !justificativa.trim()) {
      e.justificativa = 'Este tipo exige justificativa.';
    }
    if (tipoSelecionado?.requerDocumento && !arquivo) {
      if (!observacoes.trim() && !initialData?.documentoAnexo) {
        e.observacoes =
          'Este tipo exige documento. Sem anexo, forneça observação explicando o motivo.';
      }
    }
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!validate()) return;

    const payload = new FormData();
    payload.set('usuarioId', usuarioId);
    payload.set('tipoAusenciaId', tipoAusenciaId);
    payload.set('dataInicio', dataInicio);
    payload.set('dataFim', dataFim);
    payload.set('periodo', periodo);
    if (periodo === 'horas' && horasAusencia) payload.set('horasAusencia', horasAusencia);
    payload.set('status', statusInicial);
    if (justificativa.trim()) payload.set('justificativa', justificativa.trim());
    if (observacoes.trim()) payload.set('observacoes', observacoes.trim());
    if (arquivo) payload.set('documento', arquivo, arquivo.name);

    try {
      if (initialData) {
        await editarMutation.mutateAsync({ id: initialData.id, payload });
        onSuccess('Ausencia atualizada com sucesso.');
      } else {
        await criarMutation.mutateAsync(payload);
        const label = statusInicial === 'aprovado' ? 'aprovada' : 'registrada como pendente';
      onSuccess(`Ausência ${label} com sucesso.`);
      }
      handleClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'error' in err
          ? String((err as { error: string }).error)
          : 'Erro ao registrar ausência.';
      onError(msg);
    }
  }

  const isSaving = criarMutation.status === 'pending' || editarMutation.status === 'pending';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Lançar Ausência"
      subtitle="Registre uma ausência."
      size="lg"
      scrollable
    >
      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div className="space-y-4 p-5">
          {/* Colaborador */}
          <div>
            <Select
              label="Colaborador *"
              value={usuarioId}
              onChange={(e) => setUsuarioId(e.target.value)}
              options={[
                { value: '', label: 'Selecione um colaborador' },
                ...colaboradores.map((u) => ({
                  value: u.id,
                  label: `${u.nome} (${u.email})${u.perfil ? ` • ${u.perfil}` : ''}`,
                })),
              ]}
            />
            {erros.usuarioId ? (
              <p className="mt-1 text-xs text-[var(--color-error-600)]">{erros.usuarioId}</p>
            ) : null}
          </div>

          {/* Tipo de ausência */}
          <div>
            <Select
              label="Tipo de Ausência *"
              value={tipoAusenciaId}
              onChange={(e) => setTipoAusenciaId(e.target.value)}
              options={[
                { value: '', label: 'Selecione o tipo' },
                ...tipos.map((t) => ({ value: t.id, label: t.nome })),
              ]}
            />
            {erros.tipoAusenciaId ? (
              <p className="mt-1 text-xs text-[var(--color-error-600)]">{erros.tipoAusenciaId}</p>
            ) : null}
            {tipoSelecionado ? (
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                {tipoSelecionado.requerJustificativa ? '⚠ Exige justificativa. ' : ''}
                {tipoSelecionado.requerDocumento ? '⚠ Exige documento. ' : ''}
                {tipoSelecionado.descontaSalario ? '⚠ Desconta salário.' : ''}
              </p>
            ) : null}
          </div>

          {/* Datas */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input
                label="Data de Início *"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
              {erros.dataInicio ? (
                <p className="mt-1 text-xs text-[var(--color-error-600)]">{erros.dataInicio}</p>
              ) : null}
            </div>
            <div>
              <Input
                label="Data de Fim *"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
              {erros.dataFim ? (
                <p className="mt-1 text-xs text-[var(--color-error-600)]">{erros.dataFim}</p>
              ) : null}
            </div>
          </div>

          {/* Período + Horas */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Select
                label="Período *"
                value={periodo}
                onChange={(e) =>
                  setPeriodo(
                    e.target.value as
                      | 'dia_completo'
                      | 'meio_periodo_manha'
                      | 'meio_periodo_tarde'
                      | 'horas'
                  )
                }
                options={PERIODO_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>
            {periodo === 'horas' ? (
              <div>
                <Input
                  label="Horas de Ausência *"
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={horasAusencia}
                  onChange={(e) => setHorasAusencia(e.target.value)}
                  placeholder="Ex: 4"
                />
                {erros.horasAusencia ? (
                  <p className="mt-1 text-xs text-[var(--color-error-600)]">
                    {erros.horasAusencia}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Status inicial */}
          <div>
            <Select
              label="Status Inicial *"
              value={statusInicial}
              onChange={(e) => setStatusInicial(e.target.value as 'pendente' | 'aprovado')}
              options={STATUS_LANCAMENTO_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            {statusInicial === 'aprovado' ? (
              <p className="mt-1 text-xs font-medium text-[var(--color-success-700)]">
                A ausência será registrada como já aprovada.
              </p>
            ) : null}
          </div>

          {/* Justificativa */}
          <div>
            <label
              htmlFor="justificativa-ausencia"
              className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]"
            >
              Justificativa{tipoSelecionado?.requerJustificativa ? ' *' : ''}
            </label>
            <textarea
              id="justificativa-ausencia"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-primary-600)] focus:ring-2 focus:ring-[var(--color-primary-200)]"
              placeholder="Justificativa da ausência"
            />
            {erros.justificativa ? (
              <p className="mt-1 text-xs text-[var(--color-error-600)]">{erros.justificativa}</p>
            ) : null}
          </div>

          {/* Documento anexo */}
          <div>
            <label
              htmlFor="documento-anexo-ausencia"
              className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]"
            >
              Documento anexo
              {tipoSelecionado?.requerDocumento ? ' (exigido pelo tipo)' : ' (opcional)'}
            </label>
            <input
              id="documento-anexo-ausencia"
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              className="block w-full text-sm text-[var(--color-text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-primary-50)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--color-primary-700)] hover:file:bg-[var(--color-primary-100)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{ALLOWED_EXT_LABEL}</p>
            {arquivo ? (
              <p className="mt-1 text-xs text-[var(--color-success-700)]">
                Arquivo selecionado: {arquivo.name}
              </p>
            ) : null}
            {arquivoErro ? (
              <p className="mt-1 text-xs text-[var(--color-error-600)]">{arquivoErro}</p>
            ) : null}
          </div>

          {/* Observações */}
          <div>
            <label
              htmlFor="observacoes-ausencia"
              className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]"
            >
              Observações
              {tipoSelecionado?.requerDocumento && !arquivo
                ? ' * (obrigatória sem anexo)'
                : ' (opcional)'}
            </label>
            <textarea
              id="observacoes-ausencia"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-primary-600)] focus:ring-2 focus:ring-[var(--color-primary-200)]"
              placeholder="Observações administrativas"
            />
            {erros.observacoes ? (
              <p className="mt-1 text-xs text-[var(--color-error-600)]">{erros.observacoes}</p>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border-primary)] px-5 py-4">
          <Button variant="secondary" type="button" onClick={handleClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" loading={isSaving}>
            Registrar ausência
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface JustificativaColetivaModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  initialData?: JustificativaColetivaItem | null;
}

function JustificativaColetivaModal({
  open,
  onClose,
  onSuccess,
  onError,
  initialData,
}: JustificativaColetivaModalProps): JSX.Element {
  const criarMutation = useCriarJustificativaColetivaAdmin();
  const editarMutation = useEditarJustificativaColetivaAdmin();
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDataInicio(initialData?.dataInicio ?? '');
    setDataFim(initialData?.dataFim ?? '');
    setDescricao(initialData?.descricao ?? '');
    setErros({});
  }, [open, initialData]);

  function handleClose(): void {
    setDataInicio('');
    setDataFim('');
    setDescricao('');
    setErros({});
    onClose();
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!dataInicio) next.dataInicio = 'Informe a data de início.';
    if (!dataFim) next.dataFim = 'Informe a data de fim.';
    if (dataInicio && dataFim && dataFim < dataInicio) {
      next.dataFim = 'Data fim não pode ser anterior à data início.';
    }
    if (!descricao.trim()) next.descricao = 'Informe a justificativa coletiva.';
    setErros(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!validate()) return;

    try {
      const payload = {
        dataInicio,
        dataFim,
        descricao: descricao.trim(),
      };
      if (initialData) {
        await editarMutation.mutateAsync({ id: initialData.id, payload });
        onSuccess('Justificativa coletiva atualizada com sucesso.');
      } else {
        await criarMutation.mutateAsync(payload);
        onSuccess('Justificativa coletiva registrada com sucesso.');
      }
      handleClose();
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'error' in error
          ? String((error as { error: string }).error)
          : initialData
            ? 'Erro ao atualizar justificativa coletiva.'
            : 'Erro ao registrar justificativa coletiva.';
      onError(message);
    }
  }

  const isSaving = criarMutation.status === 'pending' || editarMutation.status === 'pending';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={initialData ? 'Editar Justificativa Coletiva' : 'Cadastrar Justificativa Coletiva'}
      subtitle="Use este cadastro para eventos administrativos que impactam o relatório de ausências como um todo."
      size="lg"
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input
                label="Data de Início *"
                type="date"
                value={dataInicio}
                onChange={(event) => setDataInicio(event.target.value)}
              />
              {erros.dataInicio ? (
                <p className="mt-1 text-xs text-[var(--color-error-600)]">{erros.dataInicio}</p>
              ) : null}
            </div>
            <div>
              <Input
                label="Data de Fim *"
                type="date"
                value={dataFim}
                onChange={(event) => setDataFim(event.target.value)}
              />
              {erros.dataFim ? (
                <p className="mt-1 text-xs text-[var(--color-error-600)]">{erros.dataFim}</p>
              ) : null}
            </div>
          </div>

          <div>
            <label
              htmlFor="descricao-justificativa-coletiva"
              className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]"
            >
              Justificativa Coletiva *
            </label>
            <textarea
              id="descricao-justificativa-coletiva"
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-primary-600)] focus:ring-2 focus:ring-[var(--color-primary-200)]"
              placeholder="Ex.: Liberação geral da equipe no período da tarde por manutenção elétrica."
            />
            {erros.descricao ? (
              <p className="mt-1 text-xs text-[var(--color-error-600)]">{erros.descricao}</p>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border-primary)] px-5 py-4">
          <Button
            variant="secondary"
            type="button"
            onClick={handleClose}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button variant="primary" type="submit" loading={isSaving}>
            {initialData ? 'Salvar alterações' : 'Salvar justificativa'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function AusenciasPage(): JSX.Element {
  const [filters, setFilters] = useState<ListarAusenciasAdminParams>({
    pagina: 1,
    limite: 20,
    status: 'TODOS',
    busca: undefined,
    usuarioId: undefined,
  });
  const [buscaInput, setBuscaInput] = useState('');
  const debouncedBusca = useDebounce(buscaInput, 600);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [rejeicaoAberta, setRejeicaoAberta] = useState(false);
  const [lancamentoAberto, setLancamentoAberto] = useState(false);
  const [justificativaColetivaAberta, setJustificativaColetivaAberta] = useState(false);
  const [justificativaColetivaSelecionada, setJustificativaColetivaSelecionada] =
    useState<JustificativaColetivaItem | null>(null);
  const [edicaoAberta, setEdicaoAberta] = useState(false);
  const [cancelamentoAberto, setCancelamentoAberto] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [selecionada, setSelecionada] = useState<AusenciaAdminItem | null>(null);
  const [mensagemAcao, setMensagemAcao] = useState<{
    tipo: 'success' | 'error' | 'warning';
    texto: string;
  } | null>(null);
  const [backfillResumo, setBackfillResumo] = useState<BackfillResumo | null>(null);

  const queryClient = useQueryClient();
  const toast = useToastHelpers();
  const confirmDialog = useConfirmDialog();
  const usuariosQuery = useUsuariosColaboradores();
  const tiposQuery = useTiposAusencia();
  const ausenciasQuery = useAusenciasAdmin(filters);
  const justificativasColetivasQuery = useJustificativasColetivasAdmin({
    dataInicio: filters.dataInicio,
    dataFim: filters.dataFim,
  });
  const aprovarAusencia = useAprovarAusencia();
  const rejeitarAusencia = useRejeitarAusencia();
  const cancelarAusencia = useCancelarAusenciaAdmin();
  const backfillAnexos = useBackfillAusenciasAnexos();

  const ausencias = useMemo<AusenciaAdminItem[]>(
    () => ausenciasQuery.data?.itens ?? [],
    [ausenciasQuery.data]
  );
  const justificativasColetivas = useMemo<JustificativaColetivaItem[]>(
    () => justificativasColetivasQuery.data?.itens ?? [],
    [justificativasColetivasQuery.data]
  );
  const total = ausenciasQuery.data?.total ?? 0;
  const totalPaginas = ausenciasQuery.data?.totalPaginas ?? 1;
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

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      busca: debouncedBusca || undefined,
      pagina: 1,
    }));
  }, [debouncedBusca]);

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
          const message = error instanceof Error ? error.message : 'Erro ao aprovar ausência';
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
      const message = error instanceof Error ? error.message : 'Erro ao rejeitar ausência';
      setMensagemAcao({ tipo: 'error', texto: message });
    }
  };

  const handleFecharRejeicao = (): void => {
    setRejeicaoAberta(false);
    setSelecionada(null);
    setMotivoRejeicao('');
  };

  const handleAbrirCancelamento = (ausencia: AusenciaAdminItem): void => {
    setSelecionada(ausencia);
    setMotivoCancelamento('');
    setCancelamentoAberto(true);
  };

  const handleAbrirEdicao = (ausencia: AusenciaAdminItem): void => {
    setSelecionada(ausencia);
    setEdicaoAberta(true);
  };

  const handleAbrirJustificativaColetiva = (item?: JustificativaColetivaItem): void => {
    setJustificativaColetivaSelecionada(item ?? null);
    setJustificativaColetivaAberta(true);
  };

  const handleBackfillAnexos = (): void => {
    confirmDialog.confirm({
      title: 'Converter anexos legados',
      message:
        'Esta ação converte anexos antigos para o formato persistido no banco. Registros já convertidos serão ignorados. Deseja continuar?',
      confirmLabel: 'Converter',
      variant: 'default',
      onConfirm: async () => {
        try {
          const result = await backfillAnexos.mutateAsync();
          setBackfillResumo(result);
          setMensagemAcao({
            tipo: result.erros.length > 0 ? 'warning' : 'success',
            texto: `Backfill concluído: ${result.atualizados} atualizados, ${result.ignorados} ignorados.`,
          });
          await invalidarAusencias();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao converter anexos legados';
          setMensagemAcao({ tipo: 'error', texto: message });
        }
      },
    });
  };

  const handleFecharEdicao = (): void => {
    setEdicaoAberta(false);
    setSelecionada(null);
  };

  const handleFecharJustificativaColetiva = (): void => {
    setJustificativaColetivaAberta(false);
    setJustificativaColetivaSelecionada(null);
  };

  const handleFecharCancelamento = (): void => {
    setCancelamentoAberto(false);
    setSelecionada(null);
    setMotivoCancelamento('');
  };

  const handleConfirmarCancelamento = async (): Promise<void> => {
    if (!selecionada) return;
    if (!motivoCancelamento.trim()) {
      toast.error('Informe o motivo do cancelamento.');
      return;
    }
    try {
      await cancelarAusencia.mutateAsync({
        id: selecionada.id,
        body: { observacoes: motivoCancelamento.trim() },
      });
      setMensagemAcao({ tipo: 'success', texto: 'Ausência cancelada com sucesso.' });
      handleFecharCancelamento();
      await invalidarAusencias();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao cancelar ausência';
      setMensagemAcao({ tipo: 'error', texto: message });
    }
  };

  return (
    <PageState loading={carregando} loadingMessage="Carregando ausências..." error={erro}>
      <div className="space-y-6">
        <PageHeader
          title="Ausências"
          subtitle="Lançamentos da equipe."
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => void handleBackfillAnexos()}
                loading={backfillAnexos.isPending}
                disabled={backfillAnexos.isPending || carregando}
              >
                Converter anexos
              </Button>
              <Button variant="primary" onClick={() => setLancamentoAberto(true)}>
                Lançar Ausência
              </Button>
              <Button variant="secondary" onClick={() => handleAbrirJustificativaColetiva()}>
                Justificativa Coletiva
              </Button>
            </>
          }
        />

        {mensagemAcao ? (
          <ActionFeedback
            type={mensagemAcao.tipo}
            title={mensagemAcao.tipo === 'success' ? 'Operação concluída' : 'Ação não concluída'}
            message={mensagemAcao.texto}
            onDismiss={() => setMensagemAcao(null)}
          />
        ) : null}

        {backfillResumo ? (
          <Card padding="md" className="border-[var(--color-primary-200)] bg-[var(--color-primary-50)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--color-primary-900)]">
                  Último backfill de anexos
                </h2>
                <p className="mt-1 text-sm text-[var(--color-primary-700)]">
                  Total processado: {backfillResumo.total}. Atualizados: {backfillResumo.atualizados}.
                  Ignorados: {backfillResumo.ignorados}.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setBackfillResumo(null)}>
                  Limpar resumo
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleBackfillAnexos()}
                  loading={backfillAnexos.isPending}
                  disabled={backfillAnexos.isPending || carregando}
                >
                  Reexecutar
                </Button>
              </div>
            </div>

            {backfillResumo.erros.length > 0 ? (
              <div className="mt-4 rounded-xl border border-[var(--color-warning-200)] bg-[var(--color-warning-50)] p-4">
                <p className="text-sm font-semibold text-[var(--color-warning-800)]">
                  Registros ignorados
                </p>
                <ul className="mt-2 space-y-2 text-sm text-[var(--color-warning-700)]">
                  {backfillResumo.erros.slice(0, 5).map((erro) => (
                    <li key={erro.id} className="break-words">
                      <strong className="font-medium">{erro.id}</strong>: {erro.motivo}
                    </li>
                  ))}
                </ul>
                {backfillResumo.erros.length > 5 ? (
                  <p className="mt-2 text-xs text-[var(--color-warning-700)]">
                    Exibindo 5 de {backfillResumo.erros.length} erros.
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card padding="sm" className="bg-[var(--color-bg-secondary)]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-[var(--color-text-secondary)]">
              Resultados <strong className="text-[var(--color-text-primary)]">{total}</strong>
            </span>
            <span className="text-[var(--color-text-secondary)]">
              Pendentes{' '}
              <strong className="text-[var(--color-warning-700)]">{resumo.pendentes}</strong>
            </span>
            <span className="text-[var(--color-text-secondary)]">
              Aprovadas{' '}
              <strong className="text-[var(--color-success-700)]">{resumo.aprovadas}</strong>
            </span>
            <span className="text-[var(--color-text-secondary)]">
              Rejeitadas{' '}
              <strong className="text-[var(--color-error-700)]">{resumo.rejeitadas}</strong>
            </span>
          </div>
        </Card>

        {justificativasColetivas.length > 0 ? (
          <Card padding="none">
            <CardHeader title="Justificativas Coletivas" className="px-5 pt-5" />
            <div className="space-y-3 px-5 pb-5">
              {justificativasColetivas.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--color-primary-200)] bg-[var(--color-primary-50)] p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <p className="text-sm font-semibold text-[var(--color-primary-950)]">
                      {formatDate(item.dataInicio)}
                      {item.dataInicio !== item.dataFim ? ` até ${formatDate(item.dataFim)}` : ''}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-[var(--color-primary-700)]">
                        Registrado por {item.criadoPorNome}
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleAbrirJustificativaColetiva(item)}
                      >
                        Editar
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-primary-900)]">{item.descricao}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <FilterBar
          actions={
            <Button variant="secondary" onClick={() => void invalidarAusencias()}>
              Atualizar lista
            </Button>
          }
        >
          <Input
            label="Buscar"
            value={buscaInput}
            onChange={(event) => setBuscaInput(event.target.value)}
            placeholder="Colaborador, justificativa ou observações"
          />
          <Select
            label="Colaborador"
            value={filters.usuarioId ?? ''}
            onChange={(event) => handleFilterChange('usuarioId', event.target.value)}
            options={[{ value: '', label: 'Todos' }].concat(
              usuariosQuery.data?.map((usuario) => ({
                value: usuario.id,
                label: `${usuario.nome} (${usuario.email})${usuario.perfil ? ` • ${usuario.perfil}` : ''}`,
              })) ?? []
            )}
            disabled={usuariosQuery.isLoading}
            placeholder="Todos"
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
            label="Início"
            type="date"
            value={filters.dataInicio ?? ''}
            onChange={(event) => handleFilterChange('dataInicio', event.target.value)}
          />
          <Input
            label="Fim"
            type="date"
            value={filters.dataFim ?? ''}
            onChange={(event) => handleFilterChange('dataFim', event.target.value)}
          />
        </FilterBar>

        <Card padding="none">
          <CardHeader title="Solicitações" className="px-5 pt-5" />
          <Table>
            <TableHead>
              <tr>
                <TableHeader>Colaborador</TableHeader>
                <TableHeader>Tipo</TableHeader>
                <TableHeader>Período</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader className="hidden sm:table-cell">Justificativa / Motivo</TableHeader>
                <TableHeader align="right">Ações</TableHeader>
              </tr>
            </TableHead>
            <TableBody>
              {ausencias.length === 0 ? (
                <TableEmptyState
                  colSpan={6}
                  title="Nenhuma ausência encontrada"
                  description="Ajuste os filtros."
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
                      <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-gray-100)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${getAusenciaColorClass(
                            ausencia.tipoAusenciaCor
                          )}`}
                        />
                        {ausencia.tipoAusenciaNome}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        <p>{formatDate(ausencia.dataInicio)}</p>
                        <p>{formatDate(ausencia.dataFim)}</p>
                        <p>
                          {getPeriodoLabel(ausencia.periodo)}
                          {ausencia.periodo === 'horas' && ausencia.horasAusencia
                            ? ` — ${ausencia.horasAusencia}h`
                            : ''}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass[ausencia.status] ?? ''}`}
                        >
                          {STATUS_LABELS[ausencia.status] ?? ausencia.status}
                        </span>
                        {(ausencia.status === 'aprovado' || ausencia.status === 'rejeitado') &&
                        ausencia.aprovadoEm ? (
                          <p className="text-xs text-[var(--color-text-tertiary)]">
                            {formatDateBR(ausencia.aprovadoEm)}
                          </p>
                        ) : null}
                        {ausencia.documentoAnexo ? (
                          <button
                            type="button"
                            onClick={() =>
                              void api.openAnexo(`/admin/ausencias/${ausencia.id}/anexo`)
                            }
                            className="text-xs font-medium text-[var(--color-primary-700)] underline underline-offset-2 hover:text-[var(--color-primary-900)] transition-colors"
                          >
                            📎 Ver anexo
                          </button>
                        ) : null}
                        <div className="sm:hidden">
                          {ausencia.status === 'rejeitado' ? (
                            <p
                              className="mt-2 text-xs text-[var(--color-error-600)]"
                              title={ausencia.motivoRejeicao ?? undefined}
                            >
                              {ausencia.motivoRejeicao ?? '-'}
                            </p>
                          ) : (
                            <p
                              className="mt-2 text-xs text-[var(--color-text-secondary)]"
                              title={ausencia.justificativa ?? ausencia.observacoes ?? undefined}
                            >
                              {ausencia.justificativa ?? ausencia.observacoes ?? '-'}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell hideOnMobile>
                      {ausencia.status === 'rejeitado' ? (
                        <p
                          className="truncate text-sm text-[var(--color-error-600)]"
                          title={ausencia.motivoRejeicao ?? undefined}
                        >
                          {ausencia.motivoRejeicao ?? '-'}
                        </p>
                      ) : (
                        <p
                          className="truncate text-sm text-[var(--color-text-secondary)]"
                          title={ausencia.justificativa ?? ausencia.observacoes ?? undefined}
                        >
                          {ausencia.justificativa ?? ausencia.observacoes ?? '-'}
                        </p>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex justify-end gap-2">
                        {ausencia.status === 'pendente' ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleAbrirEdicao(ausencia)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => handleAprovar(ausencia)}
                            >
                              Aprovar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAbrirRejeicao(ausencia)}
                            >
                              Rejeitar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAbrirCancelamento(ausencia)}
                            >
                              Cancelar
                            </Button>
                          </>
                        ) : ausencia.status === 'aprovado' ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleAbrirEdicao(ausencia)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleAbrirCancelamento(ausencia)}
                            >
                              Cancelar
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
          {totalPaginas > 1 && (
            <div className="px-5 py-4 border-t border-[var(--color-border-primary)]">
              <Pagination
                pagina={filters.pagina ?? 1}
                totalPaginas={totalPaginas}
                onChange={(p) => setFilters((prev) => ({ ...prev, pagina: p }))}
                disabled={carregando}
              />
            </div>
          )}
        </Card>

        <Modal
          open={rejeicaoAberta}
          onClose={handleFecharRejeicao}
          title="Rejeitar Ausência"
          subtitle={
            selecionada
              ? `${selecionada.usuarioNome} • ${formatDate(selecionada.dataInicio)} até ${formatDate(selecionada.dataFim)}`
              : undefined
          }
          size="md"
        >
          <div className="space-y-4 p-5">
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

        <Modal
          open={cancelamentoAberto}
          onClose={handleFecharCancelamento}
          title="Cancelar Ausência"
          subtitle={
            selecionada
              ? `${selecionada.usuarioNome} • ${formatDate(selecionada.dataInicio)} até ${formatDate(selecionada.dataFim)}`
              : undefined
          }
          size="md"
        >
          <div className="space-y-4 p-5">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Esta ação não pode ser desfeita.
            </p>
            <textarea
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-primary-600)] focus:ring-2 focus:ring-[var(--color-primary-200)]"
              placeholder="Motivo do cancelamento"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handleFecharCancelamento}>
                Voltar
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleConfirmarCancelamento()}
                loading={cancelarAusencia.status === 'pending'}
              >
                Confirmar cancelamento
              </Button>
            </div>
          </div>
        </Modal>

        <LancarAusenciaModal
          open={lancamentoAberto}
          onClose={() => setLancamentoAberto(false)}
          colaboradores={usuariosQuery.data ?? []}
          tipos={(tiposQuery.data?.tipos ?? []).filter((t) => t.ativo)}
          onSuccess={(msg) => setMensagemAcao({ tipo: 'success', texto: msg })}
          onError={(msg) => setMensagemAcao({ tipo: 'error', texto: msg })}
        />

        <JustificativaColetivaModal
          open={justificativaColetivaAberta}
          onClose={handleFecharJustificativaColetiva}
          initialData={justificativaColetivaSelecionada}
          onSuccess={(msg) => setMensagemAcao({ tipo: 'success', texto: msg })}
          onError={(msg) => setMensagemAcao({ tipo: 'error', texto: msg })}
        />

        <LancarAusenciaModal
          open={edicaoAberta}
          onClose={handleFecharEdicao}
          colaboradores={usuariosQuery.data ?? []}
          tipos={(tiposQuery.data?.tipos ?? []).filter((t) => t.ativo)}
          initialData={selecionada}
          onSuccess={(msg) => setMensagemAcao({ tipo: 'success', texto: msg })}
          onError={(msg) => setMensagemAcao({ tipo: 'error', texto: msg })}
        />

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
