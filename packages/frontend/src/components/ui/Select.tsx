import { forwardRef } from 'react';
import { Icon } from './Icon';

type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  helperText?: string;
  selectSize?: SelectSize;
  options?: SelectOption[];
  placeholder?: string;
}

const sizeClasses: Record<SelectSize, string> = {
  sm: 'h-8 pl-3 pr-8 text-sm',
  md: 'h-11 sm:h-9 pl-3.5 pr-9 text-sm',
  lg: 'h-11 sm:h-10 pl-4 pr-10 text-base',
};

const chevronPositionClasses: Record<SelectSize, string> = {
  sm: 'right-2',
  md: 'right-2.5',
  lg: 'right-3',
};

const chevronSizeClasses: Record<SelectSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-4 h-4',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      hint,
      helperText,
      selectSize = 'md',
      options,
      placeholder,
      className = '',
      id,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            className={`
              w-full rounded-lg border bg-white appearance-none
              transition-all duration-150 ease-in-out
              focus:outline-none
              ${sizeClasses[selectSize]}
              ${
                error
                  ? 'border-[var(--color-error-300)] focus:border-[var(--color-error-500)] focus:ring-[3px] focus:ring-[var(--color-error-100)]'
                  : 'border-[var(--color-gray-300)] focus:border-[var(--color-primary-500)] focus:ring-[3px] focus:ring-[var(--color-primary-100)]'
              }
              ${
                disabled
                  ? 'bg-[var(--color-gray-50)] text-[var(--color-gray-500)] cursor-not-allowed'
                  : 'text-[var(--color-text-primary)]'
              }
              ${className}
            `}
            {...props}
          >
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <div
            className={`absolute ${chevronPositionClasses[selectSize]} top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-gray-400)]`}
          >
            <Icon name="chevron-down" className={chevronSizeClasses[selectSize]} aria-hidden />
          </div>
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-[var(--color-error-600)] flex items-center gap-1">
            <Icon name="x" className="w-3.5 h-3.5" aria-hidden />
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

Select.displayName = 'Select';
