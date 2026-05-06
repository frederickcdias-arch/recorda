import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import type { PerfilUsuario } from '@recorda/shared';
import { useAuth } from '../../contexts/AuthContext';
import { useToastHelpers } from '../ui/Toast';

interface RoleRouteProps {
  allowedProfiles: PerfilUsuario[];
  children: React.ReactNode;
}

function AccessDeniedRedirect(): JSX.Element {
  const toast = useToastHelpers();
  const navigate = useNavigate();

  useEffect(() => {
    toast.warning('Acesso negado', 'Você não tem permissão para acessar esta página.');
    navigate('/dashboard', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <></>;
}

export function RoleRoute({ allowedProfiles, children }: RoleRouteProps): JSX.Element {
  const { usuario, carregando } = useAuth();
  const location = useLocation();

  if (carregando) {
    return <></>;
  }

  if (!usuario) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!allowedProfiles.includes(usuario.perfil)) {
    return <AccessDeniedRedirect />;
  }

  return <>{children}</>;
}
