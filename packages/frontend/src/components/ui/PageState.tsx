import { Icon } from './Icon';
import { LoadingSpinner } from './LoadingSpinner';
import { Button } from './Button';

interface ErrorInfo {
  message: string;
  details?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface PageStateProps {
  loading?: boolean;
  loadingMessage?: string;
  error?: ErrorInfo | null;
  empty?: {
    icon: string;
    title: string;
    description: string;
    action?: {
      label: string;
      onClick: () => void;
    };
  } | null;
  children: React.ReactNode;
}

export function PageState({
  loading,
  loadingMessage,
  error,
  empty,
  children,
}: PageStateProps): JSX.Element {
  if (loading) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] py-12 shadow-xs">
        <LoadingSpinner size="lg" className="mb-4 text-[var(--color-primary-600)]" />
        <p className="font-medium text-[var(--color-text-secondary)]">
          {loadingMessage ?? 'Carregando...'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto my-8 max-w-lg rounded-2xl border border-[var(--color-error-200)] bg-[var(--color-bg-primary)] p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-error-50)]">
          <Icon name="alert-circle" className="h-8 w-8 text-[var(--color-error-500)]" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">
          Algo deu errado
        </h3>
        <p className="mb-2 text-[var(--color-text-secondary)]">{error.message}</p>
        {error.details ? (
          <p className="mb-4 text-sm text-[var(--color-text-tertiary)]">{error.details}</p>
        ) : null}
        {error.action ? (
          <Button variant="primary" onClick={error.action.onClick}>
            {error.action.label}
          </Button>
        ) : null}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-12 text-center shadow-xs">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-gray-100)]">
          <Icon name={empty.icon} className="h-8 w-8 text-[var(--color-gray-400)]" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">
          {empty.title}
        </h3>
        <p className="mx-auto mb-6 max-w-md text-[var(--color-text-tertiary)]">
          {empty.description}
        </p>
        {empty.action ? (
          <Button variant="primary" onClick={empty.action.onClick}>
            {empty.action.label}
          </Button>
        ) : null}
      </div>
    );
  }

  return <>{children}</>;
}

interface ActionFeedbackProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  onDismiss?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const feedbackStyles = {
  success: {
    bg: 'bg-[var(--color-success-50)]',
    border: 'border-[var(--color-success-200)]',
    icon: 'check-square',
    iconBg: 'bg-[var(--color-success-100)]',
    iconColor: 'text-[var(--color-success-600)]',
    titleColor: 'text-[var(--color-success-900)]',
    textColor: 'text-[var(--color-success-700)]',
  },
  error: {
    bg: 'bg-[var(--color-error-50)]',
    border: 'border-[var(--color-error-200)]',
    icon: 'x',
    iconBg: 'bg-[var(--color-error-100)]',
    iconColor: 'text-[var(--color-error-600)]',
    titleColor: 'text-[var(--color-error-900)]',
    textColor: 'text-[var(--color-error-700)]',
  },
  warning: {
    bg: 'bg-[var(--color-warning-50)]',
    border: 'border-[var(--color-warning-200)]',
    icon: 'alert-triangle',
    iconBg: 'bg-[var(--color-warning-100)]',
    iconColor: 'text-[var(--color-warning-600)]',
    titleColor: 'text-[var(--color-text-primary)]',
    textColor: 'text-[var(--color-text-secondary)]',
  },
  info: {
    bg: 'bg-[var(--color-primary-50)]',
    border: 'border-[var(--color-primary-200)]',
    icon: 'info',
    iconBg: 'bg-[var(--color-primary-100)]',
    iconColor: 'text-[var(--color-primary-600)]',
    titleColor: 'text-[var(--color-primary-900)]',
    textColor: 'text-[var(--color-primary-700)]',
  },
};

export function ActionFeedback({
  type,
  title,
  message,
  onDismiss,
  action,
}: ActionFeedbackProps): JSX.Element {
  const styles = feedbackStyles[type];
  const displayMessage = typeof message === 'string' ? message : JSON.stringify(message);
  const shortMessage =
    displayMessage.length > 1000 ? `${displayMessage.slice(0, 1000)}...` : displayMessage;

  return (
    <div className={`${styles.bg} ${styles.border} rounded-2xl border p-4 shadow-xs`}>
      <div className="flex gap-4">
        <div
          className={`${styles.iconBg} flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl`}
        >
          <Icon name={styles.icon} className={`h-5 w-5 ${styles.iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className={`font-semibold ${styles.titleColor}`}>{title}</h4>
              <p className={`mt-0.5 text-sm ${styles.textColor}`}>{shortMessage}</p>
            </div>
            {onDismiss ? (
              <button
                onClick={onDismiss}
                className={`${styles.iconColor} -m-1 p-1 hover:opacity-70`}
                aria-label="Fechar"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            ) : null}
          </div>
          {action ? (
            <button
              onClick={action.onClick}
              className={`mt-3 text-sm font-medium ${styles.iconColor} hover:underline`}
            >
              {action.label} →
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
