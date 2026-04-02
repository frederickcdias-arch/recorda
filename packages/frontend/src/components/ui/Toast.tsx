/**
 * Toast - Notificações temporárias
 */

import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { Icon } from './Icon';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
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
    container: 'bg-white border-[var(--color-gray-200)]',
    icon: 'text-[var(--color-primary-600)]',
    iconName: 'help-circle',
  },
  success: {
    container: 'bg-white border-[var(--color-success-200)]',
    icon: 'text-[var(--color-success-600)]',
    iconName: 'check-square',
  },
  warning: {
    container: 'bg-white border-[var(--color-warning-200)]',
    icon: 'text-[var(--color-warning-600)]',
    iconName: 'help-circle',
  },
  error: {
    container: 'bg-white border-[var(--color-error-200)]',
    icon: 'text-[var(--color-error-600)]',
    iconName: 'x',
  },
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps): JSX.Element {
  const [isExiting, setIsExiting] = useState(false);
  const styles = variantStyles[toast.variant];
  const duration = toast.duration ?? 5000;

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onRemove(toast.id), 200);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, duration, onRemove]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 200);
  };

  return (
    <div
      className={`
        ${styles.container}
        border rounded-lg shadow-lg p-4 min-w-[320px] max-w-[420px]
        transition-all duration-200
        ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
      `}
      role="alert"
    >
      <div className="flex gap-3">
        <div className={`${styles.icon} flex-shrink-0 mt-0.5`}>
          <Icon name={styles.iconName} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--color-text-primary)] text-sm">{toast.title}</p>
          {toast.message && (
            <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{toast.message}</p>
          )}
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 text-[var(--color-gray-400)] hover:text-[var(--color-gray-600)] p-1 -m-1 rounded transition-colors"
          aria-label="Fechar"
        >
          <Icon name="x" className="w-4 h-4" />
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
      className="fixed bottom-4 right-4 z-[var(--z-toast)] flex flex-col gap-2"
      aria-live="assertive"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

/**
 * Hook helper para criar toasts rapidamente
 */
export function useToastHelpers() {
  const { addToast } = useToast();

  return {
    success: (title: string, message?: string) => addToast({ variant: 'success', title, message }),
    error: (title: string, message?: string) => addToast({ variant: 'error', title, message }),
    warning: (title: string, message?: string) => addToast({ variant: 'warning', title, message }),
    info: (title: string, message?: string) => addToast({ variant: 'info', title, message }),
  };
}
