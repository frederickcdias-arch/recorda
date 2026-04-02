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
      <div className="flex flex-col items-center justify-center min-h-[300px] py-12">
        <LoadingSpinner size="lg" className="text-[var(--color-primary-600)] mb-4" />
        <p className="text-[var(--color-text-secondary)] font-medium">
          {loadingMessage ?? 'Carregando...'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-[var(--color-border-primary)] p-8 text-center max-w-lg mx-auto my-8">
        <div className="w-16 h-16 bg-[var(--color-gray-100)] rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon name="x" className="w-8 h-8 text-[var(--color-gray-500)]" />
        </div>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
          Algo deu errado
        </h3>
        <p className="text-[var(--color-text-secondary)] mb-2">{error.message}</p>
        {error.details && (
          <p className="text-sm text-[var(--color-text-tertiary)] mb-4">{error.details}</p>
        )}
        {error.action && (
          <Button variant="primary" onClick={error.action.onClick}>
            {error.action.label}
          </Button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="bg-white rounded-xl border border-[var(--color-border-primary)] p-12 text-center">
        <div className="w-16 h-16 bg-[var(--color-gray-100)] rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon name={empty.icon} className="w-8 h-8 text-[var(--color-gray-400)]" />
        </div>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
          {empty.title}
        </h3>
        <p className="text-[var(--color-text-tertiary)] max-w-md mx-auto mb-6">
          {empty.description}
        </p>
        {empty.action && (
          <Button variant="primary" onClick={empty.action.onClick}>
            {empty.action.label}
          </Button>
        )}
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
    icon: 'help-circle',
    iconBg: 'bg-[var(--color-warning-100)]',
    iconColor: 'text-[var(--color-warning-600)]',
    titleColor: 'text-[var(--color-text-primary)]',
    textColor: 'text-[var(--color-text-secondary)]',
  },
  info: {
    bg: 'bg-[var(--color-primary-50)]',
    border: 'border-[var(--color-primary-200)]',
    icon: 'help-circle',
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
    <div className={`${styles.bg} ${styles.border} border rounded-xl p-4`}>
      <div className="flex gap-4">
        <div
          className={`${styles.iconBg} w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0`}
        >
          <Icon name={styles.icon} className={`w-5 h-5 ${styles.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className={`font-semibold ${styles.titleColor}`}>{title}</h4>
              <p className={`text-sm ${styles.textColor} mt-0.5`}>{shortMessage}</p>
            </div>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className={`${styles.iconColor} hover:opacity-70 p-1 -m-1`}
                aria-label="Fechar"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            )}
          </div>
          {action && (
            <button
              onClick={action.onClick}
              className={`mt-3 text-sm font-medium ${styles.iconColor} hover:underline`}
            >
              {action.label} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
