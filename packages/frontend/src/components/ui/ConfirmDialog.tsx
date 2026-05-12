import { useState } from 'react';
import { Button } from './Button';
import type { ConfirmDialogState } from '../../hooks/useConfirmDialog';

interface ConfirmDialogProps {
  state: ConfirmDialogState;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  state,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  const [isClosing, setIsClosing] = useState(false);

  if (!state.open && !isClosing) return null;

  const handleCancel = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onCancel();
    }, 200);
  };

  const variantStyles = {
    danger: 'text-[var(--color-text-primary)]',
    warning: 'text-[var(--color-text-primary)]',
    default: 'text-primary-600',
  };

  const buttonVariant = state.variant === 'danger' ? 'danger' : 'primary';

  return (
    <div
      className={`fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 ${
        isClosing ? 'animate-fade-out' : 'animate-fade-in'
      }`}
    >
      <div
        className={`bg-[var(--color-bg-primary)] rounded-xl shadow-xl w-full max-w-md p-6 ${
          isClosing ? 'animate-scale-out' : 'animate-scale-in'
        }`}
      >
        <h3 className={`text-lg font-semibold ${variantStyles[state.variant]} mb-2`}>
          {state.title}
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">{state.message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={handleCancel} disabled={loading}>
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
