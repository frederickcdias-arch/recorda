import { useRef, useState, useEffect } from 'react';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../contexts/ThemeContext';

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

const THEME_OPTIONS: { value: Theme; icon: string; label: string }[] = [
  { value: 'light', icon: 'sun', label: 'Claro' },
  { value: 'dark', icon: 'moon', label: 'Escuro' },
  { value: 'system', icon: 'monitor', label: 'Sistema' },
];

function ThemeToggle(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[2]!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Tema: ${current.label}`}
        aria-label={`Tema: ${current.label}`}
        aria-expanded={open}
        className="p-2 rounded-lg hover:bg-[var(--color-gray-100)] text-[var(--color-text-secondary)] transition-colors"
      >
        <Icon name={current.icon} className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-lg py-1 z-[var(--z-dropdown)]">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setTheme(opt.value);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                theme === opt.value
                  ? 'text-[var(--color-primary-600)] bg-[var(--color-primary-50)]'
                  : 'text-[var(--color-text-primary)] hover:bg-[var(--color-gray-50)]'
              }`}
            >
              <Icon name={opt.icon} className="w-3.5 h-3.5 shrink-0" />
              <span>{opt.label}</span>
              {theme === opt.value && (
                <Icon name="check" className="w-3 h-3 ml-auto text-[var(--color-primary-600)]" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

        {/* Theme toggle */}
        <ThemeToggle />

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
