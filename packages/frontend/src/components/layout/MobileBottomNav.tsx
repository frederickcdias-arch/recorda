import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { useAuth } from '../../contexts/AuthContext';
import { getMobilePrimaryNav, getMobileSheetNav } from '../../config/menu';

const colsClass: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

interface MobileBottomNavProps {
  unreadComunicados?: number;
}

export function MobileBottomNav({ unreadComunicados = 0 }: MobileBottomNavProps): JSX.Element {
  const { usuario } = useAuth();
  const perfil = usuario?.perfil;
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const primaryItems = useMemo(() => getMobilePrimaryNav(perfil), [perfil]);
  const sheetItems = useMemo(() => getMobileSheetNav(perfil), [perfil]);
  const showMais = sheetItems.length > 0;
  const sheetHasComunicados = sheetItems.some((item) => item.id === 'comunicados');
  const maisIsActive =
    showMais && sheetItems.some((item) => location.pathname.startsWith(item.path));
  const totalItems = primaryItems.length + (showMais ? 1 : 0);

  useEffect((): void | (() => void) => {
    if (!sheetOpen) return;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSheetOpen(false);
    };

    document.addEventListener('keydown', onKey);
    return (): void => document.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  useEffect((): void => {
    setSheetOpen(false);
  }, [location.pathname]);

  return (
    <>
      <nav
        aria-label="Navegacao principal"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--color-border-primary)] bg-[color:color-mix(in_srgb,var(--color-bg-primary)_94%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className={`grid ${colsClass[totalItems] ?? 'grid-cols-4'} px-1 py-1`}>
          {primaryItems.map((item) => (
            <li key={item.id}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `relative flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl px-1 transition-all duration-150 active:scale-95 ${
                    isActive
                      ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
                      : 'text-[var(--color-text-secondary)]'
                  }`
                }
              >
                <Icon name={item.icon} className="h-5 w-5" />
                <span className="text-[11px] font-medium leading-none">{item.label}</span>
              </NavLink>
            </li>
          ))}

          {showMais ? (
            <li>
              <button
                onClick={(): void => setSheetOpen(true)}
                aria-label="Abrir mais opcoes"
                className={`flex min-h-[60px] w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 transition-all duration-150 active:scale-95 ${
                  maisIsActive
                    ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
                    : 'text-[var(--color-text-secondary)]'
                }`}
              >
                <span className="relative">
                  <Icon name="more-horizontal" className="h-5 w-5" />
                  {sheetHasComunicados && unreadComunicados > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-[var(--color-error-600)] px-1 text-[9px] font-semibold text-white">
                      {unreadComunicados > 99 ? '99+' : String(unreadComunicados)}
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] font-medium leading-none">Mais</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {sheetOpen ? (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={(): void => setSheetOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mais opcoes"
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] pb-[env(safe-area-inset-bottom)] shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] px-4 py-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Mais opcoes
                </h2>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Navegacao complementar do app
                </p>
              </div>
              <button
                onClick={(): void => setSheetOpen(false)}
                aria-label="Fechar menu"
                className="rounded-xl border border-[var(--color-border-primary)] p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-gray-50)]"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            <ul className="space-y-1 p-2">
              {sheetItems.map((item) => (
                <li key={item.id}>
                  <NavLink
                    to={item.path}
                    onClick={(): void => setSheetOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors ${
                        isActive
                          ? 'bg-[var(--color-primary-50)] font-medium text-[var(--color-primary-700)]'
                          : 'text-[var(--color-text-primary)] hover:bg-[var(--color-gray-50)]'
                      }`
                    }
                  >
                    <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                    {item.label}
                    {item.id === 'comunicados' && unreadComunicados > 0 ? (
                      <span className="ml-auto inline-flex min-w-[1.2rem] items-center justify-center rounded-full bg-[var(--color-error-600)] px-1.5 text-[10px] font-semibold text-white">
                        {unreadComunicados > 99 ? '99+' : unreadComunicados}
                      </span>
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </>
  );
}
