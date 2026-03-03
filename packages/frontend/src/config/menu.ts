import type { MenuSection } from '../types/navigation';

export const menuSections: MenuSection[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    basePath: '/dashboard',
    items: [],
  },
  {
    id: 'producao',
    label: 'Produção',
    icon: 'bar-chart',
    basePath: '/producao',
    items: [
      { id: 'producao-painel', label: 'Painel', icon: 'bar-chart', path: '/producao' },
      { id: 'producao-importar', label: 'Importar Produção', icon: 'upload-cloud', path: '/producao/importar' },
    ],
  },
  {
    id: 'operacao',
    label: 'Operação',
    icon: 'clipboard',
    basePath: '/operacao',
    items: [
      { id: 'operacao-recebimento', label: 'Recebimento', icon: 'inbox', path: '/operacao/recebimento' },
      { id: 'operacao-cq', label: 'Controle de Qualidade', icon: 'shield', path: '/operacao/controle-qualidade' },
      { id: 'operacao-kb', label: 'Conhecimento', icon: 'book', path: '/operacao/conhecimento' },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: 'file-text',
    basePath: '/relatorios',
    items: [
      { id: 'gerenciais', label: 'Relatórios Gerenciais', icon: 'briefcase', path: '/relatorios/gerenciais' },
      { id: 'exportacoes', label: 'Exportações', icon: 'download', path: '/relatorios/exportacoes' },
    ],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    icon: 'settings',
    basePath: '/configuracoes',
    allowedProfiles: ['administrador'],
    items: [
      { id: 'empresa', label: 'Empresa', icon: 'building', path: '/configuracoes/empresa' },
      { id: 'usuarios', label: 'Usuários', icon: 'user-plus', path: '/configuracoes/usuarios' },
      { id: 'admin', label: 'Administração', icon: 'settings', path: '/configuracoes/admin' },
    ],
  },
  {
    id: 'auditoria',
    label: 'Auditoria',
    icon: 'shield',
    basePath: '/auditoria',
    allowedProfiles: ['administrador'],
    items: [
      { id: 'importacoes', label: 'Importações', icon: 'upload-cloud', path: '/auditoria/importacoes' },
      { id: 'ocr', label: 'OCR', icon: 'scan', path: '/auditoria/ocr' },
      { id: 'correcoes', label: 'Correções', icon: 'edit', path: '/auditoria/correcoes' },
      { id: 'acoes', label: 'Ações de Usuários', icon: 'user-check', path: '/auditoria/acoes' },
    ],
  },
];
