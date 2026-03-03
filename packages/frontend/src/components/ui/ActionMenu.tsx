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
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const visibleItems = items.filter((item) => !item.hidden);
  const visibleCount = visibleItems.length;

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
      setOpen(false);
    }
    function handleScroll(): void { setOpen(false); }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, updatePosition]);

  if (visibleCount === 0) return <span />;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-40"
        onClick={() => setOpen((p) => !p)}
        disabled={disabled}
        aria-label="Ações"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {open ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 max-h-[calc(100vh-16px)] overflow-auto"
          style={{ top: pos.top, left: Math.max(pos.left, 8) }}
        >
          {visibleItems.map((item, i) => (
            <button
              key={i}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                item.variant === 'danger'
                  ? 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              disabled={item.disabled}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </>
  );
}
