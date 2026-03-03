/**
 * Badge - Componente para tags, status e labels
 */

import { Icon } from './Icon';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: string;
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-gray-100)] text-[var(--color-gray-700)] border-[var(--color-gray-200)]',
  primary: 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)] border-[var(--color-primary-200)]',
  success: 'bg-[var(--color-success-50)] text-[var(--color-success-700)] border-[var(--color-success-200)]',
  warning: 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)] border-[var(--color-warning-200)]',
  error: 'bg-[var(--color-error-50)] text-[var(--color-error-700)] border-[var(--color-error-200)]',
  info: 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)] border-[var(--color-primary-200)]',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-gray-500)]',
  primary: 'bg-[var(--color-primary-500)]',
  success: 'bg-[var(--color-success-500)]',
  warning: 'bg-[var(--color-warning-500)]',
  error: 'bg-[var(--color-error-500)]',
  info: 'bg-[var(--color-primary-500)]',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-xs px-1.5 py-0.5 gap-1',
  md: 'text-xs px-2 py-1 gap-1.5',
  lg: 'text-sm px-2.5 py-1 gap-1.5',
};

const iconSizes: Record<BadgeSize, string> = {
  sm: 'w-3 h-3',
  md: 'w-3.5 h-3.5',
  lg: 'w-4 h-4',
};

const dotSizes: Record<BadgeSize, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2 h-2',
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  icon,
  dot = false,
  removable = false,
  onRemove,
  className = '',
}: BadgeProps): JSX.Element {
  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-md border
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`${dotSizes[size]} ${dotColors[variant]} rounded-full`} />
      )}
      {icon && !dot && (
        <Icon name={icon} className={iconSizes[size]} />
      )}
      {children}
      {removable && onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 -mr-0.5 p-0.5 rounded hover:bg-black/10 transition-colors"
          aria-label="Remover"
        >
          <Icon name="x" className={iconSizes[size]} />
        </button>
      )}
    </span>
  );
}

/**
 * StatusBadge - Badge específico para status
 */
type StatusType = 'active' | 'inactive' | 'pending' | 'error' | 'success';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  size?: BadgeSize;
}

const statusConfig: Record<StatusType, { variant: BadgeVariant; label: string }> = {
  active: { variant: 'success', label: 'Ativo' },
  inactive: { variant: 'default', label: 'Inativo' },
  pending: { variant: 'warning', label: 'Pendente' },
  error: { variant: 'error', label: 'Erro' },
  success: { variant: 'success', label: 'Sucesso' },
};

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps): JSX.Element {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} size={size} dot>
      {label || config.label}
    </Badge>
  );
}
