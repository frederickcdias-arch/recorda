import { Icon } from './Icon';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';
type AlertSize = 'sm' | 'md';

interface AlertProps {
  variant: AlertVariant;
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  size?: AlertSize;
  className?: string;
}

const variantStyles: Record<AlertVariant, {
  container: string;
  icon: string;
  iconName: string;
  title: string;
  text: string;
  closeBtn: string;
}> = {
  info: {
    container: 'bg-[var(--color-primary-25)] border-[var(--color-primary-200)]',
    icon: 'text-[var(--color-primary-600)]',
    iconName: 'help-circle',
    title: 'text-[var(--color-primary-900)]',
    text: 'text-[var(--color-primary-700)]',
    closeBtn: 'text-[var(--color-primary-500)] hover:text-[var(--color-primary-700)] hover:bg-[var(--color-primary-100)]',
  },
  success: {
    container: 'bg-[var(--color-success-25)] border-[var(--color-success-200)]',
    icon: 'text-[var(--color-success-600)]',
    iconName: 'check-square',
    title: 'text-[var(--color-success-900)]',
    text: 'text-[var(--color-success-700)]',
    closeBtn: 'text-[var(--color-success-500)] hover:text-[var(--color-success-700)] hover:bg-[var(--color-success-100)]',
  },
  warning: {
    container: 'bg-[var(--color-warning-25)] border-[var(--color-warning-200)]',
    icon: 'text-[var(--color-warning-600)]',
    iconName: 'help-circle',
    title: 'text-[var(--color-warning-900)]',
    text: 'text-[var(--color-warning-700)]',
    closeBtn: 'text-[var(--color-warning-500)] hover:text-[var(--color-warning-700)] hover:bg-[var(--color-warning-100)]',
  },
  error: {
    container: 'bg-[var(--color-error-25)] border-[var(--color-error-200)]',
    icon: 'text-[var(--color-error-600)]',
    iconName: 'x',
    title: 'text-[var(--color-error-900)]',
    text: 'text-[var(--color-error-700)]',
    closeBtn: 'text-[var(--color-error-500)] hover:text-[var(--color-error-700)] hover:bg-[var(--color-error-100)]',
  },
};

const sizeStyles: Record<AlertSize, { padding: string; iconSize: string; gap: string }> = {
  sm: { padding: 'p-3', iconSize: 'w-4 h-4', gap: 'gap-2.5' },
  md: { padding: 'p-4', iconSize: 'w-5 h-5', gap: 'gap-3' },
};

export function Alert({ 
  variant, 
  title, 
  children, 
  onClose,
  size = 'md',
  className = '',
}: AlertProps): JSX.Element {
  const styles = variantStyles[variant];
  const sizeStyle = sizeStyles[size];

  return (
    <div 
      className={`
        ${styles.container} border rounded-lg ${sizeStyle.padding}
        animate-fade-in-up
        ${className}
      `}
      role="alert"
    >
      <div className={`flex ${sizeStyle.gap}`}>
        <div className={`${styles.icon} flex-shrink-0 mt-0.5`}>
          <Icon name={styles.iconName} className={sizeStyle.iconSize} />
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={`font-medium ${styles.title} ${size === 'sm' ? 'text-sm' : 'text-base'} mb-0.5`}>
              {title}
            </h4>
          )}
          <div className={`${styles.text} ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
            {children}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`
              ${styles.closeBtn} flex-shrink-0 
              rounded-md p-1 -m-1
              transition-colors duration-150
            `}
            aria-label="Fechar alerta"
          >
            <Icon name="x" className={sizeStyle.iconSize} />
          </button>
        )}
      </div>
    </div>
  );
}
