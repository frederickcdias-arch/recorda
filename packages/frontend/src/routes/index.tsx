import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { RoleRoute } from '../components/auth/RoleRoute';
import { RouteErrorFallback } from '../components/ui/RouteErrorFallback';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

const LoginPage = lazy(() => import('../pages/Login').then((m) => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPassword').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('../pages/ResetPassword').then((m) => ({ default: m.ResetPasswordPage })));
const DashboardPage = lazy(() => import('../pages/Dashboard').then((m) => ({ default: m.DashboardPage })));
const ProducaoPage = lazy(() => import('../pages/operacao/ProducaoPage').then((m) => ({ default: m.ProducaoPage })));
const ImportarProducaoPage = lazy(() => import('../pages/producao/ImportarProducaoPage').then((m) => ({ default: m.ImportarProducaoPage })));
const EtapaOperacionalPage = lazy(() => import('../pages/operacao/EtapaOperacionalPage').then((m) => ({ default: m.EtapaOperacionalPage })));
const ConhecimentoOperacionalPage = lazy(() => import('../pages/operacao/ConhecimentoOperacionalPage').then((m) => ({ default: m.ConhecimentoOperacionalPage })));
const RelatoriosGerenciaisPage = lazy(() => import('../pages/relatorios/RelatoriosGerenciaisPage').then((m) => ({ default: m.RelatoriosGerenciaisPage })));
const ExportacoesPage = lazy(() => import('../pages/relatorios/ExportacoesPage').then((m) => ({ default: m.ExportacoesPage })));
const EmpresaPage = lazy(() => import('../pages/configuracoes/EmpresaPage').then((m) => ({ default: m.EmpresaPage })));
const UsuariosPage = lazy(() => import('../pages/configuracoes/UsuariosPage').then((m) => ({ default: m.UsuariosPage })));
const AdminPage = lazy(() => import('../pages/configuracoes/AdminPage').then((m) => ({ default: m.AdminPage })));
const AuditoriaPage = lazy(() => import('../pages/auditoria/AuditoriaPage').then((m) => ({ default: m.AuditoriaPage })));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

function PageSuspense({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[300px]">
        <LoadingSpinner size="lg" className="text-[var(--color-primary-600)]" />
      </div>
    }>
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <PageSuspense><LoginPage /></PageSuspense>,
  },
  {
    path: '/forgot-password',
    element: <PageSuspense><ForgotPasswordPage /></PageSuspense>,
  },
  {
    path: '/reset-password',
    element: <PageSuspense><ResetPasswordPage /></PageSuspense>,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorFallback />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <PageSuspense><DashboardPage /></PageSuspense>,
      },
      {
        path: 'producao',
        element: <PageSuspense><ProducaoPage /></PageSuspense>,
      },
      {
        path: 'producao/importar',
        element: <PageSuspense><ImportarProducaoPage /></PageSuspense>,
      },
      {
        path: 'operacao',
        element: <Navigate to="/operacao/recebimento" replace />,
      },
      {
        path: 'operacao/:etapa',
        element: <PageSuspense><EtapaOperacionalPage /></PageSuspense>,
      },
      {
        path: 'operacao/conhecimento',
        element: <PageSuspense><ConhecimentoOperacionalPage /></PageSuspense>,
      },
      {
        path: 'relatorios',
        element: <Navigate to="/relatorios/gerenciais" replace />,
      },
      {
        path: 'relatorios/gerenciais',
        element: <PageSuspense><RelatoriosGerenciaisPage /></PageSuspense>,
      },
      {
        path: 'relatorios/exportacoes',
        element: <PageSuspense><ExportacoesPage /></PageSuspense>,
      },
      {
        path: 'configuracoes',
        element: <Navigate to="/configuracoes/empresa" replace />,
      },
      {
        path: 'configuracoes/empresa',
        element: (
          <RoleRoute allowedProfiles={['administrador']}>
            <PageSuspense><EmpresaPage /></PageSuspense>
          </RoleRoute>
        ),
      },
      {
        path: 'configuracoes/usuarios',
        element: (
          <RoleRoute allowedProfiles={['administrador']}>
            <PageSuspense><UsuariosPage /></PageSuspense>
          </RoleRoute>
        ),
      },
      {
        path: 'configuracoes/admin',
        element: (
          <RoleRoute allowedProfiles={['administrador']}>
            <PageSuspense><AdminPage /></PageSuspense>
          </RoleRoute>
        ),
      },
      {
        path: 'auditoria',
        element: <Navigate to="/auditoria/importacoes" replace />,
      },
      {
        path: 'auditoria/importacoes',
        element: (
          <RoleRoute allowedProfiles={['administrador']}>
            <PageSuspense><AuditoriaPage categoria="importacoes" /></PageSuspense>
          </RoleRoute>
        ),
      },
      {
        path: 'auditoria/ocr',
        element: (
          <RoleRoute allowedProfiles={['administrador']}>
            <PageSuspense><AuditoriaPage categoria="ocr" /></PageSuspense>
          </RoleRoute>
        ),
      },
      {
        path: 'auditoria/correcoes',
        element: (
          <RoleRoute allowedProfiles={['administrador']}>
            <PageSuspense><AuditoriaPage categoria="correcoes" /></PageSuspense>
          </RoleRoute>
        ),
      },
      {
        path: 'auditoria/acoes',
        element: (
          <RoleRoute allowedProfiles={['administrador']}>
            <PageSuspense><AuditoriaPage categoria="acoes" /></PageSuspense>
          </RoleRoute>
        ),
      },
      {
        path: '*',
        element: <PageSuspense><NotFoundPage /></PageSuspense>,
      },
    ],
  },
  {
    path: '*',
    element: <PageSuspense><NotFoundPage /></PageSuspense>,
  },
]);
