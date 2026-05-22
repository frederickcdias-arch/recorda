import React from 'react';

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
  className?: string;
}

export function Table({ children, className, ...rest }: TableProps): JSX.Element {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-xs">
      <table className={cn('min-w-full border-collapse', className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

interface TableHeadProps {
  children: React.ReactNode;
  className?: string;
}

export function TableHead({ children, className }: TableHeadProps): JSX.Element {
  return <thead className={cn('bg-[var(--color-gray-50)]', className)}>{children}</thead>;
}

interface TableBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function TableBody({ children, className }: TableBodyProps): JSX.Element {
  return (
    <tbody
      className={cn(
        'divide-y divide-[var(--color-border-primary)] bg-[var(--color-bg-primary)]',
        className
      )}
    >
      {children}
    </tbody>
  );
}

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function TableRow({ children, className, onClick, ...rest }: TableRowProps): JSX.Element {
  return (
    <tr
      className={cn(
        'transition-colors',
        onClick
          ? 'cursor-pointer hover:bg-[var(--color-gray-50)]'
          : 'hover:bg-[var(--color-gray-50)]',
        className
      )}
      onClick={onClick}
      {...rest}
    >
      {children}
    </tr>
  );
}

type Align = 'left' | 'center' | 'right';
type SortDirection = 'asc' | 'desc' | null;

const alignClass: Record<Align, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const sortIcon: Record<'asc' | 'desc' | 'none', string> = {
  asc: '↑',
  desc: '↓',
  none: '↕',
};

interface TableHeaderProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode;
  className?: string;
  align?: Align;
  sortable?: boolean;
  sortDirection?: SortDirection;
  onSort?: () => void;
}

export function TableHeader({
  children,
  className,
  align = 'left',
  sortable = false,
  sortDirection = null,
  onSort,
  ...rest
}: TableHeaderProps): JSX.Element {
  const base =
    'border-b border-[var(--color-border-primary)] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] sm:text-xs';

  const icon =
    sortDirection === 'asc'
      ? sortIcon.asc
      : sortDirection === 'desc'
        ? sortIcon.desc
        : sortIcon.none;

  return (
    <th className={cn(base, alignClass[align], className)} {...rest}>
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            'inline-flex items-center gap-1 transition-colors hover:text-[var(--color-text-primary)]',
            align === 'center' && 'w-full justify-center',
            align === 'right' && 'w-full justify-end'
          )}
        >
          {children}
          <span className="text-[var(--color-text-tertiary)]" aria-hidden="true">
            {icon}
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode;
  className?: string;
  align?: Align;
  colSpan?: number;
  hideOnMobile?: boolean;
}

export function TableCell({
  children,
  className,
  align = 'left',
  colSpan,
  hideOnMobile = false,
  ...rest
}: TableCellProps): JSX.Element {
  return (
    <td
      className={cn(
        'px-4 py-3 align-top text-sm text-[var(--color-text-primary)]',
        alignClass[align],
        hideOnMobile && 'hidden sm:table-cell',
        className
      )}
      colSpan={colSpan}
      {...rest}
    >
      {children}
    </td>
  );
}

interface TableEmptyStateProps {
  colSpan: number;
  title: string;
  description?: string;
}

export function TableEmptyState({
  colSpan,
  title,
  description,
}: TableEmptyStateProps): JSX.Element {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center sm:py-12">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
          {description ? (
            <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
