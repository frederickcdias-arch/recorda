import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';
import { api } from '../services/api';
import { AuthShell } from './auth/AuthShell';

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
    <AuthShell
      title="Redefinir senha"
      subtitle="Informe o token e defina a nova senha."
      footer={
        <Link
          to="/login"
          className="font-medium text-[var(--color-primary-600)] transition-colors duration-200 hover:text-[var(--color-primary-700)]"
        >
          Voltar ao login
        </Link>
      }
    >
      {mensagem && (!redefinido || mensagem.tipo === 'error') ? (
        <div className="mb-4">
          <Alert variant={mensagem.tipo} onClose={() => setMensagem(null)}>
            {mensagem.texto}
          </Alert>
        </div>
      ) : null}

      {!redefinido ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="token"
            type="text"
            label="Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Cole o token recebido por e-mail"
            inputSize="lg"
            className="font-mono text-sm"
            required
            disabled={carregando}
          />

          <Input
            id="novaSenha"
            type="password"
            label="Nova senha"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            placeholder="••••••••"
            leftIcon="lock"
            inputSize="lg"
            helperText="Mínimo de 8 caracteres"
            required
            minLength={8}
            disabled={carregando}
          />

          <Input
            id="confirmarSenha"
            type="password"
            label="Confirmar nova senha"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            placeholder="••••••••"
            leftIcon="lock"
            inputSize="lg"
            required
            minLength={8}
            disabled={carregando}
          />

          <Button type="submit" size="lg" fullWidth loading={carregando} disabled={carregando}>
            Redefinir senha
          </Button>
        </form>
      ) : (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary-50)] text-[var(--color-primary-600)]">
            <Icon name="check" className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Senha redefinida</p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {mensagem?.texto ?? 'Sua senha foi atualizada com sucesso.'}
            </p>
          </div>
          <Button type="button" size="lg" fullWidth onClick={() => navigate('/login')}>
            Ir para o login
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
