type CardVariant = 'default' | 'elevated' | 'outlined' | 'ghost';
type CardPadding = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: CardVariant;
  padding?: CardPadding;
  hover?: boolean;
  onClick?: () => void;
}

const variantClasses: Record<CardVariant, string> = {
  default:
    'bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] shadow-xs ring-1 ring-black/[0.02]',
  elevated: 'bg-[var(--color-bg-primary)] shadow-md border-0',
  outlined: 'bg-transparent border border-[var(--color-border-primary)]',
  ghost: 'bg-[var(--color-bg-secondary)] border-0',
};

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  xs: 'p-3',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
  xl: 'p-8',
};

export function Card({
  children,
  className = '',
  variant = 'default',
  padding = 'md',
  hover = false,
  onClick,
}: CardProps): JSX.Element {
  const isClickable = !!onClick;

  const tagClasses = `
        min-w-0 max-w-full rounded-2xl transition-all duration-200
        ${variantClasses[variant]}
        ${paddingClasses[padding]}
        ${hover || isClickable ? 'hover:shadow-sm hover:border-[var(--color-gray-300)] hover:-translate-y-0.5' : ''}
        ${isClickable ? 'cursor-pointer active:scale-[0.99]' : ''}
        ${className}
      `;

  if (isClickable) {
    return (
      <button type="button" className={tagClasses} onClick={onClick}>
        {children}
      </button>
    );
  }

  return <div className={tagClasses}>{children}</div>;
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function CardHeader({
  title,
  description,
  action,
  badge,
  className = '',
}: CardHeaderProps): JSX.Element {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5 ${className}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)] truncate">
            {title}
          </h3>
          {badge}
        </div>
        {description && (
          <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
  border?: boolean;
}

export function CardFooter({
  children,
  className = '',
  border = true,
}: CardFooterProps): JSX.Element {
  return (
    <div
      className={`
      mt-5 pt-4 
      ${border ? 'border-t border-[var(--color-border-secondary)]' : ''}
      ${className}
    `}
    >
      {children}
    </div>
  );
}

interface CardSectionProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
}

export function CardSection({
  children,
  title,
  description,
  className = '',
}: CardSectionProps): JSX.Element {
  return (
    <div className={`${className}`}>
      {(title || description) && (
        <div className="mb-3">
          {title && (
            <h4 className="text-sm font-medium text-[var(--color-text-primary)]">{title}</h4>
          )}
          {description && (
            <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
