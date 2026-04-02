import dotenv from 'dotenv';
import { createServer } from './infrastructure/http/server.js';
import { createDatabaseConnection } from './infrastructure/database/connection.js';
import { config } from './infrastructure/config/index.js';
import { logger } from './infrastructure/logging/logger.js';

dotenv.config();

if (!process.env.TZ) {
  process.env.TZ = 'America/Sao_Paulo';
}

async function cleanupExpiredTokens(
  database: Awaited<ReturnType<typeof createDatabaseConnection>>
): Promise<void> {
  try {
    // Keep revoked tokens for 30 days for audit trail, then delete
    const result = await database.query(
      `DELETE FROM refresh_tokens WHERE expira_em < NOW() - INTERVAL '30 days'`
    );
    const deleted = (result as { rowCount?: number }).rowCount ?? 0;
    if (deleted > 0) {
      logger.info(`Removed ${deleted} expired refresh tokens (>30 days old)`, {
        component: 'cleanup',
      });
    }
  } catch (err) {
    logger.error('Failed to clean expired tokens', { component: 'cleanup', error: String(err) });
  }
}

async function cleanupOldAuditLogs(
  database: Awaited<ReturnType<typeof createDatabaseConnection>>
): Promise<void> {
  try {
    const result = await database.query(
      `DELETE FROM auditoria WHERE data_operacao < NOW() - INTERVAL '90 days'`
    );
    const deleted = (result as { rowCount?: number }).rowCount ?? 0;
    if (deleted > 0) {
      logger.info(`Removed ${deleted} audit logs older than 90 days`, { component: 'cleanup' });
    }
  } catch (err) {
    logger.error('Failed to clean old audit logs', { component: 'cleanup', error: String(err) });
  }
}

async function bootstrap(): Promise<void> {
  const database = await createDatabaseConnection(config.database, {
    error: (msg, err) => logger.error(msg, { component: 'pg-pool', error: String(err) }),
  });

  const server = await createServer({
    database,
    config: config.server,
  });

  // Periodic cleanup (every 6 hours): expired tokens + old audit logs
  const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
  await cleanupExpiredTokens(database);
  await cleanupOldAuditLogs(database);
  const cleanupTimer = setInterval(() => {
    void cleanupExpiredTokens(database);
    void cleanupOldAuditLogs(database);
  }, CLEANUP_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`, { component: 'shutdown' });
    clearInterval(cleanupTimer);
    try {
      await server.close();
      await database.close();
      logger.info('Server and database connections closed.', { component: 'shutdown' });
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', { component: 'shutdown', error: String(err) });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await server.listen({ port: config.server.port, host: config.server.host });
    logger.info(`Server running at http://${config.server.host}:${config.server.port}`, {
      component: 'bootstrap',
    });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { error: String(err) });
  process.exit(1);
});
