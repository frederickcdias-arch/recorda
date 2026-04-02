import type { PerfilUsuario } from '@recorda/shared';

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  children?: MenuItem[];
  allowedProfiles?: PerfilUsuario[];
}

export interface MenuSection {
  id: string;
  label: string;
  icon: string;
  basePath: string;
  items: MenuItem[];
  allowedProfiles?: PerfilUsuario[];
}
