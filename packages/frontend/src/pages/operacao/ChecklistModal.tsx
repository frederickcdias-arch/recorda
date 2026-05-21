import type { Dispatch, SetStateAction } from 'react';
import { Button } from '../../components/ui/Button';

type ResultadoChecklist = 'CONFORME' | 'NAO_CONFORME_COM_TRATATIVA';

interface ChecklistHeader {
  etapa: string;
}

interface ChecklistItem {
  id: string;
  codigo: string;
  descricao: string;
  obrigatorio: boolean;
  ordem: number;
  resultado: ResultadoChecklist | null;
  observacao: string | null;
}

interface ChecklistModalProps {
  open: boolean;
  header: ChecklistHeader | null;
  itens: ChecklistItem[];
  setItens: Dispatch<SetStateAction<ChecklistItem[]>>;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ChecklistModal({
  open,
  header,
  itens,
  setItens,
  loading,
  onClose,
  onConfirm,
}: ChecklistModalProps): JSX.Element | null {
  if (!open || !header) return null;

  const preenchidos = itens.filter((it) => it.resultado).length;
  const totalItens = itens.length;
  const obrigatorios = itens.filter((it) => it.obrigatorio).length;
  const obrigatoriosPreenchidos = itens.filter((it) => it.obrigatorio && it.resultado).length;
  const todosObrigatoriosOk = obrigatoriosPreenchidos === obrigatorios;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-[var(--color-bg-primary)] shadow-xl animate-scale-in">
        <div className="flex items-center justify-between border-b px-5 py-3 shrink-0 sm:px-6 sm:py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 sm:text-lg">
              Checklist — {header.etapa}
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              {preenchidos}/{totalItens} preenchidos
              {obrigatorios > 0 ? ` · ${obrigatoriosPreenchidos}/${obrigatorios} obrigatórios` : ''}
            </p>
          </div>
          <Button variant="ghost" icon="x" iconOnly onClick={onClose} />
        </div>

        <div className="flex-1 space-y-2 overflow-auto p-5 sm:p-6">
          {itens.map((item, idx) => {
            const preenchido = !!item.resultado;
            const naoConforme = item.resultado === 'NAO_CONFORME_COM_TRATATIVA';
            return (
              <div
                key={item.id}
                className={`rounded-lg border px-4 py-3 transition-colors ${preenchido ? 'border-primary-200 bg-primary-50/30' : 'border-gray-200'}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${preenchido ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'}`}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{item.descricao}</span>
                      {item.obrigatorio ? (
                        <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-600">
                          Obrigatório
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select
                        className={`h-9 flex-shrink-0 rounded-lg border px-3 text-sm sm:w-56 ${!preenchido && item.obrigatorio ? 'border-primary-300' : 'border-gray-300'}`}
                        value={item.resultado ?? ''}
                        onChange={(e) => {
                          const value = e.target.value as ResultadoChecklist;
                          setItens((prev) =>
                            prev.map((it) =>
                              it.id === item.id ? { ...it, resultado: value || null } : it
                            )
                          );
                        }}
                      >
                        <option value="">— Selecione —</option>
                        <option value="CONFORME">Conforme</option>
                        <option value="NAO_CONFORME_COM_TRATATIVA">
                          Não conforme c/ tratativa
                        </option>
                      </select>
                      {naoConforme ? (
                        <input
                          type="text"
                          className="h-9 flex-1 rounded-lg border border-gray-300 px-3 text-sm"
                          placeholder="Observação (obrigatória para não conforme)"
                          value={item.observacao ?? ''}
                          onChange={(e) =>
                            setItens((prev) =>
                              prev.map((it) =>
                                it.id === item.id ? { ...it, observacao: e.target.value } : it
                              )
                            )
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3 shrink-0 sm:px-6 sm:py-4">
          <p className="text-xs text-gray-500">
            {todosObrigatoriosOk
              ? 'Todos os itens obrigatórios preenchidos.'
              : `Faltam ${obrigatorios - obrigatoriosPreenchidos} item(ns) obrigatório(s).`}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={() => void onConfirm()}
              loading={loading}
              disabled={!todosObrigatoriosOk}
            >
              Concluir Checklist
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
