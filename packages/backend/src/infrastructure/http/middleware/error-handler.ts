/**
 * Middleware centralizado de tratamento de erros
 *
 * Este módulo fornece:
 * - Função helper para extrair mensagem de erro
 * - Wrapper para handlers de rotas com tratamento automático
 * - Tipos de erro padronizados
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Códigos de erro padronizados
 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  RATE_LIMIT: 'RATE_LIMIT_EXCEEDED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Interface de resposta de erro padronizada
 */
export interface ErrorResponse {
  error: string;
  code?: ErrorCode;
  details?: unknown;
}

interface PgErrorLike {
  code?: string;
  message?: string;
  detail?: string;
}

/**
 * Classe de erro da aplicação
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: ErrorCode = ErrorCodes.INTERNAL_ERROR,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, ErrorCodes.BAD_REQUEST, details);
  }

  static notFound(message: string): AppError {
    return new AppError(message, 404, ErrorCodes.NOT_FOUND);
  }

  static unauthorized(message: string): AppError {
    return new AppError(message, 401, ErrorCodes.UNAUTHORIZED);
  }

  static forbidden(message: string): AppError {
    return new AppError(message, 403, ErrorCodes.FORBIDDEN);
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409, ErrorCodes.CONFLICT);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(message, 400, ErrorCodes.VALIDATION_ERROR, details);
  }
}

/**
 * Extrai mensagem de erro de forma segura
 */
export function getErrorMessage(
  error: unknown,
  fallback: string = 'Erro interno do servidor'
): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}

/**
 * Envia resposta de erro padronizada
 */
export function sendError(
  reply: FastifyReply,
  error: unknown,
  fallbackMessage: string = 'Erro interno do servidor'
): FastifyReply {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
      details: error.details,
    } as ErrorResponse);
  }

  const message = getErrorMessage(error, fallbackMessage);
  return reply.status(500).send({
    error: message,
    code: ErrorCodes.INTERNAL_ERROR,
  } as ErrorResponse);
}

/**
 * Mapeia erros comuns do PostgreSQL para respostas HTTP apropriadas.
 */
export function sendDatabaseError(
  reply: FastifyReply,
  error: unknown,
  fallbackMessage: string = 'Erro ao processar operacao no banco'
): FastifyReply {
  const pgError = error as PgErrorLike;
  const message = getErrorMessage(error, fallbackMessage);

  if (pgError.code === '23505') {
    return reply.status(409).send({
      error: message,
      code: ErrorCodes.CONFLICT,
    } as ErrorResponse);
  }

  if (pgError.code === '23503') {
    return reply.status(409).send({
      error: pgError.detail ?? message,
      code: ErrorCodes.CONFLICT,
    } as ErrorResponse);
  }

  if (
    pgError.code === '23502' ||
    pgError.code === '23514' ||
    pgError.code === '22P02' ||
    pgError.code === '22001' ||
    pgError.code === '22007'
  ) {
    return reply.status(400).send({
      error: message,
      code: ErrorCodes.BAD_REQUEST,
    } as ErrorResponse);
  }

  return reply.status(500).send({
    error: message,
    code: ErrorCodes.INTERNAL_ERROR,
  } as ErrorResponse);
}

/**
 * Tipo para handler de rota
 */
type RouteHandler<T = unknown> = (request: FastifyRequest, reply: FastifyReply) => Promise<T>;

/**
 * Wrapper que adiciona tratamento de erro automático a um handler
 */
export function withErrorHandler<T>(
  handler: RouteHandler<T>,
  fallbackMessage: string = 'Erro ao processar requisição'
): RouteHandler<T | ErrorResponse> {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await handler(request, reply);
    } catch (error) {
      request.log.error(error, fallbackMessage);
      return sendError(reply, error, fallbackMessage);
    }
  };
}

/**
 * Helper para criar resposta de sucesso com dados
 */
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  statusCode: number = 200
): FastifyReply {
  return reply.status(statusCode).send(data);
}

/**
 * Helper para criar resposta de sucesso com mensagem
 */
export function sendMessage(
  reply: FastifyReply,
  message: string,
  statusCode: number = 200
): FastifyReply {
  return reply.status(statusCode).send({ message });
}
