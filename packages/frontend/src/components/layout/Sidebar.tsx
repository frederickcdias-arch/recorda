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

function canAccessByProfile(
  usuarioPerfil: string | undefined,
  allowedProfiles?: string[]
): boolean {
  if (!allowedProfiles || allowedProfiles.length === 0) {
    return true;
  }
  if (!usuarioPerfil) {
    return false;
  }
  return allowedProfiles.includes(usuarioPerfil);
}

function filterMenuItemByProfile(item: MenuItem, usuarioPerfil: string | undefined): MenuItem | null {
  if (!canAccessByProfile(usuarioPerfil, item.allowedProfiles)) {
    return null;
  }

  if (!item.children || item.children.length === 0) {
    return item;
  }

  const filteredChildren = item.children
    .map((child) => filterMenuItemByProfile(child, usuarioPerfil))
    .filter((child): child is MenuItem => child !== null);

  if (filteredChildren.length === 0 && !item.path) {
    return null;
  }

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
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            isChildActive
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          <Icon name={item.icon} className="w-4 h-4 flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              <Icon
                name={expanded ? 'chevron-down' : 'chevron-right'}
                className="w-4 h-4"
              />
            </>
          )}
        </button>
        {!collapsed && expanded && (
          <div className="mt-1 space-y-1">
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
      className={({ isActive: navActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          navActive || isActive
            ? 'bg-blue-600 text-white'
            : 'text-gray-600 hover:bg-gray-100'
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
  onNavigate,
}: {
  section: MenuSection;
  collapsed: boolean;
  onNavigate?: () => void;
}): JSX.Element {
  const location = useLocation();
  const isActive = location.pathname.startsWith(section.basePath);
  const [expanded, setExpanded] = useState(isActive);
  const hasItems = section.items.length > 0;

  if (!hasItems) {
    return (
      <NavLink
        to={section.basePath}
        onClick={onNavigate}
        title={collapsed ? section.label : undefined}
        className={({ isActive: navActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
            navActive || isActive
              ? 'bg-blue-600 text-white'
              : 'text-gray-700 hover:bg-gray-100'
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
        onClick={() => setExpanded(!expanded)}
        title={collapsed ? section.label : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
          isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <Icon name={section.icon} className="w-5 h-5 flex-shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left font-medium">{section.label}</span>
            <Icon
              name={expanded ? 'chevron-down' : 'chevron-right'}
              className="w-4 h-4 transition-transform duration-150"
            />
          </>
        )}
      </button>
      {!collapsed && expanded && (
        <div className="mt-1 ml-2 space-y-1 border-l-2 border-gray-200 pl-2">
          {section.items.map((item) => (
            <MenuItemComponent key={item.id} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ collapsed, onToggle, onMobileClose }: SidebarProps): JSX.Element {
  const { logout, usuario } = useAuth();
  const navigate = useNavigate();
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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside
      className={`bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
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
              <p className="font-bold text-gray-900 leading-tight">Recorda</p>
              <p className="text-xs text-blue-700">Gestão de Produção</p>
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
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} className="w-5 h-5" />
        </button>
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 md:hidden"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {visibleSections.map((section) => (
          <MenuSectionComponent key={section.id} section={section} collapsed={collapsed} onNavigate={onMobileClose} />
        ))}
      </nav>

      {/* Usuário e Logout */}
      <div className="p-3 border-t border-gray-200">
        {!collapsed && usuario && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium text-gray-900 truncate">{usuario.nome}</p>
            <p className="text-xs text-gray-500 truncate">{usuario.email}</p>
          </div>
        )}
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <Icon name="logout" className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="font-medium">Sair</span>}
        </button>
      </div>
    </aside>
  );
}
