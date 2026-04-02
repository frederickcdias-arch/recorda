/**
 * Domain Value Objects - Tipos imutáveis do domínio
 */

export abstract class ValueObject {
  public equals(other: ValueObject): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (this.constructor.name !== other.constructor.name) {
      return false;
    }
    return this.equalsCore(other);
  }

  protected abstract equalsCore(other: ValueObject): boolean;
}

export class Email extends ValueObject {
  private constructor(private readonly _email: string) {
    super();
    this.validate();
  }

  private validate(): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this._email)) {
      throw new Error('Email inválido');
    }
  }

  protected equalsCore(other: ValueObject): boolean {
    return other instanceof Email && this._email === other._email;
  }

  get value(): string {
    return this._email;
  }

  toString(): string {
    return this._email;
  }

  static criar(email: string): Email {
    return new Email(email.trim().toLowerCase());
  }
}

export class Nome extends ValueObject {
  private constructor(private readonly _nome: string) {
    super();
    this.validate();
  }

  private validate(): void {
    if (!this._nome || this._nome.trim().length === 0) {
      throw new Error('Nome não pode estar vazio');
    }
    if (this._nome.trim().length < 2) {
      throw new Error('Nome deve ter pelo menos 2 caracteres');
    }
    if (this._nome.trim().length > 100) {
      throw new Error('Nome não pode ter mais de 100 caracteres');
    }
  }

  protected equalsCore(other: ValueObject): boolean {
    return other instanceof Nome && this._nome === other._nome;
  }

  get value(): string {
    return this._nome;
  }

  toString(): string {
    return this._nome;
  }

  static criar(nome: string): Nome {
    return new Nome(nome.trim());
  }
}

export class Quantidade extends ValueObject {
  private constructor(private readonly _quantidade: number) {
    super();
    this.validate();
  }

  private validate(): void {
    if (this._quantidade <= 0) {
      throw new Error('Quantidade deve ser maior que zero');
    }
    if (this._quantidade > 999999) {
      throw new Error('Quantidade não pode ser maior que 999.999');
    }
    if (!Number.isInteger(this._quantidade)) {
      throw new Error('Quantidade deve ser um número inteiro');
    }
  }

  protected equalsCore(other: ValueObject): boolean {
    return other instanceof Quantidade && this._quantidade === other._quantidade;
  }

  get value(): number {
    return this._quantidade;
  }

  toString(): string {
    return this._quantidade.toString();
  }

  somar(outra: Quantidade): Quantidade {
    return new Quantidade(this._quantidade + outra.value);
  }

  subtrair(outra: Quantidade): Quantidade {
    const resultado = this._quantidade - outra.value;
    if (resultado <= 0) {
      throw new Error('Resultado não pode ser menor ou igual a zero');
    }
    return new Quantidade(resultado);
  }

  static criar(valor: number): Quantidade {
    return new Quantidade(Math.floor(valor));
  }
}

export class Etapa extends ValueObject {
  private static readonly ETAPAS_VALIDAS = [
    'RECEBIMENTO',
    'DIGITALIZACAO',
    'INDEXACAO',
    'QUALIDADE',
    'CONTROLE_QUALIDADE',
    'ENTREGA',
    'CONCLUIDO',
  ] as const;

  private constructor(private readonly _etapa: string) {
    super();
    this.validate();
  }

  private validate(): void {
    if (!this._etapa || this._etapa.trim().length === 0) {
      throw new Error('Etapa não pode estar vazia');
    }
    if (!Etapa.ETAPAS_VALIDAS.includes(this._etapa.toUpperCase() as any)) {
      throw new Error('Etapa inválida');
    }
  }

  protected equalsCore(other: ValueObject): boolean {
    return other instanceof Etapa && this._etapa === other._etapa;
  }

  get value(): string {
    return this._etapa;
  }

  toString(): string {
    return this._etapa;
  }

  isRecebimento(): boolean {
    return this._etapa === 'RECEBIMENTO';
  }

  isDigitalizacao(): boolean {
    return this._etapa === 'DIGITALIZACAO';
  }

  isIndexacao(): boolean {
    return this._etapa === 'INDEXACAO';
  }

  isQualidade(): boolean {
    return this._etapa === 'QUALIDADE' || this._etapa === 'CONTROLE_QUALIDADE';
  }

  isEntrega(): boolean {
    return this._etapa === 'ENTREGA';
  }

  isConcluida(): boolean {
    return this._etapa === 'CONCLUIDO';
  }

  podeAvancarPara(proximaEtapa: Etapa): boolean {
    const fluxoPermitido: Record<string, string[]> = {
      RECEBIMENTO: ['DIGITALIZACAO'],
      DIGITALIZACAO: ['INDEXACAO'],
      INDEXACAO: ['QUALIDADE', 'CONTROLE_QUALIDADE'],
      QUALIDADE: ['ENTREGA'],
      CONTROLE_QUALIDADE: ['ENTREGA'],
      ENTREGA: ['CONCLUIDO'],
      CONCLUIDO: [],
    };

    return fluxoPermitido[this._etapa]?.includes(proximaEtapa.value) || false;
  }

  static criar(etapa: string): Etapa {
    return new Etapa(etapa.trim().toUpperCase());
  }
}

export class Perfil extends ValueObject {
  private static readonly PERFIS_VALIDOS = ['operador', 'administrador'] as const;

  private constructor(private readonly _perfil: 'operador' | 'administrador') {
    super();
  }

  protected equalsCore(other: ValueObject): boolean {
    return other instanceof Perfil && this._perfil === other._perfil;
  }

  get value(): 'operador' | 'administrador' {
    return this._perfil;
  }

  toString(): string {
    return this._perfil;
  }

  isOperador(): boolean {
    return this._perfil === 'operador';
  }

  isAdministrador(): boolean {
    return this._perfil === 'administrador';
  }

  temPermissao(permissao: string): boolean {
    const permissoes = {
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
    return permissoes[this._perfil].includes(permissao);
  }

  static criar(perfil: string): Perfil {
    const normalizado = perfil.trim().toLowerCase();
    if (!Perfil.PERFIS_VALIDOS.includes(normalizado as any)) {
      throw new Error('Perfil deve ser "operador" ou "administrador"');
    }
    return new Perfil(normalizado as 'operador' | 'administrador');
  }
}
