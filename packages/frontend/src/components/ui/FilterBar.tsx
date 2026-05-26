import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

interface FilterBarProps {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Number of active filters — shown on the mobile toggle button */
  activeCount?: number;
}

export function FilterBar({
  children,
  actions,
  className,
  activeCount,
}: FilterBarProps): JSX.Element {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-4 shadow-xs',
        className
      )}
    >
      {/* Mobile header: Filtros toggle + actions */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={mobileExpanded ? 'chevron-up' : 'filter'}
          onClick={() => setMobileExpanded((prev) => !prev)}
        >
          {mobileExpanded ? 'Ocultar' : `Filtros${activeCount ? ` (${String(activeCount)})` : ''}`}
        </Button>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {/* Filter grid — always visible on sm+, toggle on mobile */}
      <div
        className={cn(
          'flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between',
          mobileExpanded ? 'mt-4' : 'hidden sm:flex'
        )}
      >
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          {children}
        </div>

        {actions ? (
          <div className="hidden sm:flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
