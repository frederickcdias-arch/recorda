import { forwardRef } from 'react';
import { Icon } from './Icon';

type InputSize = 'sm' | 'md' | 'lg';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  helperText?: string;
  inputSize?: InputSize;
  leftIcon?: string;
  rightIcon?: string;
  onRightIconClick?: () => void;
}

const sizeClasses: Record<InputSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-10 px-4 text-base',
};

const iconPaddingClasses: Record<InputSize, { left: string; right: string }> = {
  sm: { left: 'pl-8', right: 'pr-8' },
  md: { left: 'pl-9', right: 'pr-9' },
  lg: { left: 'pl-10', right: 'pr-10' },
};

const iconSizeClasses: Record<InputSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

const iconPositionClasses: Record<InputSize, { left: string; right: string }> = {
  sm: { left: 'left-2.5', right: 'right-2.5' },
  md: { left: 'left-3', right: 'right-3' },
  lg: { left: 'left-3.5', right: 'right-3.5' },
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ 
    label, 
    error, 
    hint,
    helperText,
    inputSize = 'md',
    leftIcon,
    rightIcon,
    onRightIconClick,
    className = '', 
    id, 
    disabled,
    ...props 
  }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const hasLeftIcon = !!leftIcon;
    const hasRightIcon = !!rightIcon;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {hasLeftIcon && (
            <div className={`absolute ${iconPositionClasses[inputSize].left} top-1/2 -translate-y-1/2 pointer-events-none`}>
              <Icon 
                name={leftIcon} 
                className={`${iconSizeClasses[inputSize]} text-[var(--color-gray-400)]`} 
              />
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={`
              w-full rounded-lg border bg-white
              transition-all duration-150 ease-in-out
              placeholder:text-[var(--color-text-placeholder)]
              focus:outline-none
              ${sizeClasses[inputSize]}
              ${hasLeftIcon ? iconPaddingClasses[inputSize].left : ''}
              ${hasRightIcon ? iconPaddingClasses[inputSize].right : ''}
              ${error
                ? 'border-[var(--color-error-300)] focus:border-[var(--color-error-500)] focus:ring-[3px] focus:ring-[var(--color-error-100)]'
                : 'border-[var(--color-gray-300)] focus:border-[var(--color-primary-500)] focus:ring-[3px] focus:ring-[var(--color-primary-100)]'
              }
              ${disabled 
                ? 'bg-[var(--color-gray-50)] text-[var(--color-gray-500)] cursor-not-allowed' 
                : 'text-[var(--color-text-primary)]'
              }
              ${className}
            `}
            {...props}
          />
          {hasRightIcon && (
            <div 
              className={`absolute ${iconPositionClasses[inputSize].right} top-1/2 -translate-y-1/2 ${onRightIconClick ? 'cursor-pointer' : 'pointer-events-none'}`}
              onClick={onRightIconClick}
            >
              <Icon 
                name={rightIcon} 
                className={`${iconSizeClasses[inputSize]} text-[var(--color-gray-400)] ${onRightIconClick ? 'hover:text-[var(--color-gray-600)]' : ''}`} 
              />
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-[var(--color-error-600)] flex items-center gap-1">
            <Icon name="x" className="w-3.5 h-3.5" />
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">{helperText}</p>
        )}
        {hint && !error && !helperText && (
          <p className="mt-1.5 text-sm text-[var(--color-text-tertiary)]">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
