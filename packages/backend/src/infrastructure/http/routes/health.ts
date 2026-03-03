import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const startedAt = new Date();

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: boolean;
  };
}

export const healthRoutes: FastifyPluginAsync = async (server: FastifyInstance): Promise<void> => {
  server.get<{ Reply: HealthResponse }>('/health', {
    schema: {
      tags: ['health'],
      summary: 'Health check do sistema',
      response: {
        200: { type: 'object', properties: { status: { type: 'string' }, timestamp: { type: 'string' }, uptime: { type: 'number' }, version: { type: 'string' }, checks: { type: 'object', properties: { database: { type: 'boolean' } } } } },
        503: { type: 'object', properties: { status: { type: 'string' }, timestamp: { type: 'string' }, uptime: { type: 'number' }, version: { type: 'string' }, checks: { type: 'object', properties: { database: { type: 'boolean' } } } } },
      },
    },
  }, async (_request, reply) => {
    const databaseHealthy = await server.database.healthCheck();

    const response: HealthResponse = {
      status: databaseHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      version: process.env.npm_package_version ?? '0.0.0',
      checks: {
        database: databaseHealthy,
      },
    };

    const statusCode = databaseHealthy ? 200 : 503;
    return reply.status(statusCode).send(response);
  });

  server.get('/metrics', {
    schema: {
      tags: ['health'],
      summary: 'Métricas de runtime do processo Node.js',
      response: {
        200: { type: 'object', properties: { timestamp: { type: 'string' }, uptime: { type: 'number' }, startedAt: { type: 'string' }, memory: { type: 'object', properties: { rss: { type: 'number' }, heapUsed: { type: 'number' }, heapTotal: { type: 'number' }, external: { type: 'number' } }, additionalProperties: true }, node: { type: 'string' }, platform: { type: 'string' }, pid: { type: 'number' } } },
      },
    },
  }, async (_request, reply) => {
    const mem = process.memoryUsage();
    return reply.send({
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      startedAt: startedAt.toISOString(),
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        external: Math.round(mem.external / 1024 / 1024),
      },
      node: process.version,
      platform: process.platform,
      pid: process.pid,
    });
  });
};

