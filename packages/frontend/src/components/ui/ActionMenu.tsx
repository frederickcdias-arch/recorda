import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ActionMenuItem {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  hidden?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  disabled?: boolean;
}

export function ActionMenu({ items, disabled = false }: ActionMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const visibleItems = items.filter((item) => !item.hidden);
  const visibleCount = visibleItems.length;

  const closeMenu = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
    }, 130);
  }, []);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuHeight = visibleCount * 36 + 8; // ~36px per item + py-1
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openUp = spaceBelow < menuHeight && rect.top > spaceBelow;
    if (openUp) {
      setPos({ top: Math.max(8, rect.top - menuHeight - 4), left: rect.right - 192 });
    } else {
      setPos({ top: rect.bottom + 4, left: rect.right - 192 });
    }
  }, [visibleCount]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function handleClickOutside(e: MouseEvent): void {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    }
    function handleScroll(): void {
      closeMenu();
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, updatePosition, closeMenu]);

  if (visibleCount === 0) return <span />;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-fill-hover-strong)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
        onClick={() => setOpen((p) => !p)}
        disabled={disabled}
        aria-label="Ações"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {open || isClosing
        ? createPortal(
            <div
              ref={menuRef}
              className={`fixed z-[9999] w-48 bg-[var(--color-bg-primary)] rounded-lg shadow-lg border border-[var(--color-border-primary)] py-1 max-h-[calc(100vh-16px)] overflow-auto origin-top-right ${
                ''
              }`}
              style={{ top: pos.top, left: Math.max(pos.left, 8) }}
            >
              {visibleItems.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    item.variant === 'danger'
                      ? 'text-[var(--color-text-primary)] hover:bg-[var(--color-error-50)] hover:text-[var(--color-error-700)]'
                      : 'text-[var(--color-text-primary)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)]'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  onClick={() => {
                    closeMenu();
                    item.onClick();
                  }}
                  disabled={item.disabled}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
