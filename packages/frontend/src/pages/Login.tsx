import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Alert } from '../components/ui/Alert';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo e Branding */}
        <div className="text-center mb-8 space-y-2">
          <div className="w-16 h-16 mx-auto rounded-full shadow-lg bg-white overflow-hidden">
            <img
              src="/images/logo-icon.png"
              alt="Recorda - Gestão de Produção"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <p className="text-white font-semibold tracking-wide uppercase text-sm">Recorda</p>
            <p className="text-blue-100 text-xs">Gestão de Produção</p>
          </div>
        </div>

        {/* Card de Login */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-6 text-center">
            Acesse sua conta
          </h2>

          {erro && (
            <div className="mb-4">
              <Alert variant="error" onClose={limparErro}>
                {erro}
              </Alert>
            </div>
          )}

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
              <label className="flex items-center gap-2.5 text-[var(--color-text-secondary)] cursor-pointer select-none">
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
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors duration-150 flex-shrink-0 ${
                    lembrarMe
                      ? 'bg-[var(--color-primary-600)] border-[var(--color-primary-600)]'
                      : 'bg-white border-[var(--color-gray-300)] hover:border-[var(--color-primary-400)]'
                  }`}
                >
                  {lembrarMe && <Icon name="check" className="w-2.5 h-2.5 text-white" />}
                </span>
                Lembrar-me
              </label>
              <Link
                to="/forgot-password"
                className="text-[var(--color-primary-600)] hover:text-[var(--color-primary-700)] font-medium"
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

        {/* Footer */}
        <p className="text-center text-blue-200 text-sm mt-6">
          © 2026 Recorda. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
