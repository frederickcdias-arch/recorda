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
  const hasChildren = item.children && item.children.length > 0;
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
          className={`w-full flex items-center gap-3 px-3 py-3 sm:py-2 rounded-lg text-sm transition-colors touch-manipulation ${
            isChildActive
              ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)]'
          }`}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          <Icon name={item.icon} className="w-4 h-4 flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              <Icon
                name="chevron-right"
                className={`w-4 h-4 transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`}
              />
            </>
          )}
        </button>
        {!collapsed && (
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
        )}
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
        `flex items-center gap-3 px-3 py-3 sm:py-2 rounded-lg text-sm transition-colors touch-manipulation ${
          navActive || isActive
            ? 'bg-primary-600 text-white shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)]'
        }`
      }
      style={{ paddingLeft: `${12 + depth * 12}px` }}
    >
      <Icon name={item.icon} className="w-4 h-4 flex-shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );
}

function MenuSectionComponent({
  section,
  collapsed,
  expanded,
  onToggleExpanded,
  onNavigate,
}: {
  section: MenuSection;
  collapsed: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onNavigate?: () => void;
}): JSX.Element {
  const location = useLocation();
  const isActive = location.pathname.startsWith(section.basePath);
  const hasItems = section.items.length > 0;
  const sectionId = `sidebar-section-${section.id}`;

  if (!hasItems) {
    return (
      <NavLink
        to={section.basePath}
        onClick={onNavigate}
        title={collapsed ? section.label : undefined}
        aria-label={collapsed ? section.label : undefined}
        className={({ isActive: navActive }) =>
          `flex items-center gap-3 px-3 py-3 sm:py-2.5 rounded-lg transition-colors touch-manipulation ${
            navActive || isActive
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)]'
          }`
        }
      >
        <Icon name={section.icon} className="w-5 h-5 flex-shrink-0" />
        {!collapsed && <span className="font-medium">{section.label}</span>}
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
        className={`w-full flex items-center gap-3 px-3 py-3 sm:py-2.5 rounded-lg transition-colors touch-manipulation ${
          isActive
            ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)]'
        }`}
      >
        <Icon name={section.icon} className="w-5 h-5 flex-shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left font-medium">{section.label}</span>
            <Icon
              name="chevron-right"
              className={`w-4 h-4 transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`}
            />
          </>
        )}
      </button>
      {!collapsed && (
        <div
          id={sectionId}
          className={`ml-2 space-y-1 border-l-2 border-[var(--color-border-primary)] pl-2 overflow-hidden transition-all duration-300 ${
            expanded ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0 mt-0'
          }`}
        >
          {section.items.map((item) => (
            <MenuItemComponent
              key={item.id}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ collapsed, onToggle, onMobileClose }: SidebarProps): JSX.Element {
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
      className={`bg-[var(--color-bg-primary)] border-r border-[var(--color-border-primary)] flex flex-col h-full transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo / Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-border-primary)]">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full shadow-sm overflow-hidden">
              <img
                src="/images/logo-icon.png"
                alt="Recorda"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <p className="font-bold text-[var(--color-text-primary)] leading-tight">Recorda</p>
              <p className="text-xs text-primary-700">Gestão de Produção</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-9 h-9 rounded-full shadow-sm overflow-hidden mx-auto">
            <img
              src="/images/logo-icon.png"
              alt="Recorda"
              className="w-full h-full object-contain"
            />
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} className="w-5 h-5" />
        </button>
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] md:hidden"
            aria-label="Fechar menu"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {visibleSections.map((section) => (
          <MenuSectionComponent
            key={section.id}
            section={section}
            collapsed={collapsed}
            expanded={expandedSections.has(section.id)}
            onToggleExpanded={() => toggleSection(section.id)}
            onNavigate={onMobileClose}
          />
        ))}

        {/* UsuÃ¡rio e Logout */}
        <div className="pt-1 mt-1 border-t border-[var(--color-border-primary)]">
          {!collapsed && usuario && (
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-semibold select-none flex-shrink-0">
                {userInitials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate leading-tight">
                  {usuario.nome}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)] truncate leading-tight capitalize">
                  {usuario.perfil}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={() => void handleLogout()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-red-50 hover:text-red-600 transition-colors"
            title={collapsed ? 'Sair do sistema' : undefined}
            aria-label={collapsed ? 'Sair do sistema' : undefined}
          >
            <Icon name="logout" className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="font-medium">Sair</span>}
          </button>
        </div>
      </nav>
    </aside>
  );
}
