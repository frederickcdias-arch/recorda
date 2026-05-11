import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { useAuth } from '../../contexts/AuthContext';

type NavItem = {
  id: string;
  label: string;
  icon: string;
  path: string;
  allowedProfiles?: string[];
};

type SheetItem = {
  id: string;
  label: string;
  icon: string;
  path: string;
};

const mobileNavItems: NavItem[] = [
  { id: 'dashboard', label: 'Início', icon: 'dashboard', path: '/dashboard' },
  {
    id: 'recebimento',
    label: 'Receb.',
    icon: 'inbox',
    path: '/operacao/recebimento',
    allowedProfiles: ['operador', 'administrador'],
  },
  {
    id: 'producao',
    label: 'Produção',
    icon: 'bar-chart',
    path: '/producao',
    allowedProfiles: ['operador', 'administrador'],
  },
  {
    id: 'minha-producao',
    label: 'Produção',
    icon: 'clipboard',
    path: '/minha-producao/lancar',
    allowedProfiles: ['colaborador'],
  },
  {
    id: 'historico',
    label: 'Histórico',
    icon: 'history',
    path: '/minha-producao/historico',
    allowedProfiles: ['colaborador'],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: 'file-text',
    path: '/relatorios/gerenciais',
    allowedProfiles: ['operador', 'administrador'],
  },
];

const sheetItemsByPerfil: Record<string, SheetItem[]> = {
  administrador: [
    {
      id: 'devolucoes',
      label: 'Devoluções',
      icon: 'corner-up-right',
      path: '/operacao/devolucoes',
    },
    { id: 'config', label: 'Configurações', icon: 'settings', path: '/configuracoes' },
    { id: 'usuarios', label: 'Usuários', icon: 'users', path: '/configuracoes/usuarios' },
    { id: 'auditoria', label: 'Auditoria', icon: 'shield', path: '/auditoria' },
    { id: 'conhecimento', label: 'Conhecimento', icon: 'book', path: '/operacao/conhecimento' },
    {
      id: 'cq',
      label: 'Controle de Qualidade',
      icon: 'check-circle',
      path: '/operacao/controle-qualidade',
    },
  ],
  operador: [
    {
      id: 'devolucoes',
      label: 'Devoluções',
      icon: 'corner-up-right',
      path: '/operacao/devolucoes',
    },
    { id: 'conhecimento', label: 'Conhecimento', icon: 'book', path: '/operacao/conhecimento' },
    {
      id: 'cq',
      label: 'Controle de Qualidade',
      icon: 'check-circle',
      path: '/operacao/controle-qualidade',
    },
  ],
};

const MAIS_ACTIVE_PREFIXES = [
  '/configuracoes',
  '/auditoria',
  '/operacao/conhecimento',
  '/operacao/controle-qualidade',
  '/operacao/devolucoes',
];

const colsClass: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

export function MobileBottomNav(): JSX.Element {
  const { usuario } = useAuth();
  const perfil = usuario?.perfil;
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const visibleItems = mobileNavItems.filter(
    (item) => !item.allowedProfiles || (perfil && item.allowedProfiles.includes(perfil))
  );

  const sheetItems: SheetItem[] = perfil ? (sheetItemsByPerfil[perfil] ?? []) : [];
  const showMais = sheetItems.length > 0;

  const maisIsActive =
    showMais && MAIS_ACTIVE_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));

  const totalItems = visibleItems.length + (showMais ? 1 : 0);

  // Close on Escape key
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  // Close sheet on route change
  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className={`grid ${colsClass[totalItems] ?? 'grid-cols-4'}`}>
          {visibleItems.map((item) => (
            <li key={item.id}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 transition-colors duration-150 active:scale-90 ${
                    isActive
                      ? 'text-[var(--color-primary-600)]'
                      : 'text-[var(--color-text-secondary)]'
                  }`
                }
              >
                <Icon name={item.icon} className="h-5 w-5" />
                <span className="text-xs font-medium leading-none">{item.label}</span>
              </NavLink>
            </li>
          ))}

          {showMais && (
            <li>
              <button
                onClick={() => setSheetOpen(true)}
                aria-label="Abrir mais opções"
                className={`flex min-h-[60px] w-full flex-col items-center justify-center gap-1 px-1 transition-colors duration-150 active:scale-90 ${
                  maisIsActive
                    ? 'text-[var(--color-primary-600)]'
                    : 'text-[var(--color-text-secondary)]'
                }`}
              >
                <Icon name="more-horizontal" className="h-5 w-5" />
                <span className="text-xs font-medium leading-none">Mais</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      {/* Bottom Sheet */}
      {sheetOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mais opções"
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] pb-[env(safe-area-inset-bottom)] shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Mais opções
              </h2>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Fechar menu"
                className="rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-gray-100)]"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            <ul className="p-2">
              {sheetItems.map((item) => (
                <li key={item.id}>
                  <NavLink
                    to={item.path}
                    onClick={() => setSheetOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                        isActive
                          ? 'bg-[var(--color-primary-50)] font-medium text-[var(--color-primary-600)]'
                          : 'text-[var(--color-text-primary)] hover:bg-[var(--color-gray-50)]'
                      }`
                    }
                  >
                    <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
