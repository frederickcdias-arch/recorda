/**
 * Constantes compartilhadas entre frontend e backend
 */

// Configurações de upload
export const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB
export const BODY_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB

// Configurações de autenticação
export const JWT_EXPIRATION = '8h';
export const REFRESH_TOKEN_EXPIRATION = '7d';
export const PASSWORD_RESET_EXPIRATION_HOURS = 1;

// Configurações de rate limiting
export const RATE_LIMIT_MAX = 100;
export const RATE_LIMIT_WINDOW = '1 minute';

// Configurações de paginação
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'recorda_access_token',
  REFRESH_TOKEN: 'recorda_refresh_token',
  REMEMBER_ME: 'recorda_remember_me',
} as const;

// Perfis de usuário
export const USER_PROFILES = {
  OPERADOR: 'operador',
  ADMINISTRADOR: 'administrador',
} as const;

export type UserProfile = (typeof USER_PROFILES)[keyof typeof USER_PROFILES];

// Status de processo
export const PROCESS_STATUS = {
  ATIVO: 'ATIVO',
  ARQUIVADO: 'ARQUIVADO',
  SUSPENSO: 'SUSPENSO',
  CANCELADO: 'CANCELADO',
} as const;

export type ProcessStatus = (typeof PROCESS_STATUS)[keyof typeof PROCESS_STATUS];

// Status de importação
export const IMPORT_STATUS = {
  PENDENTE: 'PENDENTE',
  PROCESSANDO: 'PROCESSANDO',
  CONCLUIDA: 'CONCLUIDA',
  ERRO: 'ERRO',
  CANCELADA: 'CANCELADA',
} as const;

export type ImportStatus = (typeof IMPORT_STATUS)[keyof typeof IMPORT_STATUS];

// Tipos de fonte de dados
export const DATA_SOURCE_TYPES = {
  PLANILHA: 'PLANILHA',
  API: 'API',
  CSV: 'CSV',
  OCR: 'OCR',
} as const;

export type DataSourceType = (typeof DATA_SOURCE_TYPES)[keyof typeof DATA_SOURCE_TYPES];

// Unidades de medida
export const MEASUREMENT_UNITS = {
  PROCESSO: 'PROCESSO',
  VOLUME: 'VOLUME',
  PAGINA: 'PAGINA',
  DOCUMENTO: 'DOCUMENTO',
} as const;

export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[keyof typeof MEASUREMENT_UNITS];

// Códigos de erro HTTP
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
} as const;

// Códigos de erro da aplicação
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  RATE_LIMIT: 'RATE_LIMIT_EXCEEDED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
