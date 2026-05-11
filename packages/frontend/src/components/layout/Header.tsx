import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  onMenuToggle: () => void;
  title?: string;
}

const PERFIL_LABELS: Record<string, string> = {
  administrador: 'Administrador',
  operador: 'Operador',
  colaborador: 'Colaborador',
  supervisor: 'Supervisor',
};

function formatPerfil(perfil: string): string {
  return PERFIL_LABELS[perfil] ?? perfil.charAt(0).toUpperCase() + perfil.slice(1);
}

export function Header({ onMenuToggle, title }: HeaderProps): JSX.Element {
  const { usuario, logout } = useAuth();
  const breadcrumbs = buildBreadcrumbs(title);

  const initial = usuario?.nome?.trim()?.charAt(0)?.toUpperCase() ?? 'U';
  const perfilLabel = usuario?.perfil ? formatPerfil(usuario.perfil) : '';

  return (
    <header className="bg-[var(--color-bg-primary)] border-b border-[var(--color-border-primary)] h-16 flex items-center px-4 gap-4">
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg hover:bg-[var(--color-gray-100)] text-[var(--color-text-secondary)] md:hidden"
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
            {i > 0 && <span className="text-[var(--color-gray-300)]">/</span>}
            {i < breadcrumbs.length - 1 ? (
              <span className="text-[var(--color-text-tertiary)] truncate">{crumb}</span>
            ) : (
              <span className="text-[var(--color-text-primary)] font-semibold truncate">
                {crumb}
              </span>
            )}
          </span>
        ))}
      </nav>

      {/* Mobile title */}
      {title && (
        <h1 className="text-base font-semibold text-[var(--color-text-primary)] sm:hidden truncate">
          {title.split(' - ').pop()}
        </h1>
      )}

      <div className="flex-1" />

      {/* User area */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Name + profile — desktop only */}
        {usuario && (
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate max-w-[160px]">
              {usuario.nome}
            </span>
            <span className="text-xs text-[var(--color-text-secondary)]">{perfilLabel}</span>
          </div>
        )}

        {/* Avatar */}
        <div
          aria-hidden="true"
          className="h-9 w-9 rounded-full bg-[var(--color-primary-100)] text-[var(--color-primary-700)] flex items-center justify-center text-sm font-semibold shrink-0 select-none"
        >
          {initial}
        </div>

        {/* Logout button */}
        <Button
          variant="ghost"
          size="sm"
          icon="log-out"
          onClick={() => void logout()}
          aria-label="Sair do sistema"
          title="Sair do sistema"
          className="hidden sm:flex"
        >
          Sair
        </Button>
        <button
          onClick={() => void logout()}
          aria-label="Sair do sistema"
          title="Sair do sistema"
          className="sm:hidden p-2 rounded-lg hover:bg-[var(--color-gray-100)] text-[var(--color-text-secondary)]"
        >
          <Icon name="log-out" className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

function buildBreadcrumbs(title?: string): string[] {
  if (!title) return ['Recorda'];
  return title.split(' - ').map((s) => s.trim());
}
