/**
 * Domain Entity - Produção
 * Representa um registro de produção de um colaborador
 */

export interface ProducaoProps {
  id: string;
  usuarioId: string;
  repositorioId: string;
  etapa: string;
  quantidade: number;
  dataProducao: Date;
  marcadores?: Record<string, string>;
  criadoEm: Date;
  atualizadoEm: Date;
}

export class Producao {
  private props: ProducaoProps;

  constructor(props: ProducaoProps) {
    this.validate(props);
    this.props = props;
  }

  private validate(props: ProducaoProps): void {
    if (!props.id || props.id.trim() === '') {
      throw new Error('ID da produção é obrigatório');
    }
    if (!props.usuarioId || props.usuarioId.trim() === '') {
      throw new Error('ID do usuário é obrigatório');
    }
    if (!props.repositorioId || props.repositorioId.trim() === '') {
      throw new Error('ID do repositório é obrigatório');
    }
    if (!props.etapa || props.etapa.trim() === '') {
      throw new Error('Etapa é obrigatória');
    }
    if (props.quantidade <= 0) {
      throw new Error('Quantidade deve ser maior que zero');
    }
    if (!props.dataProducao) {
      throw new Error('Data de produção é obrigatória');
    }
  }

  // Getters
  get id(): string {
    return this.props.id;
  }
  get usuarioId(): string {
    return this.props.usuarioId;
  }
  get repositorioId(): string {
    return this.props.repositorioId;
  }
  get etapa(): string {
    return this.props.etapa;
  }
  get quantidade(): number {
    return this.props.quantidade;
  }
  get dataProducao(): Date {
    return this.props.dataProducao;
  }
  get marcadores(): Record<string, string> | undefined {
    return this.props.marcadores;
  }
  get criadoEm(): Date {
    return this.props.criadoEm;
  }
  get atualizadoEm(): Date {
    return this.props.atualizadoEm;
  }

  // Business rules
  foiProduzidoEm(data: Date): boolean {
    const dataProducao = new Date(this.props.dataProducao);
    dataProducao.setHours(0, 0, 0, 0);
    const dataComparacao = new Date(data);
    dataComparacao.setHours(0, 0, 0, 0);
    return dataProducao.getTime() === dataComparacao.getTime();
  }

  foiProduzidoNoPeriodo(dataInicio: Date, dataFim: Date): boolean {
    const dataProducao = new Date(this.props.dataProducao);
    return dataProducao >= dataInicio && dataProducao <= dataFim;
  }

  estaNaEtapa(etapa: string): boolean {
    return this.props.etapa === etapa;
  }

  getMarcador(chave: string): string | undefined {
    return this.props.marcadores?.[chave];
  }

  temMarcador(chave: string): boolean {
    return !!this.props.marcadores?.[chave];
  }

  getOrigem(): string {
    return this.getMarcador('origem') || 'FLUXO';
  }

  isLegado(): boolean {
    return this.getOrigem() === 'LEGADO';
  }

  getColaboradorNome(): string {
    return this.getMarcador('colaborador_nome') || '';
  }

  getFuncao(): string {
    return this.getMarcador('funcao') || this.props.etapa;
  }

  getTipo(): string {
    return this.getMarcador('tipo') || '';
  }

  // Methods
  adicionarMarcador(chave: string, valor: string): void {
    if (!chave || chave.trim() === '') {
      throw new Error('Chave do marcador é obrigatória');
    }
    if (!this.props.marcadores) {
      this.props.marcadores = {};
    }
    this.props.marcadores[chave.trim()] = valor.trim();
    this.props.atualizadoEm = new Date();
  }

  removerMarcador(chave: string): void {
    if (this.props.marcadores) {
      delete this.props.marcadores[chave];
      this.props.atualizadoEm = new Date();
    }
  }

  atualizarQuantidade(novaQuantidade: number): void {
    if (novaQuantidade <= 0) {
      throw new Error('Quantidade deve ser maior que zero');
    }
    this.props.quantidade = novaQuantidade;
    this.props.atualizadoEm = new Date();
  }

  // Factory methods
  static criar(props: Omit<ProducaoProps, 'id' | 'criadoEm' | 'atualizadoEm'>): Producao {
    return new Producao({
      ...props,
      id: crypto.randomUUID(),
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });
  }

  static criarLegado(props: Omit<ProducaoProps, 'id' | 'criadoEm' | 'atualizadoEm'>): Producao {
    const producao = new Producao({
      ...props,
      id: crypto.randomUUID(),
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });

    // Marcar como legado
    producao.adicionarMarcador('origem', 'LEGADO');

    return producao;
  }
}
