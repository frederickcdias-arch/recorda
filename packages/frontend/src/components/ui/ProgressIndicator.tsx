/** Visual progress dots showing checklist/producao/relatorio completion state. */

interface ProgressStep {
  label: string;
  done: boolean;
  active?: boolean;
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
  className?: string;
}

export function ProgressIndicator({ steps, className = '' }: ProgressIndicatorProps): JSX.Element {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1" title={step.label}>
          <span
            className={`h-2 w-2 rounded-full ${
              step.done
                ? 'bg-[var(--color-primary-600)]'
                : step.active
                  ? 'bg-[var(--color-primary-300)]'
                  : 'bg-[var(--color-border-primary)]'
            }`}
          />
          <span
            className={`text-[10px] leading-none ${
              step.done
                ? 'font-medium text-[var(--color-primary-700)]'
                : 'text-[var(--color-text-tertiary)]'
            }`}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
