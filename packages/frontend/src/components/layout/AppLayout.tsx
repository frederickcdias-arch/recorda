import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileBottomNav } from './MobileBottomNav';

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/operacao': 'Operação',
  '/operacao/recebimento': 'Operação - Recebimento',
  '/operacao/controle-qualidade': 'Operação - Controle de Qualidade',
  '/operacao/conhecimento': 'Operação - Conhecimento',
  '/producao': 'Produção',
  '/producao/importar': 'Produção - Importar',
  '/relatorios': 'Relatórios',
  '/relatorios/gerenciais': 'Relatórios Gerenciais',
  '/relatorios/exportacoes': 'Exportações',
  '/configuracoes': 'Configurações',
  '/configuracoes/empresa': 'Empresa',
  '/configuracoes/usuarios': 'Usuários',
  '/configuracoes/admin': 'Administração',
  '/auditoria': 'Auditoria',
  '/auditoria/importacoes': 'Auditoria de Importações',
  '/auditoria/ocr': 'Auditoria de OCR',
  '/auditoria/correcoes': 'Auditoria de Correções',
  '/auditoria/acoes': 'Ações de Usuários',
};

export function AppLayout(): JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const pageTitle = routeTitles[location.pathname] || 'Recorda';

  useEffect(() => {
    document.title = `${pageTitle} | Recorda`;
  }, [pageTitle]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - Desktop */}
      <div className="hidden md:flex">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Sidebar - Mobile Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileMenuOpen(false)}
              onMobileClose={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onMenuToggle={() => setMobileMenuOpen(true)}
          title={pageTitle}
        />
        <main className="flex-1 overflow-auto p-4 pb-24 md:p-6 md:pb-6">
          <div key={location.pathname} className="animate-fade-in-up">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
