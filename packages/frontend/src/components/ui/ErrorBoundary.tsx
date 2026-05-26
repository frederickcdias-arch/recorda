import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)] p-6">
        <div className="w-full max-w-lg rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)]">
            <Icon name="x" className="h-7 w-7 text-[var(--color-text-tertiary)]" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">
            Erro inesperado
          </h2>
          <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
            Ocorreu uma falha inesperada. Recarregue a página e tente novamente.
          </p>
          {this.state.error && process.env.NODE_ENV !== 'production' && (
            <pre className="mb-4 max-h-40 overflow-auto rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 text-left text-xs text-[var(--color-text-secondary)]">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button variant="ghost" onClick={this.handleReset}>
              Tentar novamente
            </Button>
            <Button variant="primary" onClick={this.handleReload}>
              Recarregar página
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
