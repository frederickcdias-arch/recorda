import { useNavigate, useRouteError } from 'react-router-dom';
import { Button } from './Button';
import { Icon } from './Icon';

export function RouteErrorFallback(): JSX.Element {
  const error = useRouteError() as Error | { statusText?: string; message?: string };
  const navigate = useNavigate();

  const message =
    error instanceof Error
      ? error.message
      : ((error as { statusText?: string })?.statusText ?? 'Erro desconhecido');

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)] p-6">
      <div className="w-full max-w-lg rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)]">
          <Icon name="x" className="h-7 w-7 text-[var(--color-text-tertiary)]" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">
          Erro na página
        </h2>
        <p className="mb-1 text-sm text-[var(--color-text-secondary)]">
          Não foi possível abrir esta tela.
        </p>
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">Volte e tente novamente.</p>
        {import.meta.env.DEV && (
          <pre className="mb-4 max-h-40 overflow-auto rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 text-left text-xs text-[var(--color-text-secondary)]">
            {message}
          </pre>
        )}
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Voltar
          </Button>
          <Button variant="primary" onClick={() => navigate('/dashboard')}>
            Ir ao Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
