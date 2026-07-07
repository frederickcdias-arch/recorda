/**
 * Tipos relacionados a usuários
 */

export type PerfilUsuario = 'colaborador' | 'operador' | 'administrador' | 'visualizador';

export type PermissaoTipo =
  | 'visualizar_dashboard'
  | 'gerar_relatorios'
  | 'importar_producao'
  | 'capturar_documentos'
  | 'gerenciar_configuracoes'
  | 'gerenciar_usuarios';

export const PERMISSOES_POR_PERFIL: Record<PerfilUsuario, PermissaoTipo[]> = {
  visualizador: ['visualizar_dashboard'],
  colaborador: ['visualizar_dashboard'],
  operador: [
    'visualizar_dashboard',
    'gerar_relatorios',
    'importar_producao',
    'capturar_documentos',
  ],
  administrador: [
    'visualizar_dashboard',
    'gerar_relatorios',
    'importar_producao',
    'capturar_documentos',
    'gerenciar_configuracoes',
    'gerenciar_usuarios',
  ],
};

export interface CoordenadoriaResumida {
  id: string;
  nome: string;
  sigla: string;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfis?: PerfilUsuario[];
  perfilAtivo?: PerfilUsuario;
  perfil: PerfilUsuario;
  ativo?: boolean;
  coordenadoriaId?: string;
  coordenadoria?: CoordenadoriaResumida | null;
  criadoEm?: string;
  atualizadoEm?: string;
}

export interface UsuarioSemSenha extends Omit<Usuario, 'senha'> {}

export interface CriarUsuarioDTO {
  nome: string;
  email: string;
  senha: string;
  perfis: PerfilUsuario[];
  perfil?: PerfilUsuario;
}

export interface AtualizarUsuarioDTO {
  nome?: string;
  email?: string;
  perfis?: PerfilUsuario[];
  perfil?: PerfilUsuario;
  ativo?: boolean;
}
