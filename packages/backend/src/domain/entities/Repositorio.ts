/**
 * Domain Entity - Repositório
 * Representa um repositório/processo no sistema
 */

export interface RepositorioProps {
  id: string;
  idRepositorioGed: string;
  idRepositorioRecorda: string;
  processoPrincipal?: string;
  projeto: string;
  orgao: string;
  armario?: string;
  etapa: string;
  funcao: string;
  tipo?: string;
  coordenadoria?: string;
  dataEntrega?: Date;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class Repositorio {
  private props: RepositorioProps;

  constructor(props: RepositorioProps) {
    this.validate(props);
    this.props = props;
  }

  private validate(props: RepositorioProps): void {
    if (!props.id || props.id.trim() === '') {
      throw new Error('ID do repositório é obrigatório');
    }
    if (!props.idRepositorioGed || props.idRepositorioGed.trim() === '') {
      throw new Error('ID do repositório GED é obrigatório');
    }
    if (!props.idRepositorioRecorda || props.idRepositorioRecorda.trim() === '') {
      throw new Error('ID do repositório Recorda é obrigatório');
    }
    if (!props.projeto || props.projeto.trim() === '') {
      throw new Error('Projeto é obrigatório');
    }
    if (!props.orgao || props.orgao.trim() === '') {
      throw new Error('Órgão é obrigatório');
    }
    if (!props.etapa || props.etapa.trim() === '') {
      throw new Error('Etapa é obrigatória');
    }
    if (!props.funcao || props.funcao.trim() === '') {
      throw new Error('Função é obrigatória');
    }
  }

  // Getters
  get id(): string {
    return this.props.id;
  }
  get idRepositorioGed(): string {
    return this.props.idRepositorioGed;
  }
  get idRepositorioRecorda(): string {
    return this.props.idRepositorioRecorda;
  }
  get processoPrincipal(): string | undefined {
    return this.props.processoPrincipal;
  }
  get projeto(): string {
    return this.props.projeto;
  }
  get orgao(): string {
    return this.props.orgao;
  }
  get armario(): string | undefined {
    return this.props.armario;
  }
  get etapa(): string {
    return this.props.etapa;
  }
  get funcao(): string {
    return this.props.funcao;
  }
  get tipo(): string | undefined {
    return this.props.tipo;
  }
  get coordenadoria(): string | undefined {
    return this.props.coordenadoria;
  }
  get dataEntrega(): Date | undefined {
    return this.props.dataEntrega;
  }
  get ativo(): boolean {
    return this.props.ativo;
  }
  get criadoEm(): Date {
    return this.props.criadoEm;
  }
  get atualizadoEm(): Date {
    return this.props.atualizadoEm;
  }

  // Business rules
  estaNaEtapa(etapa: string): boolean {
    return this.props.etapa === etapa;
  }

  pertenceAoProjeto(projeto: string): boolean {
    return this.props.projeto === projeto;
  }

  pertenceAoOrgao(orgao: string): boolean {
    return this.props.orgao === orgao;
  }

  temProcessoPrincipal(): boolean {
    return !!this.props.processoPrincipal;
  }

  foiEntregue(): boolean {
    return !!this.props.dataEntrega && this.props.dataEntrega <= new Date();
  }

  estaAtivo(): boolean {
    return this.props.ativo;
  }

  // Methods
  avancarParaEtapa(novaEtapa: string): void {
    if (!novaEtapa || novaEtapa.trim() === '') {
      throw new Error('Nova etapa é obrigatória');
    }
    if (this.props.etapa === novaEtapa) {
      throw new Error('Repositório já está nesta etapa');
    }
    this.props.etapa = novaEtapa.trim();
    this.props.atualizadoEm = new Date();
  }

  atualizarCoordenadoria(coordenadoria: string): void {
    if (!coordenadoria || coordenadoria.trim() === '') {
      throw new Error('Coordenadoria é obrigatória');
    }
    this.props.coordenadoria = coordenadoria.trim();
    this.props.atualizadoEm = new Date();
  }

  definirDataEntrega(data: Date): void {
    if (data <= new Date()) {
      throw new Error('Data de entrega deve ser futura');
    }
    this.props.dataEntrega = data;
    this.props.atualizadoEm = new Date();
  }

  marcarComoEntregue(): void {
    this.props.dataEntrega = new Date();
    this.props.atualizadoEm = new Date();
  }

  desativar(): void {
    if (!this.props.ativo) {
      throw new Error('Repositório já está desativado');
    }
    this.props.ativo = false;
    this.props.atualizadoEm = new Date();
  }

  reativar(): void {
    if (this.props.ativo) {
      throw new Error('Repositório já está ativo');
    }
    this.props.ativo = true;
    this.props.atualizadoEm = new Date();
  }

  // Factory methods
  static criar(props: Omit<RepositorioProps, 'id' | 'criadoEm' | 'atualizadoEm'>): Repositorio {
    return new Repositorio({
      ...props,
      id: crypto.randomUUID(),
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });
  }
}
