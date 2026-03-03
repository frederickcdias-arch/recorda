import { NavLink } from 'react-router-dom';
import { Icon } from '../ui/Icon';

const mobileNavItems = [
  { id: 'dashboard', label: 'Início', icon: 'dashboard', path: '/dashboard' },
  { id: 'recebimento', label: 'Receb.', icon: 'inbox', path: '/operacao/recebimento' },
  { id: 'producao', label: 'Produção', icon: 'bar-chart', path: '/producao' },
  { id: 'relatorios', label: 'Relatórios', icon: 'file-text', path: '/relatorios/gerenciais' },
] as const;

export function MobileBottomNav(): JSX.Element {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-4">
        {mobileNavItems.map((item) => (
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
