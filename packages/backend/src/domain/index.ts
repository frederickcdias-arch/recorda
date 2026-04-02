/**
 * Domain Layer Index
 * Exporta todas as entidades e value objects do domínio
 */

// Entities
export { Usuario } from './entities/Usuario.js';
export type { UsuarioProps } from './entities/Usuario.js';

export { Repositorio } from './entities/Repositorio.js';
export type { RepositorioProps } from './entities/Repositorio.js';

export { Producao } from './entities/Producao.js';
export type { ProducaoProps } from './entities/Producao.js';

// Value Objects
export { ValueObject, Email, Nome, Quantidade, Etapa, Perfil } from './value-objects/index.js';

// Domain Events (se necessário no futuro)
export interface DomainEvent {
  id: string;
  occurredOn: Date;
  aggregateId: string;
  eventType: string;
  version: number;
  data: Record<string, unknown>;
}

// Repository Interfaces
export interface IRepository<T> {
  findById(id: string): Promise<T | null>;
  findMany(filter?: Partial<T>): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

// Service Interfaces
export interface IUsuarioService {
  criar(props: Omit<UsuarioProps, 'id' | 'criadoEm' | 'atualizadoEm'>): Promise<Usuario>;
  atualizar(id: string, props: Partial<UsuarioProps>): Promise<Usuario>;
  buscarPorEmail(email: string): Promise<Usuario | null>;
  listarAtivos(): Promise<Usuario[]>;
  desativar(id: string): Promise<void>;
}

export interface IProducaoService {
  registrarProducao(
    props: Omit<ProducaoProps, 'id' | 'criadoEm' | 'atualizadoEm'>
  ): Promise<Producao>;
  buscarPorUsuario(usuarioId: string, periodo?: { inicio: Date; fim: Date }): Promise<Producao[]>;
  buscarPorRepositorio(repositorioId: string): Promise<Producao[]>;
  calcularTotalPorPeriodo(inicio: Date, fim: Date): Promise<number>;
}

export interface IRepositorioService {
  criar(props: Omit<RepositorioProps, 'id' | 'criadoEm' | 'atualizadoEm'>): Promise<Repositorio>;
  atualizar(id: string, props: Partial<RepositorioProps>): Promise<Repositorio>;
  buscarPorEtapa(etapa: string): Promise<Repositorio[]>;
  buscarPorProjeto(projeto: string): Promise<Repositorio[]>;
  avancarEtapa(id: string, novaEtapa: string): Promise<Repositorio>;
}

// Common Domain Errors
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class EntityNotFoundError extends DomainError {
  constructor(id: string, entity: string) {
    super(`${entity} com ID "${id}" não encontrado`, 'ENTITY_NOT_FOUND');
  }
}

export class BusinessRuleViolationError extends DomainError {
  constructor(message: string) {
    super(message, 'BUSINESS_RULE_VIOLATION');
  }
}

export class InvalidValueError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_VALUE');
  }
}
