import { Card } from '../../components/ui/Card';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps): JSX.Element {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--color-bg-secondary)] px-4 py-8 sm:px-6 sm:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-[70%] rounded-full bg-[var(--color-primary-100)] blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 translate-x-1/4 translate-y-1/4 rounded-full bg-[var(--color-primary-50)] blur-3xl" />
      </div>

      <div className="relative w-full max-w-[28rem]">
        <div className="mb-6 text-center sm:mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-sm">
            <img
              src="/images/logo-icon.png"
              alt="Recorda - Gestão documental e operacional"
              className="h-full w-full object-cover"
            />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">Recorda</p>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
            Gestão documental e operacional
          </p>
        </div>

        <Card padding="md" className="p-5 sm:p-8">
          <div className="mb-6 space-y-1 text-center sm:mb-7">
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)] sm:text-2xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-sm text-[var(--color-text-secondary)]">{subtitle}</p>
            ) : null}
          </div>

          {children}
        </Card>

        {footer ? (
          <div className="mt-4 text-center text-sm text-[var(--color-text-tertiary)]">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
