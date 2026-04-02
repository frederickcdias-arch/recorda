import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { api } from '../services/api';

export function ResetPasswordPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(searchParams.get('token') || '');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );

  useEffect(() => {
    // Se não houver token na URL, redirecionar para forgot-password
    const urlToken = searchParams.get('token');
    if (!urlToken) {
      navigate('/forgot-password');
    }
  }, [searchParams, navigate]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setCarregando(true);
    setMensagem(null);

    // Validações
    if (!token || !novaSenha || !confirmacaoSenha) {
      setMensagem({ tipo: 'error', texto: 'Todos os campos são obrigatórios' });
      setCarregando(false);
      return;
    }

    if (novaSenha.length < 8) {
      setMensagem({ tipo: 'error', texto: 'A senha deve ter pelo menos 8 caracteres' });
      setCarregando(false);
      return;
    }

    if (novaSenha !== confirmacaoSenha) {
      setMensagem({ tipo: 'error', texto: 'As senhas não coincidem' });
      setCarregando(false);
      return;
    }

    try {
      const response = await api.post<{ message: string }>(
        '/auth/reset-password',
        { token, novaSenha },
        { skipAuth: true }
      );

      setMensagem({ tipo: 'success', texto: response.message });

      // Redirecionar para login após 3 segundos
      setTimeout(() => {
        navigate('/login');
      }, 3000);
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
            Digite o token recebido e sua nova senha.
          </p>

          {mensagem && (
            <div className="mb-4">
              <Alert variant={mensagem.tipo} onClose={() => setMensagem(null)}>
                {mensagem.texto}
              </Alert>
            </div>
          )}

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
                placeholder="Mínimo 8 caracteres"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                required
                disabled={carregando}
                minLength={8}
              />
            </div>

            <div>
              <label
                htmlFor="confirmacaoSenha"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Confirme a nova senha
              </label>
              <input
                id="confirmacaoSenha"
                type="password"
                value={confirmacaoSenha}
                onChange={(e) => setConfirmacaoSenha(e.target.value)}
                placeholder="Digite a senha novamente"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                required
                disabled={carregando}
                minLength={8}
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

          <div className="mt-6 text-center space-y-2">
            <Link
              to="/forgot-password"
              className="text-blue-600 hover:text-blue-700 font-medium text-sm block"
            >
              ← Solicitar novo token
            </Link>
            <Link
              to="/login"
              className="text-gray-500 hover:text-gray-700 font-medium text-sm block"
            >
              Voltar para o login
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
