import type { ReactNode } from 'react';

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

interface FilterBarProps {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function FilterBar({ children, actions, className }: FilterBarProps): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-4 shadow-xs',
        className
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {children}
        </div>

        {actions ? (
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
