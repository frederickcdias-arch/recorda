import type { PerfilUsuario } from '@recorda/shared';
import { OPERACAO_ETAPA_MAP, OPERACAO_ETAPAS_ORDER } from './operacao-etapas';
import type { MenuItem, MenuSection } from '../types/navigation';

const operacaoFluxoMenuItems: MenuItem[] = OPERACAO_ETAPAS_ORDER.map((slug) => {
  const etapa = OPERACAO_ETAPA_MAP[slug];
  return {
    id: `operacao-${slug}`,
    label: etapa.label,
    icon: etapa.menuIcon,
    path: etapa.path,
  };
});

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
    allowedProfiles: ['operador', 'administrador'],
    items: [
      { id: 'producao-painel', label: 'Painel', icon: 'bar-chart', path: '/producao' },
      {
        id: 'producao-importar',
        label: 'Importar Produção',
        icon: 'upload-cloud',
        path: '/producao/importar',
      },
    ],
  },
  {
    id: 'minha-producao',
    label: 'Minha Produção',
    icon: 'list',
    basePath: '/minha-producao',
    allowedProfiles: ['colaborador'],
    items: [
      {
        id: 'lancar-producao',
        label: 'Lançar Produção',
        icon: 'plus-circle',
        path: '/minha-producao/lancar',
      },
      {
        id: 'meu-historico',
        label: 'Meu Histórico',
        icon: 'history',
        path: '/minha-producao/historico',
      },
      {
        id: 'minhas-ausencias',
        label: 'Minhas Ausências',
        icon: 'calendar',
        path: '/minha-producao/ausencias',
      },
      {
        id: 'captura-mapa',
        label: 'Captura de Mapas',
        icon: 'camera',
        path: '/minha-producao/captura-mapa',
      },
    ],
  },
  {
    id: 'comunicados',
    label: 'Comunicados',
    icon: 'mail',
    basePath: '/comunicados',
    items: [],
  },
  {
    id: 'operacao',
    label: 'Operação',
    icon: 'clipboard',
    basePath: '/operacao',
    allowedProfiles: ['operador', 'administrador'],
    items: [
      ...operacaoFluxoMenuItems,
      {
        id: 'operacao-devolucoes',
        label: 'Devoluções',
        icon: 'corner-up-right',
        path: '/operacao/devolucoes',
      },
      {
        id: 'operacao-etiquetas',
        label: 'Etiquetas de Localização',
        icon: 'tag',
        path: '/operacao/etiquetas',
      },
    ],
  },
  {
    id: 'conhecimento',
    label: 'Conhecimento',
    icon: 'book',
    basePath: '/operacao/conhecimento',
    allowedProfiles: ['operador', 'administrador'],
    items: [
      {
        id: 'operacao-kb',
        label: 'Base de Conhecimento',
        icon: 'book',
        path: '/operacao/conhecimento',
      },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: 'file-text',
    basePath: '/relatorios',
    allowedProfiles: ['operador', 'administrador'],
    items: [
      {
        id: 'relatorios-gerenciais',
        label: 'Relatórios Gerenciais',
        icon: 'briefcase',
        path: '/relatorios/gerenciais',
      },
      {
        id: 'relatorios-exportacoes',
        label: 'Exportações',
        icon: 'download',
        path: '/relatorios/exportacoes',
      },
      {
        id: 'relatorios-ausencias',
        label: 'Ausências',
        icon: 'calendar',
        path: '/relatorios/ausencias',
        allowedProfiles: ['administrador'],
      },
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
      { id: 'projetos', label: 'Projetos', icon: 'folder', path: '/configuracoes/projetos' },
      { id: 'usuarios', label: 'Usuários', icon: 'user-plus', path: '/configuracoes/usuarios' },
      {
        id: 'vincular-producoes',
        label: 'Vincular Produções',
        icon: 'link',
        path: '/configuracoes/vincular-producoes',
      },
      {
        id: 'config-comunicados',
        label: 'Gestão de Comunicados',
        icon: 'mail',
        path: '/configuracoes/comunicados',
      },
      {
        id: 'ausencias',
        label: 'Ausências',
        icon: 'calendar',
        path: '/configuracoes/ausencias',
      },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    icon: 'settings',
    basePath: '/configuracoes/admin',
    allowedProfiles: ['administrador'],
    items: [
      { id: 'admin', label: 'Administração', icon: 'settings', path: '/configuracoes/admin' },
    ],
  },
  {
    id: 'auditoria',
    label: 'Auditoria',
    icon: 'shield',
    basePath: '/auditoria',
    allowedProfiles: ['operador', 'administrador'],
    items: [
      {
        id: 'importacoes',
        label: 'Importações',
        icon: 'upload-cloud',
        path: '/auditoria/importacoes',
      },
      { id: 'ocr', label: 'OCR', icon: 'scan', path: '/auditoria/ocr' },
      { id: 'correcoes', label: 'Correções', icon: 'edit', path: '/auditoria/correcoes' },
      {
        id: 'acoes',
        label: 'Ações de Usuários',
        icon: 'user-check',
        path: '/auditoria/acoes',
        allowedProfiles: ['administrador'],
      },
    ],
  },
];

const mobilePrimaryNavMap: Record<PerfilUsuario, string[]> = {
  administrador: ['dashboard', 'operacao-recebimento', 'producao-painel', 'relatorios-gerenciais'],
  operador: ['dashboard', 'operacao-recebimento', 'producao-painel', 'relatorios-gerenciais'],
  colaborador: ['dashboard', 'lancar-producao', 'meu-historico', 'captura-mapa'],
};

const mobileSheetNavMap: Record<PerfilUsuario, string[]> = {
  administrador: [
    'comunicados',
    'operacao-devolucoes',
    'operacao-kb',
    'operacao-cq',
    'empresa',
    'auditoria',
  ],
  operador: ['comunicados', 'operacao-devolucoes', 'operacao-kb', 'operacao-cq', 'auditoria'],
  colaborador: ['comunicados'],
};

export interface MenuLinkItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

function flattenMenuItems(items: MenuItem[]): MenuLinkItem[] {
  return items.flatMap((item) => {
    const current = item.path
      ? [
          {
            id: item.id,
            label: item.label,
            icon: item.icon,
            path: item.path,
          },
        ]
      : [];

    return [...current, ...(item.children ? flattenMenuItems(item.children) : [])];
  });
}

const flatMenuItems = menuSections.flatMap((section) => {
  const sectionEntry: MenuLinkItem[] = [
    {
      id: section.id,
      label: section.label,
      icon: section.icon,
      path: section.basePath,
    },
  ];

  return [...sectionEntry, ...flattenMenuItems(section.items)];
});

function getItemById(id: string): MenuLinkItem | null {
  return flatMenuItems.find((item) => item.id === id) ?? null;
}

export function getMobilePrimaryNav(perfil?: PerfilUsuario): MenuLinkItem[] {
  if (!perfil) return [];

  return (mobilePrimaryNavMap[perfil] ?? [])
    .map((id) => getItemById(id))
    .filter((item): item is MenuLinkItem => item !== null);
}

export function getMobileSheetNav(perfil?: PerfilUsuario): MenuLinkItem[] {
  if (!perfil) return [];

  return (mobileSheetNavMap[perfil] ?? [])
    .map((id) => getItemById(id))
    .filter((item): item is MenuLinkItem => item !== null);
}

const pageTitleOverrides: Record<string, string> = {
  '/configuracoes/comunicados': 'Gestão de Comunicados',
  '/configuracoes/admin': 'Administração',
};

export function getPageTitle(pathname: string): string {
  if (pageTitleOverrides[pathname]) {
    return pageTitleOverrides[pathname]!;
  }

  const exactItem = flatMenuItems.find((item) => item.path === pathname);
  if (exactItem) {
    const parentSection = menuSections.find(
      (section) =>
        section.basePath !== exactItem.path &&
        pathname.startsWith(section.basePath) &&
        section.items.length > 0
    );

    return parentSection ? `${parentSection.label} - ${exactItem.label}` : exactItem.label;
  }

  const parentSection = menuSections.find((section) => pathname.startsWith(section.basePath));
  if (parentSection) {
    return parentSection.label;
  }

  return 'Recorda';
}
