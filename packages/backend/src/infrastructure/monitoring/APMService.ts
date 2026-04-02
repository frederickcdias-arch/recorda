/**
 * APM Service - Application Performance Monitoring
 * Implementa métricas e monitoramento avançado
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '../logging/logger.js';
import { getCacheService } from '../cache/index.js';

export interface MetricData {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface PerformanceMetrics {
  responseTime: number;
  statusCode: number;
  method: string;
  route: string;
  userAgent?: string;
  userId?: string;
  timestamp: number;
}

export interface ErrorMetrics {
  error: string;
  stack?: string;
  statusCode: number;
  route: string;
  method: string;
  userId?: string;
  timestamp: number;
}

export interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  uptime: number;
  activeConnections: number;
  cache: {
    connected: boolean;
    keys: number;
    memory: string;
  };
  timestamp: number;
}

export class APMService {
  private metrics: Map<string, MetricData[]> = new Map();
  private performanceMetrics: PerformanceMetrics[] = [];
  private errorMetrics: ErrorMetrics[] = [];
  private maxMetricsPerKey = 1000;
  private maxPerformanceMetrics = 10000;
  private maxErrorMetrics = 1000;

  constructor(private server: FastifyInstance) {
    this.setupMetricsCollection();
    this.setupHealthCheck();
  }

  /**
   * Configurar coleta de métricas
   */
  private setupMetricsCollection(): void {
    // Middleware para coletar métricas de performance
    this.server.addHook('onRequest', async (request, _reply) => {
      (request as any).startTime = Date.now();
    });

    this.server.addHook('onResponse', async (request, reply) => {
      const responseTime = Date.now() - ((request as any).startTime as number);

      const metric: PerformanceMetrics = {
        responseTime,
        statusCode: reply.statusCode,
        method: request.method,
        route: (request.routeOptions?.config as any)?.url || request.url,
        userAgent: request.headers['user-agent'],
        userId: (request.user as any)?.id,
        timestamp: Date.now(),
      };

      this.addPerformanceMetric(metric);
      this.logSlowRequests(metric);
    });

    // Middleware para capturar erros
    this.server.addHook('onError', async (request, reply, error) => {
      const errorMetric: ErrorMetrics = {
        error: error.message,
        stack: error.stack,
        statusCode: reply.statusCode,
        route: (request.routeOptions?.config as any)?.url || request.url,
        method: request.method,
        userId: (request.user as any)?.id,
        timestamp: Date.now(),
      };

      this.addErrorMetric(errorMetric);
      this.logErrors(errorMetric);
    });
  }

  /**
   * Configurar health check avançado
   */
  private setupHealthCheck(): void {
    this.server.get('/health/detailed', async (request, reply) => {
      try {
        const systemMetrics = await this.getSystemMetrics();
        const health = {
          status: 'healthy',
          timestamp: Date.now(),
          uptime: systemMetrics.uptime,
          checks: {
            database: await this.checkDatabaseHealth(),
            cache: await this.checkCacheHealth(),
            memory: systemMetrics.memory.percentage < 80 ? 'healthy' : 'warning',
            cpu: systemMetrics.cpu.usage < 80 ? 'healthy' : 'warning',
          },
          metrics: systemMetrics,
        };

        const statusCode =
          health.checks.database === 'healthy' &&
          health.checks.cache === 'healthy' &&
          health.checks.memory === 'healthy'
            ? 200
            : 503;

        reply.status(statusCode).send(health);
      } catch (error) {
        reply.status(503).send({
          status: 'unhealthy',
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * Adicionar métrica personalizada
   */
  addMetric(name: string, value: number, unit: string, tags?: Record<string, string>): void {
    const metric: MetricData = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags,
    };

    const existing = this.metrics.get(name) || [];
    existing.push(metric);

    // Manter apenas as métricas mais recentes
    if (existing.length > this.maxMetricsPerKey) {
      existing.splice(0, existing.length - this.maxMetricsPerKey);
    }

    this.metrics.set(name, existing);
  }

  /**
   * Adicionar métrica de performance
   */
  private addPerformanceMetric(metric: PerformanceMetrics): void {
    this.performanceMetrics.push(metric);

    // Manter apenas as métricas mais recentes
    if (this.performanceMetrics.length > this.maxPerformanceMetrics) {
      this.performanceMetrics.splice(
        0,
        this.performanceMetrics.length - this.maxPerformanceMetrics
      );
    }
  }

  /**
   * Adicionar métrica de erro
   */
  private addErrorMetric(metric: ErrorMetrics): void {
    this.errorMetrics.push(metric);

    // Manter apenas as métricas mais recentes
    if (this.errorMetrics.length > this.maxErrorMetrics) {
      this.errorMetrics.splice(0, this.errorMetrics.length - this.maxErrorMetrics);
    }
  }

  /**
   * Obter métricas do sistema
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const cache = getCacheService();
    const cacheStats = await cache.getStats();

    return {
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      cpu: {
        usage: process.cpuUsage().user,
      },
      uptime: process.uptime(),
      activeConnections: (this.server as any).server?.connections?.length || 0,
      cache: {
        connected: cacheStats.connected,
        keys: cacheStats.keys,
        memory: cacheStats.memory,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Verificar saúde do banco de dados
   */
  private async checkDatabaseHealth(): Promise<string> {
    try {
      await this.server.database.query('SELECT 1');
      return 'healthy';
    } catch (error) {
      logger.error('Database health check failed', { error: (error as Error).message });
      return 'unhealthy';
    }
  }

  /**
   * Verificar saúde do cache
   */
  private async checkCacheHealth(): Promise<string> {
    try {
      const cache = getCacheService();
      const stats = await cache.getStats();
      return stats.connected ? 'healthy' : 'unhealthy';
    } catch (error) {
      logger.error('Cache health check failed', { error: (error as Error).message });
      return 'unhealthy';
    }
  }

  /**
   * Obter métricas de performance
   */
  getPerformanceMetrics(lastMinutes: number = 5): PerformanceMetrics[] {
    const last5Minutes = lastMinutes * 60 * 1000;
    const cutoff = Date.now() - last5Minutes;
    return this.performanceMetrics.filter((metric) => metric.timestamp > cutoff);
  }

  /**
   * Obter métricas de erro
   */
  getErrorMetrics(lastMinutes: number = 5): ErrorMetrics[] {
    const last5Minutes = lastMinutes * 60 * 1000;
    const cutoff = Date.now() - last5Minutes;
    return this.errorMetrics.filter((metric) => metric.timestamp > cutoff);
  }

  /**
   * Obter métricas personalizadas
   */
  getMetrics(name: string, lastMinutes: number = 5): MetricData[] {
    const last5Minutes = lastMinutes * 60 * 1000;
    const cutoff = Date.now() - last5Minutes;
    const metrics = this.metrics.get(name) || [];
    return metrics.filter((metric) => metric.timestamp > cutoff);
  }

  /**
   * Obter resumo de métricas
   */
  getMetricsSummary() {
    const last5Minutes = 5 * 60 * 1000;
    const cutoff = Date.now() - last5Minutes;

    const performance = this.getPerformanceMetrics();
    const errors = this.getErrorMetrics();

    return {
      performance: {
        total: performance.length,
        avgResponseTime:
          performance.length > 0
            ? performance.reduce((sum, m) => sum + m.responseTime, 0) / performance.length
            : 0,
        errorRate: performance.length > 0 ? (errors.length / performance.length) * 100 : 0,
        slowRequests: performance.filter((m) => m.responseTime > 1000).length,
      },
      errors: {
        total: errors.length,
        byStatus: errors.reduce(
          (acc, e) => {
            acc[e.statusCode] = (acc[e.statusCode] || 0) + 1;
            return acc;
          },
          {} as Record<number, number>
        ),
        byRoute: errors.reduce(
          (acc, e) => {
            acc[e.route] = (acc[e.route] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
      },
      system: {
        customMetrics: Object.fromEntries(
          Array.from(this.metrics.entries()).map(([name, metrics]) => [
            name,
            metrics.filter((m) => m.timestamp > cutoff).length,
          ])
        ),
      },
    };
  }

  /**
   * Log de requisições lentas
   */
  private logSlowRequests(metric: PerformanceMetrics): void {
    if (metric.responseTime > 1000) {
      logger.warn('Slow request detected', {
        method: metric.method,
        route: metric.route,
        responseTime: metric.responseTime,
        statusCode: metric.statusCode,
        userAgent: metric.userAgent,
        userId: metric.userId,
      });
    }
  }

  /**
   * Log de erros
   */
  private logErrors(metric: ErrorMetrics): void {
    logger.error('Request error', {
      error: metric.error,
      route: metric.route,
      method: metric.method,
      statusCode: metric.statusCode,
      userId: metric.userId,
      stack: metric.stack,
    });
  }

  /**
   * Endpoint de métricas para Prometheus
   */
  setupPrometheusMetrics(): void {
    this.server.get('/metrics/prometheus', async (request, reply) => {
      try {
        const summary = this.getMetricsSummary();
        const systemMetrics = await this.getSystemMetrics();

        const prometheusFormat = [
          '# HELP recorda_metrics',
          '# TYPE recorda_metrics_total counter',
          `recorda_metrics_total ${summary.performance.total}`,
          '# TYPE recorda_metrics_response_time histogram',
          `recorda_metrics_response_time_sum ${summary.performance.avgResponseTime * summary.performance.total}`,
          `recorda_metrics_response_time_count ${summary.performance.total}`,
          '# TYPE recorda_metrics_error_rate gauge',
          `recorda_metrics_error_rate ${summary.performance.errorRate}`,
          '# TYPE recorda_metrics_slow_requests counter',
          `recorda_metrics_slow_requests ${summary.performance.slowRequests}`,
          '# TYPE recorda_errors_total counter',
          `recorda_errors_total ${summary.errors.total}`,
          '# TYPE recorda_system_memory gauge',
          `recorda_system_memory ${systemMetrics.memory.used}`,
          '# TYPE recorda_system_memory_percentage gauge',
          `recorda_system_memory_percentage ${systemMetrics.memory.percentage}`,
          '# TYPE recorda_system_cpu gauge',
          `recorda_system_cpu ${systemMetrics.cpu.usage}`,
          '# TYPE recorda_system_uptime counter',
          `recorda_system_uptime ${systemMetrics.uptime}`,
          '# TYPE recorda_system_connections gauge',
          `recorda_system_connections ${systemMetrics.activeConnections}`,
          '# TYPE recorda_cache_keys gauge',
          `recorda_cache_keys ${systemMetrics.cache.keys}`,
          '# TYPE recorda_cache_memory gauge',
          `recorda_cache_memory_bytes ${systemMetrics.cache.memory}`,
          '# TYPE recorda_cache_connected gauge',
          `recorda_cache_connected ${systemMetrics.cache.connected ? 1 : 0}`,
        ];

        reply.type('text/plain').send(prometheusFormat.join('\n'));
      } catch (error) {
        reply.status(500).send('Error generating metrics');
      }
    });
  }

  /**
   * Endpoint de métricas em JSON
   */
  setupJsonMetrics(): void {
    this.server.get('/metrics', async (request, reply) => {
      try {
        const summary = this.getMetricsSummary();
        const systemMetrics = await this.getSystemMetrics();

        reply.send({
          timestamp: Date.now(),
          summary,
          system: systemMetrics,
          performance: this.getPerformanceMetrics(),
          errors: this.getErrorMetrics(),
        });
      } catch (error) {
        reply.status(500).send({ error: 'Error generating metrics' });
      }
    });
  }

  /**
   * Inicializar serviço APM
   */
  static initialize(server: FastifyInstance): APMService {
    const apm = new APMService(server);
    apm.setupPrometheusMetrics();
    apm.setupJsonMetrics();
    return apm;
  }
}
