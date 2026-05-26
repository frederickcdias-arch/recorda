import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';
import { api } from '../services/api';
import { AuthShell } from './auth/AuthShell';

export function ForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email)) {
      setMensagem({ tipo: 'error', texto: 'Informe um endereço de e-mail válido' });
      return;
    }
    setCarregando(true);
    setMensagem(null);

    try {
      const response = await api.post<{ message: string; resetToken?: string }>(
        '/auth/forgot-password',
        { email },
        { skipAuth: true }
      );
      setMensagem({ tipo: 'success', texto: response.message });
      setEnviado(true);
      void response.resetToken;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : (error as { error?: string })?.error || 'Erro ao processar solicitação';
      setMensagem({ tipo: 'error', texto: errorMessage });
    } finally {
      setCarregando(false);
    }
  };

  return (
    <AuthShell
      title="Recuperar acesso"
      subtitle="Informe o e-mail para receber o link de redefinição."
      footer={
        <Link
          to="/login"
          className="font-medium text-[var(--color-primary-600)] transition-colors duration-200 hover:text-[var(--color-primary-700)]"
        >
          Voltar ao login
        </Link>
      }
    >
      {mensagem && (!enviado || mensagem.tipo === 'error') ? (
        <div className="mb-4">
          <Alert variant={mensagem.tipo} onClose={() => setMensagem(null)}>
            {mensagem.texto}
          </Alert>
        </div>
      ) : null}

      {!enviado ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="email"
            type="email"
            label="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            leftIcon="mail"
            inputSize="lg"
            required
            disabled={carregando}
          />

          <Button type="submit" size="lg" fullWidth loading={carregando} disabled={carregando}>
            Enviar link
          </Button>
        </form>
      ) : (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary-50)] text-[var(--color-primary-600)]">
            <Icon name="check" className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">E-mail enviado</p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {mensagem?.texto ?? 'Verifique sua caixa de entrada para continuar.'}
            </p>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
