import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';
import { AuthShell } from './auth/AuthShell';

function validateEmail(value: string): string {
  if (!value) return 'E-mail é obrigatório';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'E-mail inválido';
  return '';
}

function validatePassword(value: string): string {
  if (!value) return 'Senha é obrigatória';
  if (value.length < 8) return 'Senha deve ter no mínimo 8 caracteres';
  return '';
}

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const {
    login,
    autenticado,
    carregando,
    erro,
    limparErro,
    rememberMe: savedRememberMe,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [lembrarMe, setLembrarMe] = useState(savedRememberMe);
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailError = touched.email ? validateEmail(email) : '';
  const passwordError = touched.password ? validatePassword(password) : '';
  const isFormValid = !validateEmail(email) && !validatePassword(password);

  useEffect(() => {
    if (autenticado) {
      navigate('/dashboard');
    }
  }, [autenticado, navigate]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!isFormValid) return;
    limparErro();
    const sucesso = await login(email, password, lembrarMe);
    if (sucesso) {
      navigate('/dashboard');
    }
  };

  return (
    <AuthShell
      title="Acesso restrito"
      subtitle="Entre com suas credenciais corporativas para continuar."
      brandSubtitle="Plataforma interna de operação e controle de produção"
      footer="Uso exclusivo de usuários autorizados"
    >
      {erro ? (
        <div className="mb-4">
          <Alert variant="error" onClose={limparErro}>
            {erro}
          </Alert>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Input
          id="email"
          type="email"
          label="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          placeholder="seu@email.com"
          error={emailError}
          leftIcon="mail"
          inputSize="lg"
          autoComplete="email"
          disabled={carregando}
        />

        <Input
          id="password"
          type={showPassword ? 'text' : 'password'}
          label="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          placeholder="••••••••"
          error={passwordError}
          leftIcon="lock"
          rightIcon={showPassword ? 'eye-off' : 'eye'}
          onRightIconClick={() => setShowPassword((v) => !v)}
          inputSize="lg"
          autoComplete="current-password"
          disabled={carregando}
        />

        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer select-none items-center gap-2.5 text-[var(--color-text-secondary)]">
            <span
              onClick={() => setLembrarMe((v) => !v)}
              role="checkbox"
              aria-checked={lembrarMe}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setLembrarMe((v) => !v);
                }
              }}
              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors duration-200 ${
                lembrarMe
                  ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-600)]'
                  : 'border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:border-[var(--color-primary-300)]'
              }`}
            >
              {lembrarMe ? <Icon name="check" className="h-2.5 w-2.5 text-white" /> : null}
            </span>
            Manter sessão ativa
          </label>
          <Link
            to="/forgot-password"
            className="font-medium text-[var(--color-primary-600)] transition-colors duration-200 hover:text-[var(--color-primary-700)]"
          >
            Recuperar acesso
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={carregando}
          disabled={carregando}
        >
          Entrar
        </Button>
      </form>
    </AuthShell>
  );
}
