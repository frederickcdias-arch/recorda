import { useState, useCallback } from 'react';

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'danger' | 'warning' | 'default';
  onConfirm: () => void | Promise<void>;
}

const INITIAL_STATE: ConfirmDialogState = {
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Confirmar',
  variant: 'default',
  onConfirm: () => {},
};

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmDialogState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);

  const confirm = useCallback(
    (opts: {
      title: string;
      message: string;
      confirmLabel?: string;
      variant?: 'danger' | 'warning' | 'default';
      onConfirm: () => void | Promise<void>;
    }) => {
      setState({
        open: true,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirmar',
        variant: opts.variant ?? 'default',
        onConfirm: opts.onConfirm,
      });
    },
    []
  );

  const close = useCallback(() => {
    setState(INITIAL_STATE);
    setLoading(false);
  }, []);

  const handleConfirm = useCallback(async () => {
    try {
      setLoading(true);
      await state.onConfirm();
    } finally {
      setLoading(false);
      setState(INITIAL_STATE);
    }
  }, [state]);

  return { state, loading, confirm, close, handleConfirm };
}
