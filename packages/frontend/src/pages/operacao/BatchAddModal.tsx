import { Button } from '../../components/ui/Button';

interface RepoOption {
  id_repositorio_recorda: string;
  id_repositorio_ged: string;
  orgao: string;
}

interface BatchAddModalProps {
  open: boolean;
  repositorios: RepoOption[];
  repoId: string;
  setRepoId: (value: string) => void;
  text: string;
  setText: (value: string) => void;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function BatchAddModal({
  open,
  repositorios,
  repoId,
  setRepoId,
  text,
  setText,
  loading,
  onClose,
  onConfirm,
}: BatchAddModalProps): JSX.Element | null {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay-backdrop)] p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-xl">
        <div className="border-b border-[var(--color-border-primary)] px-6 py-4">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Importação em Lote
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Formato: protocolo (TAB) interessado — um por linha.
          </p>
        </div>

        <div className="px-6 py-3">
          <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
            Repositório
          </label>
          <select
            aria-label="Repositório"
            className="h-9 w-full rounded-lg border border-[var(--color-border-primary)] px-3 text-sm text-[var(--color-text-primary)]"
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
          >
            <option value="">— Selecione —</option>
            {repositorios.map((repo) => (
              <option key={repo.id_repositorio_recorda} value={repo.id_repositorio_recorda}>
                {repo.id_repositorio_ged} — {repo.orgao}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-auto px-6 py-3">
          <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
            Dados
          </label>
          <textarea
            className="h-64 w-full rounded-lg border border-[var(--color-border-primary)] px-3 py-2 font-mono text-sm text-[var(--color-text-primary)]"
            placeholder="502824/2021&#9;JBS S/A&#10;502825/2021&#9;Prefeitura Municipal"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Separe protocolo e interessado com TAB.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border-primary)] px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => void onConfirm()}
            loading={loading}
            disabled={!repoId || !text.trim()}
          >
            Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}
