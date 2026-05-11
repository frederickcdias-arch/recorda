import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
}

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function PageHeader({
  title,
  subtitle,
  actions,
  badge,
  className,
}: PageHeaderProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
            {title}
          </h1>
          {badge}
        </div>

        {subtitle ? (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{subtitle}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}
