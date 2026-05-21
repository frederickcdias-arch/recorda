import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { menuSections } from '../../config/menu';
import type { MenuItem, MenuSection } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onMobileClose?: () => void;
  unreadComunicados?: number;
}

const STORAGE_KEY = 'recorda.sidebar.expandedSections';

function getStoredSections(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function setStoredSections(sections: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
  } catch {
    // ignore
  }
}

function canAccessByProfile(
  usuarioPerfil: string | undefined,
  allowedProfiles?: string[]
): boolean {
  if (!allowedProfiles || allowedProfiles.length === 0) return true;
  if (!usuarioPerfil) return false;
  return allowedProfiles.includes(usuarioPerfil);
}

function filterMenuItemByProfile(
  item: MenuItem,
  usuarioPerfil: string | undefined
): MenuItem | null {
  if (!canAccessByProfile(usuarioPerfil, item.allowedProfiles)) return null;
  if (!item.children || item.children.length === 0) return item;

  const filteredChildren = item.children
    .map((child) => filterMenuItemByProfile(child, usuarioPerfil))
    .filter((child): child is MenuItem => child !== null);

  if (filteredChildren.length === 0 && !item.path) return null;
  return { ...item, children: filteredChildren };
}

function ItemBadge({
  visible,
  collapsed,
  value,
}: {
  visible: boolean;
  collapsed: boolean;
  value: number;
}): JSX.Element | null {
  if (!visible || value <= 0) return null;

  const label = value > 99 ? '99+' : String(value);

  if (collapsed) {
    return (
      <span className="absolute right-2 top-2 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-[var(--color-error-600)] px-1 text-[9px] font-semibold text-white">
        {label}
      </span>
    );
  }

  return (
    <span className="ml-auto inline-flex min-w-[1.2rem] items-center justify-center rounded-full bg-[var(--color-error-600)] px-1.5 text-[10px] font-semibold text-white">
      {label}
    </span>
  );
}

function MenuItemComponent({
  item,
  collapsed,
  depth = 0,
  onNavigate,
}: {
  item: MenuItem;
  collapsed: boolean;
  depth?: number;
  onNavigate?: () => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const location = useLocation();
  const hasChildren = !!item.children?.length;
  const isActive = item.path ? location.pathname === item.path : false;
  const isChildActive = item.children?.some((child) =>
    child.path ? location.pathname === child.path : false
  );

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors sm:py-2.5 ${
            isChildActive
              ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-gray-50)] hover:text-[var(--color-text-primary)]'
          }`}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          <Icon name={item.icon} className="h-4 w-4 shrink-0" />
          {!collapsed ? (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              <Icon
                name="chevron-right"
                className={`h-4 w-4 transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`}
              />
            </>
          ) : null}
        </button>

        {!collapsed ? (
          <div
            className={`mt-1 space-y-1 overflow-hidden transition-all duration-300 ${
              expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            {item.children!.map((child) => (
              <MenuItemComponent
                key={child.id}
                item={child}
                collapsed={collapsed}
                depth={depth + 1}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <NavLink
      to={item.path || '#'}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive: navActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-all sm:py-2.5 ${
          navActive || isActive
            ? 'bg-[var(--color-primary-600)] text-white shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-gray-50)] hover:text-[var(--color-text-primary)]'
        }`
      }
      style={{ paddingLeft: `${12 + depth * 12}px` }}
    >
      <Icon name={item.icon} className="h-4 w-4 shrink-0" />
      {!collapsed ? <span>{item.label}</span> : null}
    </NavLink>
  );
}

function MenuSectionComponent({
  section,
  collapsed,
  expanded,
  onToggleExpanded,
  onNavigate,
  unreadComunicados = 0,
}: {
  section: MenuSection;
  collapsed: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onNavigate?: () => void;
  unreadComunicados?: number;
}): JSX.Element {
  const location = useLocation();
  const isActive = location.pathname.startsWith(section.basePath);
  const hasItems = section.items.length > 0;
  const sectionId = `sidebar-section-${section.id}`;
  const showUnreadBadge = section.id === 'comunicados' && unreadComunicados > 0;

  if (!hasItems) {
    return (
      <NavLink
        to={section.basePath}
        onClick={onNavigate}
        title={collapsed ? section.label : undefined}
        aria-label={collapsed ? section.label : undefined}
        className={({ isActive: navActive }) =>
          `relative flex items-center gap-3 rounded-xl px-3 py-3 transition-all sm:py-2.5 ${
            navActive || isActive
              ? 'bg-[var(--color-primary-600)] text-white shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-gray-50)] hover:text-[var(--color-text-primary)]'
          }`
        }
      >
        <Icon name={section.icon} className="h-5 w-5 shrink-0" />
        {!collapsed ? <span className="font-medium">{section.label}</span> : null}
        <ItemBadge visible={showUnreadBadge} collapsed={collapsed} value={unreadComunicados} />
      </NavLink>
    );
  }

  return (
    <div>
      <button
        onClick={onToggleExpanded}
        title={collapsed ? section.label : undefined}
        aria-expanded={expanded}
        aria-controls={sectionId}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 transition-colors sm:py-2.5 ${
          isActive
            ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-gray-50)] hover:text-[var(--color-text-primary)]'
        }`}
      >
        <Icon name={section.icon} className="h-5 w-5 shrink-0" />
        {!collapsed ? (
          <>
            <span className="flex-1 text-left font-medium">{section.label}</span>
            <Icon
              name="chevron-right"
              className={`h-4 w-4 transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`}
            />
          </>
        ) : null}
      </button>

      {!collapsed ? (
        <div
          id={sectionId}
          className={`ml-3 overflow-hidden border-l border-[var(--color-border-primary)] pl-3 transition-all duration-300 ${
            expanded ? 'mt-2 max-h-[500px] opacity-100' : 'mt-0 max-h-0 opacity-0'
          }`}
        >
          <div className="space-y-1">
            {section.items.map((item) => (
              <MenuItemComponent
                key={item.id}
                item={item}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  onMobileClose,
  unreadComunicados = 0,
}: SidebarProps): JSX.Element {
  const { logout, usuario } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const perfilUsuario = usuario?.perfil;

  const visibleSections = menuSections
    .filter((section) => canAccessByProfile(perfilUsuario, section.allowedProfiles))
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => filterMenuItemByProfile(item, perfilUsuario))
        .filter((item): item is MenuItem => item !== null),
    }))
    .filter((section) => section.items.length > 0 || !section.allowedProfiles);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const stored = new Set(getStoredSections());
    const activeSection = visibleSections.find((s) => location.pathname.startsWith(s.basePath));
    if (activeSection) stored.add(activeSection.id);
    return stored;
  });

  const toggleSection = (sectionId: string): void => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      setStoredSections([...next]);
      return next;
    });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userInitials =
    usuario?.nome
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w: string) => w[0]?.toUpperCase() ?? '')
      .join('') || 'U';

  return (
    <aside
      className={`flex h-full flex-col border-r border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-[17rem]'
      }`}
    >
      <div className="border-b border-[var(--color-border-primary)] p-3">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-xs">
              <img
                src="/images/logo-icon.png"
                alt="Recorda"
                className="h-full w-full object-contain"
              />
            </div>

            {!collapsed ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                  Recorda
                </p>
                <p className="truncate text-xs text-[var(--color-text-tertiary)]">
                  Gestão documental e operação
                </p>
              </div>
            ) : null}
          </div>

          <button
            onClick={onToggle}
            className="hidden rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-gray-50)] md:inline-flex"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} className="h-5 w-5" />
          </button>

          {onMobileClose ? (
            <button
              onClick={onMobileClose}
              className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-gray-50)] md:hidden"
              aria-label="Fechar menu"
            >
              <Icon name="x" className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visibleSections.map((section) => (
          <MenuSectionComponent
            key={section.id}
            section={section}
            collapsed={collapsed}
            expanded={expandedSections.has(section.id)}
            onToggleExpanded={() => toggleSection(section.id)}
            onNavigate={onMobileClose}
            unreadComunicados={unreadComunicados}
          />
        ))}
      </nav>

      <div className="border-t border-[var(--color-border-primary)] p-3">
        {!collapsed && usuario ? (
          <div className="mb-2 flex items-center gap-3 rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-600)] text-xs font-semibold text-white">
              {userInitials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                {usuario.nome}
              </p>
              <p className="truncate text-xs capitalize text-[var(--color-text-tertiary)]">
                {usuario.perfil}
              </p>
            </div>
          </div>
        ) : null}

        <button
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-error-50)] hover:text-[var(--color-error-700)]"
          title={collapsed ? 'Sair do sistema' : undefined}
          aria-label={collapsed ? 'Sair do sistema' : undefined}
        >
          <Icon name="logout" className="h-5 w-5 shrink-0" />
          {!collapsed ? <span className="font-medium">Sair</span> : null}
        </button>
      </div>
    </aside>
  );
}
