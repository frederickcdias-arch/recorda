import { Icon } from '../ui/Icon';

interface HeaderProps {
  onMenuToggle: () => void;
  title?: string;
}

export function Header({ onMenuToggle, title }: HeaderProps): JSX.Element {
  const breadcrumbs = buildBreadcrumbs(title);

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center px-4 gap-4">
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 md:hidden"
        aria-label="Abrir menu"
      >
        <Icon name="menu" className="w-6 h-6" />
      </button>

      <div className="flex items-center rounded-full w-10 h-10 overflow-hidden shadow-sm md:hidden">
        <img src="/images/logo-icon.png" alt="Recorda" className="h-full w-full object-contain" />
      </div>

      {/* Breadcrumbs — desktop only */}
      <nav className="hidden sm:flex items-center gap-1.5 text-sm min-w-0">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <span className="text-gray-300">/</span>}
            {i < breadcrumbs.length - 1 ? (
              <span className="text-gray-400 truncate">{crumb}</span>
            ) : (
              <span className="text-gray-900 font-semibold truncate">{crumb}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Mobile title */}
      {title && (
        <h1 className="text-base font-semibold text-gray-900 sm:hidden truncate">
          {title.split(' - ').pop()}
        </h1>
      )}

      <div className="flex-1" />
    </header>
  );
}

function buildBreadcrumbs(title?: string): string[] {
  if (!title) return ['Recorda'];
  return title.split(' - ').map((s) => s.trim());
}
