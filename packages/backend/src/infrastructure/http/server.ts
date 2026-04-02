import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { DatabaseConnection } from '../database/connection.js';
import type { ServerConfig } from '../config/index.js';
import type { OCRService } from '../../application/ports/ocr-service.js';
import type { EmailService } from '../../application/ports/email-service.js';
import { createEmailService } from '../services/email-service-smtp.js';
import { createOCRService } from './routes/operacional-helpers.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { createRelatorioRoutes } from './routes/relatorios.js';
import { createDashboardRoutes } from './routes/dashboard.js';
import { createConfiguracaoRoutes } from './routes/configuracao.js';
import { createColaboradoresRoutes } from './routes/colaboradores.js';
import { createEtapasRoutes } from './routes/etapas.js';
import { createAuditoriaRoutes } from './routes/auditoria.js';
import { createMetasRoutes } from './routes/metas.js';
import { createOperacionalRoutes } from './routes/operacional.js';
import { createConhecimentoOperacionalRoutes } from './routes/conhecimento-operacional.js';
import { createAdminRoutes } from './routes/admin.js';

export interface ServerDependencies {
  database: DatabaseConnection;
  config: ServerConfig;
  ocrService?: OCRService;
}

export async function createServer(dependencies: ServerDependencies): Promise<FastifyInstance> {
  const server = Fastify({
    logger: true,
    bodyLimit: 10 * 1024 * 1024, // 10MB default; import routes override per-route
  });
  const isProduction = process.env.NODE_ENV === 'production';

  // Block only exact legacy base paths and their children, without capturing
  // unrelated prefixes such as "/conhecimento-v2" or "/recebimento-novo".
  const legacyEndpointPattern = /^\/(recebimento|conhecimento)(\/|$)/;

  server.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    const isLegacyEndpoint = legacyEndpointPattern.test(pathname);

    if (!isLegacyEndpoint) {
      return;
    }

    return reply.status(410).send({
      error: 'Endpoint legado desativado. Utilize o fluxo operacional /operacional/*.',
      code: 'LEGACY_ENDPOINT_GONE',
    });
  });

  // Segurança: CORS
  const corsOrigin = (() => {
    if (!isProduction) return true;
    const configuredOrigin = process.env.CORS_ORIGIN?.trim();
    if (!configuredOrigin) {
      throw new Error('CORS_ORIGIN environment variable is required in production.');
    }
    return configuredOrigin;
  })();
  await server.register(cors, {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
  });

  // Multipart (upload de arquivos)
  await server.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  });

  // Segurança: Headers HTTP
  await server.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    crossOriginResourcePolicy: false,
  });

  if (isProduction) {
    await server.register(rateLimit, {
      global: true,
      max: 100,
      timeWindow: '1 minute',
      errorResponseBuilder: () => ({
        error: 'Muitas requisições. Tente novamente em alguns instantes.',
        code: 'RATE_LIMIT_EXCEEDED',
      }),
    });
  } else {
    server.log.warn('Rate limiting desabilitado em ambiente não produtivo.');
  }

  // Granular rate limiting for auth and heavy endpoints (always active)
  const heavyEndpointLimits: Record<string, { max: number; timeWindow: string }> = {
    'POST /auth/login': { max: 5, timeWindow: '1 minute' },
    'POST /auth/forgot-password': { max: 3, timeWindow: '1 minute' },
    'POST /auth/reset-password': { max: 5, timeWindow: '1 minute' },
  };
  const heavyPatterns: Array<{
    pattern: RegExp;
    method: string;
    limit: { max: number; timeWindow: string };
  }> = [
    {
      pattern: /^\/operacional\/fontes-importacao\/[^/]+\/importar$/,
      method: 'POST',
      limit: { max: 2, timeWindow: '1 minute' },
    },
    {
      pattern: /^\/operacional\/importacoes-legado\//,
      method: 'POST',
      limit: { max: 3, timeWindow: '1 minute' },
    },
    { pattern: /\/ocr-preview$/, method: 'POST', limit: { max: 10, timeWindow: '1 minute' } },
    {
      pattern: /^\/operacional\/relatorios/,
      method: 'POST',
      limit: { max: 5, timeWindow: '1 minute' },
    },
    {
      pattern: /^\/operacional\/relatorio-recebimento/,
      method: 'POST',
      limit: { max: 5, timeWindow: '1 minute' },
    },
  ];
  server.addHook('onRoute', (routeOptions) => {
    const key = `${String(routeOptions.method)} ${routeOptions.url}`;
    const staticLimit = heavyEndpointLimits[key];
    if (staticLimit) {
      routeOptions.config = { ...routeOptions.config, rateLimit: staticLimit };
    }
    for (const hp of heavyPatterns) {
      if (String(routeOptions.method) === hp.method && hp.pattern.test(routeOptions.url)) {
        routeOptions.config = { ...routeOptions.config, rateLimit: hp.limit };
        break;
      }
    }
  });

  // OpenAPI / Swagger — desabilitado em produção
  if (!isProduction) {
    await server.register(swagger, {
      openapi: {
        info: {
          title: 'Recorda API',
          description: 'Sistema de Gestão Documental e Produção',
          version: '1.0.0',
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
        tags: [
          { name: 'auth', description: 'Autenticação e usuários' },
          { name: 'dashboard', description: 'Dashboard e estatísticas' },
          { name: 'relatorios', description: 'Relatórios gerenciais' },
          { name: 'configuracao', description: 'Configurações do sistema' },
          { name: 'colaboradores', description: 'Gestão de colaboradores' },
          { name: 'etapas', description: 'Gestão de etapas' },
          { name: 'operacional', description: 'Fluxo operacional' },
          { name: 'auditoria', description: 'Logs de auditoria' },
          { name: 'metas', description: 'Metas de produção' },
          { name: 'conhecimento', description: 'Base de conhecimento' },
          { name: 'health', description: 'Health checks e métricas' },
        ],
      },
    });
    await server.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  }

  server.decorate('database', dependencies.database);
  server.decorate('emailService', createEmailService());
  server.decorate('ocrService', dependencies.ocrService ?? createOCRService());

  await server.register(healthRoutes);
  await server.register(authRoutes);
  await server.register(createRelatorioRoutes());
  await server.register(createDashboardRoutes());
  await server.register(createConfiguracaoRoutes());
  await server.register(createColaboradoresRoutes());
  await server.register(createEtapasRoutes());
  await server.register(createAuditoriaRoutes());
  await server.register(createMetasRoutes());
  await server.register(createOperacionalRoutes());
  await server.register(createConhecimentoOperacionalRoutes());
  await server.register(createAdminRoutes());

  return server;
}

declare module 'fastify' {
  interface FastifyInstance {
    database: DatabaseConnection;
    emailService: EmailService;
    ocrService: OCRService;
  }
}
