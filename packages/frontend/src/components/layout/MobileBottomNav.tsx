import { NavLink } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { useAuth } from '../../contexts/AuthContext';

type NavItem = {
  id: string;
  label: string;
  icon: string;
  path: string;
  allowedProfiles?: string[];
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

export function MobileBottomNav(): JSX.Element {
  const { usuario } = useAuth();
  const perfil = usuario?.perfil;

  const visibleItems = mobileNavItems.filter(
    (item) => !item.allowedProfiles || (perfil && item.allowedProfiles.includes(perfil))
  );

  const colsClass: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className={`grid ${colsClass[visibleItems.length] ?? 'grid-cols-4'}`}>
        {visibleItems.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                `flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 ${
                  isActive ? 'text-blue-700' : 'text-gray-500'
                }`
              }
            >
              <Icon name={item.icon} className="h-5 w-5" />
              <span className="text-[11px] font-medium leading-none">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
