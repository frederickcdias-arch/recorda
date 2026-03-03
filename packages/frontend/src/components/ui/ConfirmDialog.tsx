import { Button } from './Button';
import type { ConfirmDialogState } from '../../hooks/useConfirmDialog';

interface ConfirmDialogProps {
  state: ConfirmDialogState;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ state, loading, onConfirm, onCancel }: ConfirmDialogProps): JSX.Element | null {
  if (!state.open) return null;

  const variantStyles = {
    danger: 'text-gray-900',
    warning: 'text-gray-900',
    default: 'text-blue-600',
  };

  const buttonVariant = state.variant === 'danger' ? 'danger' : 'primary';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-scale-in">
        <h3 className={`text-lg font-semibold ${variantStyles[state.variant]} mb-2`}>
          {state.title}
        </h3>
        <p className="text-sm text-gray-600 mb-6">{state.message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button variant={buttonVariant} onClick={onConfirm} loading={loading}>
            {state.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
