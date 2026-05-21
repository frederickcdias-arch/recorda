import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 space-y-2 text-center">
          <div className="mx-auto h-16 w-16 overflow-hidden rounded-full bg-[var(--color-bg-primary)] shadow-lg">
            <img
              src="/images/logo-icon.png"
              alt="Recorda - Gestão documental e operacional"
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-white">Recorda</p>
            <p className="text-xs text-blue-100">Gestão documental e operacional</p>
          </div>
        </div>

        <div className="rounded-2xl bg-[var(--color-bg-primary)] p-8 shadow-2xl">
          <h2 className="mb-6 text-center text-xl font-semibold text-[var(--color-text-primary)]">
            Acesse sua conta
          </h2>

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

            <div className="flex items-center justify-between text-sm">
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
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 transition-colors duration-150 ${
                    lembrarMe
                      ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-600)]'
                      : 'border-[var(--color-gray-300)] bg-[var(--color-bg-primary)] hover:border-[var(--color-primary-400)]'
                  }`}
                >
                  {lembrarMe ? <Icon name="check" className="h-2.5 w-2.5 text-white" /> : null}
                </span>
                Manter acesso
              </label>
              <Link
                to="/forgot-password"
                className="font-medium text-[var(--color-primary-600)] hover:text-[var(--color-primary-700)]"
              >
                Esqueci a senha
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
        </div>

        <p className="mt-6 text-center text-sm text-blue-200">Recorda</p>
      </div>
    </div>
  );
}
