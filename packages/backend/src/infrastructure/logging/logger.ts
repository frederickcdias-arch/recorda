/**
 * Standalone structured logger for use outside of Fastify request context.
 * In production, outputs JSON lines compatible with Pino format.
 * In development, outputs human-readable prefixed messages.
 */

const isProduction = process.env.NODE_ENV === 'production';

function formatJson(level: string, msg: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({
    level,
    time: Date.now(),
    msg,
    ...extra,
  });
}

export const logger = {
  info(msg: string, extra?: Record<string, unknown>): void {
    if (isProduction) {
      process.stdout.write(formatJson('info', msg, extra) + '\n');
    } else {
      console.log(`[info] ${msg}`, extra ?? '');
    }
  },

  warn(msg: string, extra?: Record<string, unknown>): void {
    if (isProduction) {
      process.stdout.write(formatJson('warn', msg, extra) + '\n');
    } else {
      console.warn(`[warn] ${msg}`, extra ?? '');
    }
  },

  error(msg: string, extra?: Record<string, unknown>): void {
    if (isProduction) {
      process.stderr.write(formatJson('error', msg, extra) + '\n');
    } else {
      console.error(`[error] ${msg}`, extra ?? '');
    }
  },

  debug(msg: string, extra?: Record<string, unknown>): void {
    if (isProduction) return;
    console.debug(`[debug] ${msg}`, extra ?? '');
  },
};
