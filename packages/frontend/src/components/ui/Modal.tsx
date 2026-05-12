/**
 * Modal — componente de diálogo acessível com focus trap
 *
 * Uso:
 *   <Modal open={open} onClose={onClose} title="Título">
 *     conteúdo
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
  /** Subtítulo opcional exibido abaixo do título */
  subtitle?: string;
  /** Controla a largura máxima do modal (default: 'md') */
  size?: ModalSize;
  /**
   * Se true, o overlay fica scrollável e o conteúdo cresce livremente.
   * Se false (default), o modal tem max-height 90vh com overflow-y-auto interno.
   */
  scrollable?: boolean;
  children: React.ReactNode;
  /** Slot para rodapé (botões de ação) */
  footer?: React.ReactNode;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
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

  // Focus trap + restore focus
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    // Delay to allow render
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
      focusable[0]?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const overlayClass = scrollable
    ? 'fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4'
    : 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';

  const panelClass = scrollable
    ? `bg-[var(--color-bg-primary)] rounded-xl shadow-2xl w-full ${sizeClasses[size]}`
    : `bg-[var(--color-bg-primary)] rounded-xl shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col`;

  return (
    <div
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className={panelClass}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-[var(--color-border-primary)] flex-shrink-0">
          <div>
            <h2
              id="modal-title"
              className="text-base font-semibold text-[var(--color-text-primary)]"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-[var(--color-gray-400)] hover:text-[var(--color-gray-600)] p-1 -m-1 rounded transition-colors ml-4 flex-shrink-0"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className={scrollable ? '' : 'overflow-y-auto flex-1'}>{children}</div>

        {/* Footer */}
        {footer && (
          <div className="border-t border-[var(--color-border-primary)] flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
