import type { Dispatch, SetStateAction } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import type {
  DocForm,
  OCRPreviewResponse,
  RepositorioRef,
  SelectOption,
} from '../../hooks/useRecebimento';

interface RecebimentoApensoItem {
  id: string;
  protocolo: string;
  interessado: string | null;
  volume_atual: number;
  volume_total: number;
}

interface RecebimentoProcessoItem {
  id: string;
  protocolo: string;
  interessado: string;
  setor_nome: string | null;
  classificacao_nome: string | null;
  volume_atual: number;
  volume_total: number;
  origem: string;
  apensos: RecebimentoApensoItem[];
}

interface RecebimentoOcrModalProps {
  open: boolean;
  ocrRepo: RepositorioRef | null;
  onClose: () => void;
  recebTab: 'ocr' | 'processos';
  setRecebTab: Dispatch<SetStateAction<'ocr' | 'processos'>>;
  recebProcessos: RecebimentoProcessoItem[];
  ocrProcessando: boolean;
  ocrPreview: OCRPreviewResponse | null;
  onUploadImagemOCR: (file: File | null) => Promise<void>;
  onProcessarOCR: () => Promise<void>;
  setOcrPreview: Dispatch<SetStateAction<OCRPreviewResponse | null>>;
  setOcrImagemBase64: Dispatch<SetStateAction<string>>;
  apensoModalOpen: boolean;
  setApensoModalOpen: Dispatch<SetStateAction<boolean>>;
  apensoProcessoId: string;
  setApensoProcessoId: Dispatch<SetStateAction<string>>;
  setoresOptions: SelectOption[];
  novoSetorInput: string;
  setNovoSetorInput: Dispatch<SetStateAction<string>>;
  docForm: DocForm;
  setDocForm: Dispatch<SetStateAction<DocForm>>;
  emptyDocForm: DocForm;
  onCriarSetor: () => Promise<void>;
  onSalvarProcessoRecebimento: () => Promise<void>;
  onExcluirProcessoRecebimento: (processoId: string) => void;
  onAdicionarApenso: () => Promise<void>;
  onExcluirApenso: (apensoId: string) => void;
}

export function RecebimentoOcrModal({
  open,
  ocrRepo,
  onClose,
  recebTab,
  setRecebTab,
  recebProcessos,
  ocrProcessando,
  ocrPreview,
  onUploadImagemOCR,
  onProcessarOCR,
  setOcrPreview,
  setOcrImagemBase64,
  apensoModalOpen,
  setApensoModalOpen,
  apensoProcessoId,
  setApensoProcessoId,
  setoresOptions,
  novoSetorInput,
  setNovoSetorInput,
  docForm,
  setDocForm,
  emptyDocForm,
  onCriarSetor,
  onSalvarProcessoRecebimento,
  onExcluirProcessoRecebimento,
  onAdicionarApenso,
  onExcluirApenso,
}: RecebimentoOcrModalProps): JSX.Element | null {
  if (!open || !ocrRepo) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-overlay-backdrop)] sm:items-center sm:p-4">
      <div className="flex h-[95vh] w-full flex-col overflow-hidden rounded-t-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-xl sm:h-auto sm:max-h-[92vh] sm:max-w-6xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] px-6 py-4 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Recebimento — Processos
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              ID GED: {ocrRepo.id_repositorio_ged} · {ocrRepo.orgao}
            </p>
          </div>
          <Button variant="ghost" icon="x" iconOnly onClick={onClose} />
        </div>

        <div className="flex gap-4 border-b border-[var(--color-border-primary)] px-6 pt-3 shrink-0">
          <button
            className={`pb-2 text-sm font-medium border-b-2 ${recebTab === 'processos' ? 'border-[var(--color-primary-600)] text-[var(--color-primary-700)]' : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
            onClick={() => setRecebTab('processos')}
          >
            Processos ({recebProcessos.length})
          </button>
          <button
            className={`pb-2 text-sm font-medium border-b-2 ${recebTab === 'ocr' ? 'border-[var(--color-primary-600)] text-[var(--color-primary-700)]' : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
            onClick={() => setRecebTab('ocr')}
          >
            Novo Processo
          </button>
        </div>

        <div className="flex-1 overflow-auto space-y-4 p-3 sm:space-y-5 sm:p-6">
          {recebTab === 'ocr' ? (
            <>
              <Card>
                <h4 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                  Imagem do Protocolo
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={(e) => void onUploadImagemOCR(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-gray-700 sm:flex-1"
                    aria-label="Selecionar imagem do protocolo"
                    title="Selecionar imagem do protocolo"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void onProcessarOCR()}
                      loading={ocrProcessando}
                    >
                      Processar OCR
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setOcrImagemBase64('');
                        setOcrPreview(null);
                      }}
                      disabled={ocrProcessando}
                    >
                      Limpar
                    </Button>
                  </div>
                </div>
                {ocrPreview ? (
                  <p className="mt-2 inline-block rounded bg-primary-50 px-2 py-1 text-xs text-primary-700">
                    Confiança OCR: {(ocrPreview.confianca * 100).toFixed(1)}%
                  </p>
                ) : null}
              </Card>

              <Card>
                <h4 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                  Cadastro de Documento
                </h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
                      Tipo de cadastro
                    </label>
                    <select
                      className="h-9 w-full rounded-lg border px-3 text-sm"
                      aria-label="Tipo de cadastro"
                      value={apensoModalOpen ? 'APENSO' : 'PROCESSO'}
                      onChange={(e) => {
                        const apenso = e.target.value === 'APENSO';
                        setApensoModalOpen(apenso);
                        if (!apenso) setApensoProcessoId('');
                      }}
                    >
                      <option value="PROCESSO">Edital/Processo</option>
                      <option value="APENSO">Apenso Cadastrado</option>
                    </select>
                  </div>

                  {apensoModalOpen ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
                        Processo Principal
                      </label>
                      <select
                        className="h-9 w-full rounded-lg border px-3 text-sm"
                        aria-label="Processo Principal"
                        value={apensoProcessoId}
                        onChange={(e) => setApensoProcessoId(e.target.value)}
                      >
                        <option value="">— Selecione —</option>
                        {recebProcessos.map((proc) => (
                          <option key={proc.id} value={proc.id}>
                            {proc.protocolo} - {proc.interessado}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <Input
                    label="Protocolo *"
                    value={docForm.protocolo}
                    onChange={(e) => setDocForm((p) => ({ ...p, protocolo: e.target.value }))}
                    placeholder="Ex: 502824/2021"
                  />
                  <Input
                    label="Interessado *"
                    value={docForm.interessado}
                    onChange={(e) => setDocForm((p) => ({ ...p, interessado: e.target.value }))}
                    placeholder="Ex: JBS S/A"
                  />

                  {!apensoModalOpen ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
                        Setor (quem enviou)
                      </label>
                      <div className="flex gap-1">
                        <select
                          className="h-9 flex-1 rounded-lg border px-3 text-sm"
                          aria-label="Setor (quem enviou)"
                          value={docForm.setorId}
                          onChange={(e) => setDocForm((p) => ({ ...p, setorId: e.target.value }))}
                        >
                          <option value="">— Selecione —</option>
                          {setoresOptions.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-1 flex gap-1">
                        <input
                          type="text"
                          className="h-8 flex-1 rounded border px-2 text-xs"
                          placeholder="Novo setor..."
                          value={novoSetorInput}
                          onChange={(e) => setNovoSetorInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void onCriarSetor();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="h-8 rounded bg-primary-600 px-2 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
                          onClick={() => void onCriarSetor()}
                          disabled={!novoSetorInput.trim()}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Input
                        label="Volume"
                        type="number"
                        min={1}
                        value={String(docForm.volumeAtual)}
                        onChange={(e) =>
                          setDocForm((p) => ({
                            ...p,
                            volumeAtual: Math.max(Number(e.target.value || 1), 1),
                          }))
                        }
                      />
                    </div>
                    <span className="self-end pb-2 text-sm text-[var(--color-text-secondary)]">
                      de
                    </span>
                    <div className="flex-1">
                      <Input
                        label="Total"
                        type="number"
                        min={0}
                        value={String(docForm.volumeTotal)}
                        onChange={(e) =>
                          setDocForm((p) => ({
                            ...p,
                            volumeTotal: Math.max(Number(e.target.value || 0), 0),
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  {apensoModalOpen ? (
                    <Button onClick={() => void onAdicionarApenso()} loading={ocrProcessando}>
                      Salvar Apenso
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void onSalvarProcessoRecebimento()}
                      loading={ocrProcessando}
                    >
                      Salvar Processo
                    </Button>
                  )}

                  {apensoModalOpen ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setApensoModalOpen(false);
                        setApensoProcessoId('');
                        setDocForm({ ...emptyDocForm });
                      }}
                    >
                      Cancelar Apenso
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDocForm({ ...emptyDocForm });
                        setOcrPreview(null);
                        setOcrImagemBase64('');
                      }}
                    >
                      Limpar Formulário
                    </Button>
                  )}
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Processos registrados ({recebProcessos.length})
                </h4>
                <Button
                  size="sm"
                  onClick={() => {
                    setDocForm({ ...emptyDocForm });
                    setApensoModalOpen(false);
                    setApensoProcessoId('');
                    setRecebTab('ocr');
                  }}
                >
                  + Novo Processo
                </Button>
              </div>

              {recebProcessos.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
                  Nenhum processo registrado.
                </p>
              ) : (
                <div className="space-y-3">
                  {recebProcessos.map((proc) => (
                    <div key={proc.id} className="overflow-hidden rounded-lg border">
                      <div className="bg-[var(--color-bg-secondary)] px-3 py-3">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--color-text-primary)]">
                            {proc.protocolo}
                          </span>
                          <span className="whitespace-nowrap rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--color-text-secondary)]">
                            Vol. {proc.volume_atual}
                            {proc.volume_total > 0 ? `/${proc.volume_total}` : ''}
                          </span>
                        </div>
                        <div className="mb-1 flex items-center gap-2">
                          <span className="rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--color-text-secondary)]">
                            {proc.origem}
                          </span>
                          <span className="text-sm text-[var(--color-text-primary)]">
                            {proc.interessado}
                          </span>
                        </div>
                        {(proc.setor_nome || proc.classificacao_nome) && (
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {proc.setor_nome && <>Setor: {proc.setor_nome}</>}
                            {proc.setor_nome && proc.classificacao_nome && ' · '}
                            {proc.classificacao_nome && <>Classif: {proc.classificacao_nome}</>}
                          </p>
                        )}
                        <div className="mt-2 flex gap-2 border-t border-[var(--color-border-primary)] pt-2">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              setApensoProcessoId(proc.id);
                              setApensoModalOpen(true);
                              setDocForm({ ...emptyDocForm });
                              setRecebTab('ocr');
                            }}
                          >
                            + Apenso
                          </Button>
                          <Button
                            size="xs"
                            variant="danger"
                            onClick={() => onExcluirProcessoRecebimento(proc.id)}
                            disabled={ocrProcessando}
                          >
                            Excluir
                          </Button>
                        </div>
                      </div>

                      {proc.apensos.length > 0 && (
                        <div className="border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
                          {proc.apensos.map((ap) => (
                            <div
                              key={ap.id}
                              className="border-b border-[var(--color-border-primary)] px-3 py-2 last:border-b-0"
                            >
                              <div className="mb-0.5 flex items-center gap-2">
                                <span className="text-xs text-[var(--color-text-tertiary)]">↳</span>
                                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                                  {ap.protocolo}
                                </span>
                                <span className="whitespace-nowrap rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--color-text-secondary)]">
                                  Vol. {ap.volume_atual}
                                  {ap.volume_total > 0 ? `/${ap.volume_total}` : ''}
                                </span>
                              </div>
                              {ap.interessado && (
                                <p className="mb-1 ml-4 text-xs text-[var(--color-text-secondary)]">
                                  {ap.interessado}
                                </p>
                              )}
                              <div className="ml-4">
                                <Button
                                  size="xs"
                                  variant="danger"
                                  onClick={() => onExcluirApenso(ap.id)}
                                  disabled={ocrProcessando}
                                >
                                  Excluir
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="flex justify-end border-t border-[var(--color-border-primary)] px-6 py-3 shrink-0">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
