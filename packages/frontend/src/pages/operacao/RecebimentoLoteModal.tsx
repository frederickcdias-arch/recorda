import { useEffect, useRef, useState } from 'react';
import type { OrigemDocumentoRecebimento } from '@recorda/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { useToastHelpers } from '../../components/ui/Toast';
import { extractErrorMessage } from '../../utils/errors';
import {
  useSetoresRecebimento,
  useClassificacoesRecebimento,
  useOcrPreviewAvulso,
  useCriarProcessoAvulso,
  useCriarSetorRecebimento,
  useCriarClassificacaoRecebimento,
} from '../../hooks/useQueries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OCRPreviewResponse {
  protocolo: string;
  interessado: string;
  textoExtraido: string;
  confianca: number;
}

interface AvulsoForm {
  protocolo: string;
  interessado: string;
  setorId: string;
  classificacaoId: string;
  volumeAtual: number;
  volumeTotal: number;
  numeroCaixas: number;
  caixaNova: boolean;
  observacao: string;
  origem: OrigemDocumentoRecebimento;
  ocrConfianca: number | null;
}

const EMPTY_FORM: AvulsoForm = {
  protocolo: '',
  interessado: '',
  setorId: '',
  classificacaoId: '',
  volumeAtual: 1,
  volumeTotal: 0,
  numeroCaixas: 1,
  caixaNova: false,
  observacao: '',
  origem: 'MANUAL',
  ocrConfianca: null,
};

type Step = 'inicio' | 'processando' | 'formulario' | 'salvo';

interface ProcessoSalvo {
  protocolo: string;
  interessado: string;
}

interface RecebimentoLoteModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Falha ao ler arquivo'));
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecebimentoLoteModal({
  open,
  onClose,
  onSaved,
}: RecebimentoLoteModalProps): JSX.Element | null {
  const toast = useToastHelpers();
  const [step, setStep] = useState<Step>('inicio');
  const [form, setForm] = useState<AvulsoForm>({ ...EMPTY_FORM });
  const [processando, setProcessando] = useState(false);
  const [salvos, setSalvos] = useState<ProcessoSalvo[]>([]);
  const [novoSetorInput, setNovoSetorInput] = useState('');
  const [novaClassifInput, setNovaClassifInput] = useState('');

  // React Query for select options
  const setoresQuery = useSetoresRecebimento();
  const setoresOptions = setoresQuery.data ?? [];
  const classificacoesQuery = useClassificacoesRecebimento();
  const classificacoesOptions = classificacoesQuery.data ?? [];

  // Mutation hooks
  const ocrPreviewMut = useOcrPreviewAvulso();
  const criarAvulsoMut = useCriarProcessoAvulso();
  const criarSetorMut = useCriarSetorRecebimento();
  const criarClassifMut = useCriarClassificacaoRecebimento();

  // File queue for desktop multi-file upload
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [fileQueueIndex, setFileQueueIndex] = useState(0);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  const hasQueue = fileQueue.length > 0;
  const queueTotal = fileQueue.length;
  const queueCurrent = fileQueueIndex + 1;
  const queueRemaining = queueTotal - fileQueueIndex - 1;

  useEffect(() => {
    if (open) {
      setStep('inicio');
      setForm({ ...EMPTY_FORM });
      setSalvos([]);
      setFileQueue([]);
      setFileQueueIndex(0);
    }
  }, [open]);

  // ---- OCR a single file ----
  const processFileOCR = async (file: File): Promise<void> => {
    try {
      setStep('processando');
      setProcessando(true);
      const base64 = await fileToBase64(file);
      const preview = (await ocrPreviewMut.mutateAsync(base64)) as unknown as OCRPreviewResponse;
      setForm((p) => ({
        ...p,
        protocolo: preview.protocolo || '',
        interessado: preview.interessado || '',
        origem: 'OCR',
        ocrConfianca: preview.confianca,
      }));
      setStep('formulario');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Processar OCR'));
      setStep('inicio');
    } finally {
      setProcessando(false);
    }
  };

  // ---- Mobile: single camera capture ----
  const handleCameraCapture = (file: File | null): void => {
    if (!file) return;
    setFileQueue([]);
    setFileQueueIndex(0);
    void processFileOCR(file);
  };

  // ---- Desktop: multi-file select ----
  const handleMultiFileSelect = (files: FileList | null): void => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setFileQueue(arr);
    setFileQueueIndex(0);
    const first = arr[0];
    if (first) void processFileOCR(first);
  };

  // ---- Manual (no OCR) ----
  const handleSkipOCR = (): void => {
    setFileQueue([]);
    setFileQueueIndex(0);
    setForm({ ...EMPTY_FORM, origem: 'MANUAL' });
    setStep('formulario');
  };

  // ---- Save ----
  const handleSalvar = async (): Promise<void> => {
    if (!form.protocolo.trim() || !form.interessado.trim()) {
      toast.error('Protocolo e interessado são obrigatórios.');
      return;
    }
    try {
      setProcessando(true);
      await criarAvulsoMut.mutateAsync({
        protocolo: form.protocolo.trim(),
        interessado: form.interessado.trim(),
        setorId: form.setorId || undefined,
        classificacaoId: form.classificacaoId || undefined,
        volumeAtual: form.volumeAtual,
        volumeTotal: form.volumeTotal,
        numeroCaixas: form.numeroCaixas,
        caixaNova: form.caixaNova,
        observacao: form.observacao.trim(),
        origem: form.origem,
        ocrConfianca: form.ocrConfianca,
      });
      const saved: ProcessoSalvo = {
        protocolo: form.protocolo.trim(),
        interessado: form.interessado.trim(),
      };
      setSalvos((prev) => [...prev, saved]);
      toast.success('Processo avulso salvo.');

      // If there are more files in the queue, auto-advance
      const nextIndex = fileQueueIndex + 1;
      const nextFile = hasQueue && nextIndex < queueTotal ? fileQueue[nextIndex] : undefined;
      if (nextFile) {
        setFileQueueIndex(nextIndex);
        setForm({ ...EMPTY_FORM });
        void processFileOCR(nextFile);
      } else {
        setStep('salvo');
      }
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao salvar processo'));
    } finally {
      setProcessando(false);
    }
  };

  // ---- Continue / Finish ----
  const handleAdicionarOutro = (): void => {
    setForm({ ...EMPTY_FORM });
    setFileQueue([]);
    setFileQueueIndex(0);
    setStep('inicio');
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (multiFileInputRef.current) multiFileInputRef.current.value = '';
  };

  const handleFinalizar = (): void => {
    onSaved();
    onClose();
  };

  // ---- Setor / Classificação creation ----
  const handleCriarSetor = async (): Promise<void> => {
    const nome = novoSetorInput.trim();
    if (!nome) return;
    try {
      const created = await criarSetorMut.mutateAsync(nome);
      setForm((p) => ({ ...p, setorId: created.id }));
      setNovoSetorInput('');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Criar Setor'));
    }
  };

  const handleCriarClassificacao = async (): Promise<void> => {
    const nome = novaClassifInput.trim();
    if (!nome) return;
    try {
      const created = await criarClassifMut.mutateAsync(nome);
      setForm((p) => ({ ...p, classificacaoId: created.id }));
      setNovaClassifInput('');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Criar Classificação'));
    }
  };

  // ---- Skip current file in queue ----
  const handlePularFoto = (): void => {
    const nextIndex = fileQueueIndex + 1;
    const nextFile = hasQueue && nextIndex < queueTotal ? fileQueue[nextIndex] : undefined;
    if (nextFile) {
      setFileQueueIndex(nextIndex);
      setForm({ ...EMPTY_FORM });
      void processFileOCR(nextFile);
    } else {
      setStep(salvos.length > 0 ? 'salvo' : 'inicio');
    }
  };

  if (!open) return null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-overlay-backdrop)] sm:items-center">
      <div className="flex h-full w-full flex-col overflow-hidden border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-xl sm:shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--color-border-primary)] flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              Adicionar Processos
            </h3>
            {salvos.length > 0 && (
              <p className="text-xs text-[var(--color-primary-600)]">
                {salvos.length} registrado(s)
              </p>
            )}
          </div>
          <Button variant="ghost" icon="x" iconOnly onClick={handleFinalizar} />
        </div>

        {/* Queue progress bar */}
        {hasQueue && (step === 'processando' || step === 'formulario') && (
          <div className="px-4 py-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)] shrink-0">
            <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-1">
              <span>
                Imagem {queueCurrent} de {queueTotal}
              </span>
              <span>{salvos.length} registrado(s)</span>
            </div>
            <progress
              value={queueCurrent}
              max={queueTotal}
              className="w-full h-1.5 rounded-full [appearance:none] bg-[var(--color-bg-tertiary)] [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[var(--color-bg-tertiary)] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[var(--color-primary-600)] [&::-webkit-progress-value]:transition-all [&::-webkit-progress-value]:duration-300 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-[var(--color-primary-600)]"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* ====== STEP: INICIO ====== */}
          {step === 'inicio' && (
            <div className="space-y-4">
              <Card>
                <div className="text-center space-y-4 py-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-[var(--color-primary-600)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                      />
                    </svg>
                  </div>
                  <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Leitura de Protocolo (OCR)
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Capture ou selecione imagens para extração automática de protocolo e
                    interessado.
                  </p>

                  {/* Hidden inputs */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={(e) => handleCameraCapture(e.target.files?.[0] ?? null)}
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                  <input
                    ref={multiFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    multiple
                    onChange={(e) => handleMultiFileSelect(e.target.files)}
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                  />

                  <div className="flex flex-col gap-2">
                    {/* Mobile: camera */}
                    <Button fullWidth size="lg" onClick={() => cameraInputRef.current?.click()}>
                      Capturar Imagem
                    </Button>
                    {/* Desktop: multi-file */}
                    <Button
                      fullWidth
                      size="lg"
                      variant="outline"
                      onClick={() => multiFileInputRef.current?.click()}
                    >
                      Selecionar Imagens
                    </Button>
                    {/* Manual */}
                    <Button fullWidth size="lg" variant="secondary" onClick={handleSkipOCR}>
                      Cadastro Manual
                    </Button>
                  </div>
                </div>
              </Card>

              {salvos.length > 0 && (
                <Card>
                  <h4 className="text-xs font-medium text-[var(--color-text-primary)] mb-2">
                    Registrados ({salvos.length})
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {salvos.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-secondary)] rounded px-2 py-1.5"
                      >
                        <span className="font-medium text-[var(--color-text-primary)]">
                          {s.protocolo}
                        </span>
                        <span className="text-[var(--color-text-tertiary)]">—</span>
                        <span className="truncate">{s.interessado}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ====== STEP: PROCESSANDO ====== */}
          {step === 'processando' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="h-9 w-9 motion-safe:animate-spin [animation-duration:1.2s] rounded-full border-4 border-[var(--color-bg-tertiary)] border-t-[var(--color-primary-600)]" />
              <p className="text-sm text-[var(--color-text-secondary)]">Processando OCR...</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {hasQueue
                  ? `Processando imagem ${queueCurrent} de ${queueTotal}`
                  : 'Extraindo dados da imagem'}
              </p>
            </div>
          )}

          {/* ====== STEP: FORMULARIO ====== */}
          {step === 'formulario' && (
            <div className="space-y-3">
              {form.ocrConfianca !== null && (
                <div className="text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] rounded-lg px-3 py-2">
                  Dados extraídos via OCR (confiança: {(form.ocrConfianca * 100).toFixed(0)}%).
                  Revise antes de salvar.
                </div>
              )}

              <Input
                label="Protocolo *"
                value={form.protocolo}
                onChange={(e) => setForm((p) => ({ ...p, protocolo: e.target.value }))}
                placeholder="Ex: 502824/2021"
              />
              <Input
                label="Interessado *"
                value={form.interessado}
                onChange={(e) => setForm((p) => ({ ...p, interessado: e.target.value }))}
                placeholder="Ex: JBS S/A"
              />

              {/* Setor */}
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                  Setor
                </label>
                <select
                  className="w-full h-9 px-3 border border-[var(--color-border-primary)] rounded-lg text-sm"
                  aria-label="Setor"
                  value={form.setorId}
                  onChange={(e) => setForm((p) => ({ ...p, setorId: e.target.value }))}
                >
                  <option value="">— Selecione —</option>
                  {setoresOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1 mt-1">
                  <input
                    type="text"
                    className="flex-1 h-8 px-2 border rounded text-xs"
                    placeholder="Novo setor..."
                    value={novoSetorInput}
                    onChange={(e) => setNovoSetorInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleCriarSetor();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="h-8 px-2 text-xs bg-[var(--color-primary-600)] text-white rounded hover:bg-[var(--color-primary-700)] disabled:opacity-50"
                    onClick={() => void handleCriarSetor()}
                    disabled={!novoSetorInput.trim()}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Classificação */}
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                  Classificação
                </label>
                <select
                  className="w-full h-9 px-3 border border-[var(--color-border-primary)] rounded-lg text-sm"
                  aria-label="Classificação"
                  value={form.classificacaoId}
                  onChange={(e) => setForm((p) => ({ ...p, classificacaoId: e.target.value }))}
                >
                  <option value="">— Selecione —</option>
                  {classificacoesOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1 mt-1">
                  <input
                    type="text"
                    className="flex-1 h-8 px-2 border rounded text-xs"
                    placeholder="Nova classificação..."
                    value={novaClassifInput}
                    onChange={(e) => setNovaClassifInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleCriarClassificacao();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="h-8 px-2 text-xs bg-[var(--color-primary-600)] text-white rounded hover:bg-[var(--color-primary-700)] disabled:opacity-50"
                    onClick={() => void handleCriarClassificacao()}
                    disabled={!novaClassifInput.trim()}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Volume */}
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Input
                    label="Volume"
                    type="number"
                    min={1}
                    value={String(form.volumeAtual)}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        volumeAtual: Math.max(Number(e.target.value || 1), 1),
                      }))
                    }
                  />
                </div>
                <span className="pb-2 text-[var(--color-text-secondary)] text-sm">de</span>
                <div className="flex-1">
                  <Input
                    label="Total"
                    type="number"
                    min={0}
                    value={String(form.volumeTotal)}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        volumeTotal: Math.max(Number(e.target.value || 0), 0),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Nº Caixas"
                  type="number"
                  min={1}
                  value={String(form.numeroCaixas)}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      numeroCaixas: Math.max(Number(e.target.value || 1), 1),
                    }))
                  }
                />
                <div className="flex items-center gap-2 pt-6">
                  <input
                    id="lote-caixa-nova"
                    type="checkbox"
                    checked={form.caixaNova}
                    onChange={(e) => setForm((p) => ({ ...p, caixaNova: e.target.checked }))}
                  />
                  <label
                    htmlFor="lote-caixa-nova"
                    className="text-sm text-[var(--color-text-secondary)]"
                  >
                    Caixa nova
                  </label>
                </div>
              </div>

              <Input
                label="Observação"
                value={form.observacao}
                onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))}
                placeholder="Observação (opcional)"
              />
            </div>
          )}

          {/* ====== STEP: SALVO (all done) ====== */}
          {step === 'salvo' && (
            <div className="space-y-4">
              <Card>
                <div className="text-center space-y-3 py-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-[var(--color-primary-600)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  </div>
                  <h4 className="text-base font-semibold text-[var(--color-text-primary)]">
                    {salvos.length === 1
                      ? 'Processo Registrado'
                      : `${salvos.length} Processos Registrados`}
                  </h4>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Cadastro concluído com sucesso.
                  </p>
                  <div className="flex flex-col gap-2 pt-2">
                    <Button fullWidth size="lg" onClick={handleAdicionarOutro}>
                      Novo Cadastro
                    </Button>
                    <Button fullWidth size="lg" variant="secondary" onClick={handleFinalizar}>
                      Finalizar
                    </Button>
                  </div>
                </div>
              </Card>
              <Card>
                <h4 className="text-xs font-medium text-[var(--color-text-primary)] mb-2">
                  Registrados ({salvos.length})
                </h4>
                <div className="space-y-1 max-h-48 overflow-auto">
                  {salvos.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-secondary)] rounded px-2 py-1.5"
                    >
                      <span className="font-medium text-[var(--color-text-primary)]">
                        {s.protocolo}
                      </span>
                      <span className="text-[var(--color-text-tertiary)]">—</span>
                      <span className="truncate">{s.interessado}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Footer — only on formulario step */}
        {step === 'formulario' && (
          <div className="px-4 py-3 border-t border-[var(--color-border-primary)] shrink-0 space-y-2">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setForm({ ...EMPTY_FORM });
                  setFileQueue([]);
                  setFileQueueIndex(0);
                  setStep('inicio');
                }}
              >
                Voltar
              </Button>
              <Button fullWidth onClick={() => void handleSalvar()} loading={processando}>
                {hasQueue && queueRemaining > 0
                  ? `Salvar e Próxima (${queueRemaining})`
                  : 'Salvar Processo'}
              </Button>
            </div>
            {hasQueue && queueRemaining > 0 && (
              <Button variant="ghost" fullWidth size="sm" onClick={handlePularFoto}>
                Pular Imagem
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
