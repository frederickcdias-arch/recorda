import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { api } from '../services/api';

export function ResetPasswordPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromUrl = searchParams.get('token') ?? '';

  const [token, setToken] = useState(tokenFromUrl);
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );
  const [redefinido, setRedefinido] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setMensagem(null);

    if (!token.trim()) {
      setMensagem({ tipo: 'error', texto: 'O token de redefinição é obrigatório.' });
      return;
    }

    if (novaSenha.length < 8) {
      setMensagem({ tipo: 'error', texto: 'A senha deve ter pelo menos 8 caracteres.' });
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setMensagem({ tipo: 'error', texto: 'As senhas não coincidem.' });
      return;
    }

    setCarregando(true);

    try {
      const response = await api.post<{ message: string }>(
        '/auth/reset-password',
        {
          token: token.trim(),
          novaSenha,
        },
        { skipAuth: true }
      );
      setMensagem({ tipo: 'success', texto: response.message });
      setRedefinido(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : (error as { error?: string })?.error || 'Erro ao redefinir senha';
      setMensagem({ tipo: 'error', texto: errorMessage });
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 space-y-2 text-center">
          <div
            className="mx-auto h-16 w-16 rounded-full bg-[var(--color-bg-primary)] shadow-lg"
            style={{
              backgroundImage: 'url(/images/logo-icon.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
            aria-label="Recorda - Gestão documental e operacional"
          />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-white">Recorda</p>
            <p className="text-xs text-blue-100">Gestão documental e operacional</p>
          </div>
        </div>

        <div className="rounded-2xl bg-[var(--color-bg-primary)] p-8 shadow-2xl">
          <h2 className="mb-2 text-center text-xl font-semibold text-gray-900">Redefinir senha</h2>
          <p className="mb-6 text-center text-sm text-gray-500">
            Informe o token recebido e defina a nova senha.
          </p>

          {mensagem ? (
            <div className="mb-4">
              <Alert variant={mensagem.tipo} onClose={() => setMensagem(null)}>
                {mensagem.texto}
              </Alert>
            </div>
          ) : null}

          {!redefinido ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="token" className="mb-1 block text-sm font-medium text-gray-700">
                  Token de redefinição
                </label>
                <input
                  id="token"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Cole o token recebido por e-mail"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 font-mono text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={carregando}
                />
              </div>

              <div>
                <label htmlFor="novaSenha" className="mb-1 block text-sm font-medium text-gray-700">
                  Nova senha
                </label>
                <input
                  id="novaSenha"
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  required
                  minLength={8}
                  disabled={carregando}
                />
                <p className="mt-1 text-xs text-gray-400">Mínimo de 8 caracteres</p>
              </div>

              <div>
                <label
                  htmlFor="confirmarSenha"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Confirmar nova senha
                </label>
                <input
                  id="confirmarSenha"
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  required
                  minLength={8}
                  disabled={carregando}
                />
              </div>

              <button
                type="submit"
                disabled={carregando}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-all hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {carregando ? 'Redefinindo...' : 'Redefinir senha'}
              </button>
            </form>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                <svg
                  className="h-8 w-8 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="mb-4 text-gray-600">Sua senha foi redefinida com sucesso.</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-all hover:bg-blue-700 focus:ring-4 focus:ring-blue-200"
              >
                Ir para o login
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm font-medium text-blue-600 hover:text-blue-700">
              ← Voltar para o login
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-blue-200">Recorda</p>
      </div>
    </div>
  );
}
