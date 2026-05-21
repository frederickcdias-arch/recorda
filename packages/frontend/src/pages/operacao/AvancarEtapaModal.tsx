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
        <div className="border-b px-6 py-4 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">Avançar para {etapaDestino}</h3>
          <p className="mt-1 text-sm text-gray-500">Verifique os documentos e confirme o avanço.</p>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-900">
            Processos no repositório ({docs.length})
          </h4>
          {docs.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
              Nenhum Processo cadastrado neste Repositório.
            </p>
          ) : (
            <div className="max-h-56 overflow-x-auto overflow-y-auto rounded-lg border">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      Protocolo
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      Interessado
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Vol.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-secondary)] bg-[var(--color-bg-primary)]">
                  {docs.map((doc, idx) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{doc.processo}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{doc.interessado}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{doc.volume}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {docs.length > 0 ? (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-primary-50/50">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
              />
              <span className="text-sm text-gray-700">
                Confirmo que todos os <strong>{docs.length} documento(s)</strong> listados acima
                estão presentes no <strong>físico</strong> e no <strong>GED</strong>.
              </span>
            </label>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t px-6 py-4 shrink-0">
          <p className="text-xs text-gray-500">
            {docs.length === 0
              ? 'Sem processos cadastrados.'
              : !confirmado
                ? 'Marque a confirmação para prosseguir.'
                : 'Pronto para avançar.'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
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
