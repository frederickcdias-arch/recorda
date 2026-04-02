/**
 * Domain Entity - Usuário
 * Representa um usuário do sistema com suas regras de negócio
 */

export interface UsuarioProps {
  id: string;
  nome: string;
  email: string;
  perfil: 'operador' | 'administrador';
  coordenadoriaId?: string;
  ativo: boolean;
  ultimoAcesso?: Date;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class Usuario {
  private props: UsuarioProps;

  constructor(props: UsuarioProps) {
    this.validate(props);
    this.props = props;
  }

  private validate(props: UsuarioProps): void {
    if (!props.id || props.id.trim() === '') {
      throw new Error('ID do usuário é obrigatório');
    }
    if (!props.nome || props.nome.trim() === '') {
      throw new Error('Nome do usuário é obrigatório');
    }
    if (!props.email || props.email.trim() === '') {
      throw new Error('Email do usuário é obrigatório');
    }
    if (!this.isValidEmail(props.email)) {
      throw new Error('Email inválido');
    }
    if (!['operador', 'administrador'].includes(props.perfil)) {
      throw new Error('Perfil deve ser "operador" ou "administrador"');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Getters
  get id(): string {
    return this.props.id;
  }
  get nome(): string {
    return this.props.nome;
  }
  get email(): string {
    return this.props.email;
  }
  get perfil(): 'operador' | 'administrador' {
    return this.props.perfil;
  }
  get coordenadoriaId(): string | undefined {
    return this.props.coordenadoriaId;
  }
  get ativo(): boolean {
    return this.props.ativo;
  }
  get ultimoAcesso(): Date | undefined {
    return this.props.ultimoAcesso;
  }
  get criadoEm(): Date {
    return this.props.criadoEm;
  }
  get atualizadoEm(): Date {
    return this.props.atualizadoEm;
  }

  // Business rules
  temPermissao(permissao: string): boolean {
    const permissoesDoPerfil = {
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
    return permissoesDoPerfil[this.props.perfil].includes(permissao);
  }

  podeGerenciarUsuarios(): boolean {
    return this.props.perfil === 'administrador';
  }

  podeGerenciarConfiguracoes(): boolean {
    return this.props.perfil === 'administrador';
  }

  estaAtivo(): boolean {
    return this.props.ativo;
  }

  // Methods
  desativar(): void {
    if (!this.props.ativo) {
      throw new Error('Usuário já está desativado');
    }
    this.props.ativo = false;
    this.props.atualizadoEm = new Date();
  }

  ativar(): void {
    if (this.props.ativo) {
      throw new Error('Usuário já está ativo');
    }
    this.props.ativo = true;
    this.props.atualizadoEm = new Date();
  }

  atualizarUltimoAcesso(): void {
    this.props.ultimoAcesso = new Date();
    this.props.atualizadoEm = new Date();
  }

  atualizarNome(nome: string): void {
    if (!nome || nome.trim() === '') {
      throw new Error('Nome é obrigatório');
    }
    this.props.nome = nome.trim();
    this.props.atualizadoEm = new Date();
  }

  atualizarEmail(email: string): void {
    if (!email || email.trim() === '') {
      throw new Error('Email é obrigatório');
    }
    if (!this.isValidEmail(email)) {
      throw new Error('Email inválido');
    }
    this.props.email = email.trim();
    this.props.atualizadoEm = new Date();
  }

  atualizar(props: Partial<Omit<UsuarioProps, 'id' | 'criadoEm'>>): Usuario {
    const atualizado = new Usuario({
      ...this.props,
      ...props,
      atualizadoEm: new Date(),
    });
    return atualizado;
  }

  // Factory methods
  static criar(props: Omit<UsuarioProps, 'id' | 'criadoEm' | 'atualizadoEm'>): Usuario {
    return new Usuario({
      ...props,
      id: crypto.randomUUID(),
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });
  }
}
