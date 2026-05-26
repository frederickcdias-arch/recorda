/**
 * Modal - componente de dialogo acessivel com focus trap
 *
 * Uso:
 *   <Modal open={open} onClose={onClose} title="Titulo">
 *     conteudo
 *   </Modal>
 *
 * Props:
 *   - size: 'sm' | 'md' | 'lg' | 'xl' (default: 'md')
 *   - scrollable: se true, o overlay rola em vez do modal ter max-height fixa
 */

import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: ModalSize;
  scrollable?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  scrollable = false,
  children,
  footer,
}: ModalProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
      const firstInput = focusable.find((element) =>
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
      );
      (firstInput ?? focusable[0])?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const overlayClass = scrollable
    ? 'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-overlay-backdrop)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm'
    : 'fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-overlay-backdrop)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center';

  const panelClass = scrollable
    ? `w-full max-w-[calc(100vw-2rem)] ${sizeClasses[size]} rounded-2xl bg-[var(--color-bg-primary)] shadow-xl`
    : `flex w-full max-w-[calc(100vw-2rem)] ${sizeClasses[size]} max-h-[min(90vh,calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex-col rounded-2xl bg-[var(--color-bg-primary)] shadow-xl`;

  return (
    <div
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className={panelClass}>
        <div className="flex flex-shrink-0 items-start justify-between border-b border-[var(--color-border-primary)] p-5">
          <div>
            <h2
              id="modal-title"
              className="text-base font-semibold text-[var(--color-text-primary)]"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="ml-4 -m-1 flex-shrink-0 rounded p-1 text-[var(--color-gray-400)] transition-colors hover:bg-[var(--color-fill-hover)] hover:text-[var(--color-gray-600)]"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className={scrollable ? '' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain'}>
          {children}
        </div>

        {footer ? (
          <div className="flex-shrink-0 border-t border-[var(--color-border-primary)]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
