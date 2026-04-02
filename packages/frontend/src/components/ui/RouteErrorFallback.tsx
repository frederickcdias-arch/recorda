import { useRouteError, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

export function RouteErrorFallback(): JSX.Element {
  const error = useRouteError() as Error | { statusText?: string; message?: string };
  const navigate = useNavigate();

  const message =
    error instanceof Error
      ? error.message
      : ((error as { statusText?: string })?.statusText ?? 'Erro desconhecido');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 max-w-lg w-full p-8 text-center">
        <div className="mx-auto w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Icon name="x" className="w-7 h-7 text-gray-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Erro na página</h2>
        <p className="text-sm text-gray-500 mb-4">Não foi possível carregar esta página.</p>
        {import.meta.env.DEV && (
          <pre className="text-xs text-left bg-gray-50 border rounded-lg p-3 mb-4 overflow-auto max-h-40 text-gray-700">
            {message}
          </pre>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          >
            Voltar
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            Ir ao Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
