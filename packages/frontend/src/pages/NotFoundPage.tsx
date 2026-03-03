import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { Button } from '../components/ui/Button';

export function NotFoundPage(): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--color-bg-secondary)] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-[var(--color-border-primary)] shadow-[var(--shadow-lg)] max-w-md w-full p-10 text-center">
        <div className="w-16 h-16 bg-[var(--color-primary-50)] rounded-full flex items-center justify-center mx-auto mb-6">
          <Icon name="search" className="w-8 h-8 text-[var(--color-primary-600)]" />
        </div>
        <p className="text-5xl font-bold text-[var(--color-primary-600)] mb-2">404</p>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
          Página não encontrada
        </h1>
        <p className="text-[var(--color-text-secondary)] mb-8">
          A página que você está procurando não existe ou foi movida.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Voltar
          </Button>
          <Button variant="primary" onClick={() => navigate('/dashboard')}>
            Ir para o Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
