import type { Dispatch, SetStateAction } from 'react';
import { Button } from '../../components/ui/Button';

interface DocumentoRecebimentoItem {
  id: string;
  processo: string;
  interessado: string;
  volume: string;
}

interface AvancarEtapaModalProps {
  open: boolean;
  etapaDestino: string | undefined;
  docs: DocumentoRecebimentoItem[];
  confirmado: boolean;
  setConfirmado: Dispatch<SetStateAction<boolean>>;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function AvancarEtapaModal({
  open,
  etapaDestino,
  docs,
  confirmado,
  setConfirmado,
  loading,
  onClose,
  onConfirm,
}: AvancarEtapaModalProps): JSX.Element | null {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-[var(--color-bg-primary)] shadow-xl animate-scale-in">
        <div className="border-b border-[var(--color-border-primary)] px-6 py-4 shrink-0">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Avançar para {etapaDestino}
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Confirme os documentos antes de avançar.
          </p>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          <h4 className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">
            Processos no repositório ({docs.length})
          </h4>
          {docs.length === 0 ? (
            <p className="rounded-lg bg-[var(--color-bg-secondary)] p-3 text-sm text-[var(--color-text-secondary)]">
              Nenhum processo cadastrado.
            </p>
          ) : (
            <div className="max-h-56 overflow-x-auto overflow-y-auto rounded-lg border">
              <table className="min-w-full divide-y divide-[var(--color-border-primary)]">
                <thead className="sticky top-0 bg-[var(--color-bg-secondary)]">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      #
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Protocolo
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Interessado
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)]">
                      Vol.
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-secondary)] bg-[var(--color-bg-primary)]">
                  {docs.map((doc, idx) => (
                    <tr key={doc.id} className="hover:bg-[var(--color-bg-secondary)]">
                      <td className="px-3 py-2 text-xs text-[var(--color-text-tertiary)]">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 text-sm text-[var(--color-text-primary)]">
                        {doc.processo}
                      </td>
                      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                        {doc.interessado}
                      </td>
                      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                        {doc.volume}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {docs.length > 0 ? (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border-primary)] p-3 transition-colors hover:bg-[var(--color-bg-secondary)]">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-[var(--color-border-primary)] text-primary-600 focus:ring-primary-500"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
              />
              <span className="text-sm text-[var(--color-text-secondary)]">
                Confirmo que todos os <strong>{docs.length} documento(s)</strong> listados acima
                estão presentes no <strong>físico</strong> e no <strong>GED</strong>.
              </span>
            </label>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--color-border-primary)] px-6 py-4 shrink-0">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {docs.length === 0
              ? 'Sem processos cadastrados.'
              : !confirmado
                ? 'Marque a confirmação para prosseguir.'
                : 'Pronto para avançar.'}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={() => void onConfirm()}
              loading={loading}
              disabled={docs.length > 0 && !confirmado}
            >
              Confirmar Avanço
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
