import { Navigate, useLocation } from 'react-router-dom';
import type { PerfilUsuario } from '@recorda/shared';
import { useAuth } from '../../contexts/AuthContext';

interface RoleRouteProps {
  allowedProfiles: PerfilUsuario[];
  children: React.ReactNode;
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
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
