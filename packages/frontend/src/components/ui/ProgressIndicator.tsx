/** Visual progress dots showing checklist/produção/relatório completion state. */

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
            className={`w-2 h-2 rounded-full ${
              step.done
                ? 'bg-primary-600'
                : step.active
                  ? 'bg-primary-300 animate-pulse'
                  : 'bg-gray-200'
            }`}
          />
          <span
            className={`text-[10px] leading-none ${step.done ? 'text-primary-700 font-medium' : 'text-gray-400'}`}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
