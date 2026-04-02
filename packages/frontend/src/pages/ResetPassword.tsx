import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
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

    if (novaSenha.length < 6) {
      setMensagem({ tipo: 'error', texto: 'A senha deve ter pelo menos 6 caracteres.' });
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 space-y-2">
          <div
            className="w-16 h-16 mx-auto rounded-full shadow-lg bg-white"
            style={{
              backgroundImage: 'url(/images/logo-icon.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
            aria-label="Recorda - Gestão de Produção"
          />
          <div>
            <p className="text-white font-semibold tracking-wide uppercase text-sm">Recorda</p>
            <p className="text-blue-100 text-xs">Gestão de Produção</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">Redefinir senha</h2>
          <p className="text-gray-500 text-sm text-center mb-6">
            Insira o token recebido por e-mail e defina sua nova senha.
          </p>

          {mensagem && (
            <div className="mb-4">
              <Alert variant={mensagem.tipo} onClose={() => setMensagem(null)}>
                {mensagem.texto}
              </Alert>
            </div>
          )}

          {!redefinido ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
                  Token de redefinição
                </label>
                <input
                  id="token"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Cole o token recebido por e-mail"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono text-sm"
                  required
                  disabled={carregando}
                />
              </div>

              <div>
                <label htmlFor="novaSenha" className="block text-sm font-medium text-gray-700 mb-1">
                  Nova senha
                </label>
                <input
                  id="novaSenha"
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                  minLength={6}
                  disabled={carregando}
                />
                <p className="text-xs text-gray-400 mt-1">Mínimo de 6 caracteres</p>
              </div>

              <div>
                <label
                  htmlFor="confirmarSenha"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Confirmar nova senha
                </label>
                <input
                  id="confirmarSenha"
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                  minLength={6}
                  disabled={carregando}
                />
              </div>

              <button
                type="submit"
                disabled={carregando}
                className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {carregando ? 'Redefinindo...' : 'Redefinir senha'}
              </button>
            </form>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-blue-600"
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
              <p className="text-gray-600 mb-4">Sua senha foi redefinida com sucesso.</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-all"
              >
                Ir para o login
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium text-sm">
              ← Voltar para o login
            </Link>
          </div>
        </div>

        <p className="text-center text-blue-200 text-sm mt-6">
          © 2026 Recorda. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
