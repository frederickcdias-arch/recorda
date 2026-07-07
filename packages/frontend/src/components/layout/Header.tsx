import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { PerfilUsuario } from '@recorda/shared';
import type { Theme } from '../../contexts/ThemeContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

interface HeaderProps {
  onMenuToggle: () => void;
  title?: string;
  unreadComunicados?: number;
}

const PERFIL_LABELS: Record<string, string> = {
  administrador: 'Administrador',
  operador: 'Operador',
  colaborador: 'Colaborador',
  visualizador: 'Visualizador',
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

  useEffect((): void | (() => void) => {
    if (!open) return;
    const handler = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return (): void => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2]!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(): void => setOpen((value) => !value)}
        title={`Tema: ${current.label}`}
        aria-label={`Tema: ${current.label}`}
        aria-expanded={open ? 'true' : 'false'}
        className="rounded-xl border border-transparent p-2 text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-primary)] hover:bg-[var(--color-bg-primary)]"
      >
        <Icon name={current.icon} className="h-4 w-4" />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-[var(--z-dropdown)] mt-2 w-40 rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-1.5 shadow-lg">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                setTheme(option.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
                theme === option.value
                  ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
                  : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]'
              }`}
            >
              <Icon name={option.icon} className="h-3.5 w-3.5 shrink-0" />
              <span>{option.label}</span>
              {theme === option.value ? (
                <Icon name="check" className="ml-auto h-3 w-3 text-[var(--color-primary-600)]" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Header({ onMenuToggle, title, unreadComunicados = 0 }: HeaderProps): JSX.Element {
  const { usuario, logout, trocarPerfil } = useAuth();
  const breadcrumbs = buildBreadcrumbs(title);
  const currentSection = breadcrumbs[0] ?? 'Recorda';
  const currentPage = breadcrumbs[breadcrumbs.length - 1] ?? currentSection;

  const initial = usuario?.nome?.trim()?.charAt(0)?.toUpperCase() ?? 'U';
  const perfilAtual = usuario?.perfilAtivo ?? usuario?.perfil;
  const perfilLabel = perfilAtual ? formatPerfil(perfilAtual) : '';

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border-primary)] bg-[color:color-mix(in_srgb,var(--color-bg-primary)_92%,transparent)] backdrop-blur">
      <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-5 md:px-6">
        <button
          onClick={onMenuToggle}
          className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-2 text-[var(--color-text-secondary)] shadow-xs transition-colors hover:bg-[var(--color-bg-secondary)] md:hidden"
          aria-label="Abrir menu"
        >
          <Icon name="menu" className="h-6 w-6" />
        </button>

        <div className="flex h-10 w-10 items-center overflow-hidden rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-xs md:hidden">
          <img src="/images/logo-icon.png" alt="Recorda" className="h-full w-full object-contain" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
              {currentSection}
            </p>
            <p className="truncate text-base font-semibold text-[var(--color-text-primary)]">
              {currentPage}
            </p>
          </div>

          {title ? (
            <h1 className="truncate text-base font-semibold text-[var(--color-text-primary)] sm:hidden">
              {currentPage}
            </h1>
          ) : null}

          {usuario ? (
            <p className="hidden text-xs text-[var(--color-text-tertiary)] md:block">
              {perfilLabel}
              {usuario.nome ? ` • ${usuario.nome}` : ''}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          {usuario && (usuario.perfis?.length ?? 0) > 1 ? (
            <select
              value={perfilAtual}
              onChange={(event) => void trocarPerfil(event.target.value as PerfilUsuario)}
              className="hidden rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] sm:block"
              aria-label="Trocar perfil"
            >
              {(usuario.perfis ?? []).map((perfil) => (
                <option key={perfil} value={perfil}>
                  {formatPerfil(perfil)}
                </option>
              ))}
            </select>
          ) : null}

          <Link
            to="/comunicados"
            aria-label={
              unreadComunicados > 0
                ? `${unreadComunicados} comunicado(s) não lido(s)`
                : 'Abrir comunicados'
            }
            title={
              unreadComunicados > 0
                ? `${unreadComunicados} comunicado(s) não lido(s)`
                : 'Abrir comunicados'
            }
            className="relative rounded-xl border border-transparent p-2 text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-primary)] hover:bg-[var(--color-bg-primary)]"
          >
            <Icon name="mail" className="h-5 w-5" />
            {unreadComunicados > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[var(--color-primary-100)] px-1 text-[10px] font-semibold leading-4 text-[var(--color-primary-700)]">
                {unreadComunicados > 99 ? '99+' : unreadComunicados}
              </span>
            ) : null}
          </Link>

          {usuario ? (
            <div className="hidden min-w-0 sm:flex sm:flex-col sm:items-end sm:leading-tight">
              <span className="max-w-[160px] truncate text-sm font-medium text-[var(--color-text-primary)]">
                {usuario.nome}
              </span>
              <span className="text-xs text-[var(--color-text-secondary)]">{perfilLabel}</span>
            </div>
          ) : null}

          <div
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border border-[var(--color-primary-200)] bg-[var(--color-primary-50)] text-sm font-semibold text-[var(--color-primary-700)] sm:h-9 sm:w-9"
          >
            {initial}
          </div>

          <ThemeToggle />

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
            className="rounded-xl border border-transparent p-2 text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-primary)] hover:bg-[var(--color-bg-primary)] sm:hidden"
          >
            <Icon name="log-out" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function buildBreadcrumbs(title?: string): string[] {
  if (!title) return ['Recorda'];
  return title.split(' - ').map((segment) => segment.trim());
}
