import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const AppRouter = lazy(() => import('./routes').then((m) => ({ default: m.AppRouter })));

function AppBootstrapFallback(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)] px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <LoadingSpinner size="lg" className="text-[var(--color-primary-600)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">Carregando Recorda...</p>
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <Suspense fallback={<AppBootstrapFallback />}>
                <AppRouter />
              </Suspense>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
