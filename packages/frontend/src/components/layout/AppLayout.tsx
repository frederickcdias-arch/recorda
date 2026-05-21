import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileBottomNav } from './MobileBottomNav';
import { useAuth } from '../../contexts/AuthContext';
import { useComunicadosNaoLidos } from '../../hooks/useQueries';
import { ensurePushSubscription } from '../../services/pushNotifications';
import { useToastHelpers } from '../ui/Toast';
import { getPageTitle } from '../../config/menu';

export function AppLayout(): JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paginaVisivel, setPaginaVisivel] = useState(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );
  const location = useLocation();
  const { usuario } = useAuth();
  const toast = useToastHelpers();
  const previousUnreadCountRef = useRef<number | null>(null);
  const initialUnreadToastShownRef = useRef(false);

  const pollingAtivo = !!usuario && paginaVisivel;
  const comunicadosNaoLidosQuery = useComunicadosNaoLidos({
    enabled: !!usuario,
    refetchInterval: pollingAtivo ? 45_000 : false,
  });
  const unreadComunicados = comunicadosNaoLidosQuery.data?.totalNaoLidos ?? 0;

  const pageTitle = getPageTitle(location.pathname);

  useEffect(() => {
    document.title = `${pageTitle} | Recorda`;
  }, [pageTitle]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setPaginaVisivel(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!usuario) {
      previousUnreadCountRef.current = null;
      initialUnreadToastShownRef.current = false;
      return;
    }

    if (previousUnreadCountRef.current === null) {
      previousUnreadCountRef.current = unreadComunicados;

      if (
        unreadComunicados > 0 &&
        !initialUnreadToastShownRef.current &&
        !location.pathname.startsWith('/comunicados')
      ) {
        initialUnreadToastShownRef.current = true;
        toast.info(
          unreadComunicados === 1 ? 'Comunicado pendente' : 'Comunicados pendentes',
          unreadComunicados === 1
            ? 'Voce entrou no sistema com 1 comunicado nao lido.'
            : `Voce entrou no sistema com ${unreadComunicados} comunicados nao lidos.`
        );
      }

      return;
    }

    if (
      unreadComunicados > previousUnreadCountRef.current &&
      !location.pathname.startsWith('/comunicados')
    ) {
      const novos = unreadComunicados - previousUnreadCountRef.current;
      toast.info(
        novos === 1 ? 'Novo comunicado interno' : 'Novos comunicados internos',
        novos === 1
          ? 'Existe 1 comunicado nao lido aguardando sua leitura.'
          : `Existem ${novos} novos comunicados nao lidos aguardando sua leitura.`
      );
    }

    previousUnreadCountRef.current = unreadComunicados;
  }, [location.pathname, toast, unreadComunicados, usuario]);

  useEffect(() => {
    if (!usuario) {
      return;
    }

    let cancelled = false;
    let retryTimeout: number | null = null;

    const attemptSubscription = async (attempt = 1): Promise<void> => {
      if (cancelled) {
        return;
      }

      try {
        await ensurePushSubscription();

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription || attempt >= 5) {
          return;
        }
      } catch {
        if (attempt >= 5 || cancelled) {
          return;
        }
      }

      retryTimeout = window.setTimeout(() => {
        void attemptSubscription(attempt + 1);
      }, 1_500);
    };

    retryTimeout = window.setTimeout(() => {
      void attemptSubscription();
    }, 750);

    return () => {
      cancelled = true;
      if (retryTimeout) {
        window.clearTimeout(retryTimeout);
      }
    };
  }, [usuario]);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[var(--color-bg-secondary)] md:flex">
      <div className="hidden shrink-0 md:flex">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          unreadComunicados={unreadComunicados}
        />
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full animate-slide-in-left">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileMenuOpen(false)}
              onMobileClose={() => setMobileMenuOpen(false)}
              unreadComunicados={unreadComunicados}
            />
          </div>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden">
        <Header
          onMenuToggle={() => setMobileMenuOpen(true)}
          title={pageTitle}
          unreadComunicados={unreadComunicados}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-24 pt-4 sm:px-5 md:px-6 md:pb-8 md:pt-6">
          <div
            key={location.pathname}
            className="mx-auto min-w-0 max-w-[1600px] animate-fade-in-up"
          >
            <Outlet />
          </div>
        </main>
      </div>
      <MobileBottomNav unreadComunicados={unreadComunicados} />
    </div>
  );
}
