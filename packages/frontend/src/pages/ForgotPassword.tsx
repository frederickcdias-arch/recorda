import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { api } from '../services/api';

export function ForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setCarregando(true);
    setMensagem(null);

    try {
      const response = await api.post<{ message: string; resetToken?: string }>('/auth/forgot-password', { email }, { skipAuth: true });
      setMensagem({ tipo: 'success', texto: response.message });
      setEnviado(true);
      
      // Token de reset é enviado por email em produção
      // Em desenvolvimento, o token é retornado na resposta para facilitar testes
      void response.resetToken; // Ignorar em produção
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 
        (error as { error?: string })?.error || 'Erro ao processar solicitação';
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">
            Esqueci minha senha
          </h2>
          <p className="text-gray-500 text-sm text-center mb-6">
            Digite seu e-mail para receber instruções de redefinição de senha.
          </p>

          {mensagem && (
            <div className="mb-4">
              <Alert variant={mensagem.tipo} onClose={() => setMensagem(null)}>
                {mensagem.texto}
              </Alert>
            </div>
          )}

          {!enviado ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                  disabled={carregando}
                />
              </div>

              <button
                type="submit"
                disabled={carregando}
                className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {carregando ? 'Enviando...' : 'Enviar instruções'}
              </button>
            </form>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-600 mb-4">
                Verifique sua caixa de entrada e siga as instruções enviadas.
              </p>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link 
              to="/login" 
              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
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
