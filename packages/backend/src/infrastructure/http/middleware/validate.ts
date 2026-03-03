import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ZodSchema, ZodError } from 'zod';

/**
 * Creates a Fastify preValidation hook that validates request.body against a Zod schema.
 * On success, overwrites request.body with the parsed/coerced Zod result so handlers
 * can safely read request.body without redundant manual checks.
 * On failure, replies with 400 and a structured error message.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      const zodError = result.error as ZodError;
      const messages = zodError.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      await reply.status(400).send({
        error: 'Dados inválidos',
        details: messages,
      });
    } else {
      request.body = result.data;
    }
  };
}

/**
 * Creates a Fastify preValidation hook that validates request.params against a Zod schema.
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.params);
    if (!result.success) {
      const zodError = result.error as ZodError;
      const messages = zodError.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      await reply.status(400).send({
        error: 'Parâmetros inválidos',
        details: messages,
      });
    }
  };
}
