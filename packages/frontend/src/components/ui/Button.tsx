import { LoadingSpinner } from './LoadingSpinner';
import { Icon } from './Icon';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconPosition?: 'left' | 'right';
  iconOnly?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  children?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: `
    bg-[var(--color-primary-600)] text-white 
    hover:bg-[var(--color-primary-700)] 
    active:bg-[var(--color-primary-800)]
    focus-visible:ring-[3px] focus-visible:ring-[var(--color-primary-100)]
    shadow-sm hover:shadow
  `,
  secondary: `
    bg-white text-[var(--color-gray-700)] 
    border border-[var(--color-gray-300)]
    hover:bg-[var(--color-gray-50)] hover:border-[var(--color-gray-400)]
    active:bg-[var(--color-gray-100)]
    focus-visible:ring-[3px] focus-visible:ring-[var(--color-gray-100)]
    shadow-sm
  `,
  outline: `
    bg-transparent text-[var(--color-primary-600)] 
    border border-[var(--color-primary-300)]
    hover:bg-[var(--color-primary-50)] hover:border-[var(--color-primary-400)]
    active:bg-[var(--color-primary-100)]
    focus-visible:ring-[3px] focus-visible:ring-[var(--color-primary-100)]
  `,
  ghost: `
    bg-transparent text-[var(--color-gray-600)] 
    hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-700)]
    active:bg-[var(--color-gray-200)]
    focus-visible:ring-[3px] focus-visible:ring-[var(--color-gray-100)]
  `,
  danger: `
    bg-[var(--color-error-600)] text-white 
    hover:bg-[var(--color-error-700)]
    active:bg-[var(--color-error-800)]
    focus-visible:ring-[3px] focus-visible:ring-[var(--color-error-100)]
    shadow-sm hover:shadow
  `,
  success: `
    bg-[var(--color-success-600)] text-white 
    hover:bg-[var(--color-success-700)]
    active:bg-[var(--color-success-800)]
    focus-visible:ring-[3px] focus-visible:ring-[var(--color-success-100)]
    shadow-sm hover:shadow
  `,
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1',
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-10 px-5 text-base gap-2',
};

const iconOnlySizeClasses: Record<ButtonSize, string> = {
  xs: 'h-7 w-7',
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-10 w-10',
};

const iconSizeClasses: Record<ButtonSize, string> = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  iconOnly = false,
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps): JSX.Element {
  const isDisabled = disabled || loading;

  return (
    <button
      className={`
        inline-flex items-center justify-center font-medium
        rounded-lg transition-all duration-150 ease-in-out
        focus:outline-none
        disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
        ${variantClasses[variant]}
        ${iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={isDisabled}
      {...props}
    >
      {loading && <LoadingSpinner size="sm" className="shrink-0" />}
      {!loading && icon && iconPosition === 'left' && (
        <Icon name={icon} className={`shrink-0 ${iconSizeClasses[size]}`} />
      )}
      {!iconOnly && children}
      {!loading && icon && iconPosition === 'right' && (
        <Icon name={icon} className={`shrink-0 ${iconSizeClasses[size]}`} />
      )}
    </button>
  );
}
