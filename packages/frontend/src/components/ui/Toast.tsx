import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { Icon } from './Icon';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

const variantStyles: Record<
  ToastVariant,
  {
    container: string;
    icon: string;
    iconName: string;
  }
> = {
  info: {
    container:
      'border-[color:color-mix(in_srgb,var(--color-primary-600)_16%,var(--color-border-primary))]',
    icon: 'text-[var(--color-primary-600)]',
    iconName: 'info',
  },
  success: {
    container:
      'border-[color:color-mix(in_srgb,var(--color-success-600)_18%,var(--color-border-primary))]',
    icon: 'text-[var(--color-success-600)]',
    iconName: 'check-square',
  },
  warning: {
    container:
      'border-[color:color-mix(in_srgb,var(--color-warning-600)_18%,var(--color-border-primary))]',
    icon: 'text-[var(--color-warning-600)]',
    iconName: 'alert-triangle',
  },
  error: {
    container:
      'border-[color:color-mix(in_srgb,var(--color-error-600)_18%,var(--color-border-primary))]',
    icon: 'text-[var(--color-error-600)]',
    iconName: 'alert-circle',
  },
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps): JSX.Element {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const styles = variantStyles[toast.variant];
  const duration = toast.duration ?? 4500;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onRemove(toast.id), 180);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, duration, onRemove]);

  const handleClose = (): void => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 180);
  };

  return (
    <div
      className={`
        ${styles.container}
        w-full rounded-2xl border bg-[var(--color-bg-primary)] px-4 py-3 shadow-lg
        transition-[opacity,transform] duration-150
        ${!isVisible || isExiting ? 'translate-y-3 opacity-0' : 'translate-y-0 opacity-100'}
      `}
      role="alert"
    >
      <div className="flex gap-3">
        <div className={`${styles.icon} mt-0.5 flex-shrink-0`}>
          <Icon name={styles.iconName} className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{toast.title}</p>
          {toast.message ? (
            <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{toast.message}</p>
          ) : null}
          {toast.actionLabel && toast.onAction ? (
            <button
              type="button"
              onClick={toast.onAction}
              className="mt-2 rounded-lg px-0 py-1 text-sm font-medium text-[var(--color-primary-600)] transition-colors hover:text-[var(--color-primary-700)]"
            >
              {toast.actionLabel}
            </button>
          ) : null}
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 rounded p-1 text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
          aria-label="Fechar"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps): JSX.Element | null {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[var(--z-toast)] flex flex-col gap-2 sm:left-auto sm:w-[340px] md:bottom-4"
      aria-live="assertive"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

type ToastAction = {
  label: string;
  onAction: () => void;
};

export function useToastHelpers(): {
  success: (title: string, message?: string, action?: ToastAction) => void;
  error: (title: string, message?: string, action?: ToastAction) => void;
  warning: (title: string, message?: string, action?: ToastAction) => void;
  info: (title: string, message?: string, action?: ToastAction) => void;
} {
  const { addToast } = useToast();

  return {
    success: (title: string, message?: string, action?: ToastAction) =>
      addToast({
        variant: 'success',
        title,
        message,
        actionLabel: action?.label,
        onAction: action?.onAction,
      }),
    error: (title: string, message?: string, action?: ToastAction) =>
      addToast({
        variant: 'error',
        title,
        message,
        actionLabel: action?.label,
        onAction: action?.onAction,
      }),
    warning: (title: string, message?: string, action?: ToastAction) =>
      addToast({
        variant: 'warning',
        title,
        message,
        actionLabel: action?.label,
        onAction: action?.onAction,
      }),
    info: (title: string, message?: string, action?: ToastAction) =>
      addToast({
        variant: 'info',
        title,
        message,
        actionLabel: action?.label,
        onAction: action?.onAction,
      }),
  };
}
