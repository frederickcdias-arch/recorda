/**
 * Monitoring Dashboards
 * Implementa dashboards para visualização de métricas
 */

import type { FastifyInstance } from 'fastify';
import { getCacheService } from '../cache/index.js';

export interface DashboardConfig {
  title: string;
  description: string;
  refreshInterval: number;
  timeRange: string;
  widgets: DashboardWidget[];
}

export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'gauge' | 'status';
  title: string;
  query: string;
  position: { x: number; y: number; w: number; h: number };
  options?: Record<string, any>;
}

export interface MetricData {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

export class DashboardService {
  private dashboards: Map<string, DashboardConfig> = new Map();
  private metricsCache: Map<string, MetricData[]> = new Map();

  constructor(private server: FastifyInstance) {
    this.setupDefaultDashboards();
    this.setupRoutes();
  }

  /**
   * Configurar dashboards padrão
   */
  private setupDefaultDashboards(): void {
    // Dashboard de Performance
    this.dashboards.set('performance', {
      title: 'Performance Dashboard',
      description: 'Métricas de performance da aplicação',
      refreshInterval: 5000,
      timeRange: '1h',
      widgets: [
        {
          id: 'response-time',
          type: 'chart',
          title: 'Response Time (ms)',
          query: 'response_time',
          position: { x: 0, y: 0, w: 6, h: 4 },
          options: {
            chartType: 'line',
            yAxis: 'Response Time (ms)',
            threshold: 500,
          },
        },
        {
          id: 'throughput',
          type: 'gauge',
          title: 'Requests/sec',
          query: 'throughput',
          position: { x: 6, y: 0, w: 3, h: 4 },
          options: {
            min: 0,
            max: 1000,
            thresholds: [
              { value: 100, color: 'green' },
              { value: 500, color: 'yellow' },
              { value: 800, color: 'red' },
            ],
          },
        },
        {
          id: 'error-rate',
          type: 'gauge',
          title: 'Error Rate (%)',
          query: 'error_rate',
          position: { x: 9, y: 0, w: 3, h: 4 },
          options: {
            min: 0,
            max: 100,
            thresholds: [
              { value: 1, color: 'green' },
              { value: 5, color: 'yellow' },
              { value: 10, color: 'red' },
            ],
          },
        },
        {
          id: 'slow-requests',
          type: 'metric',
          title: 'Slow Requests (>1s)',
          query: 'slow_requests',
          position: { x: 0, y: 4, w: 4, h: 2 },
          options: {
            format: 'number',
            suffix: ' requests',
          },
        },
        {
          id: 'active-users',
          type: 'metric',
          title: 'Active Users',
          query: 'active_users',
          position: { x: 4, y: 4, w: 4, h: 2 },
          options: {
            format: 'number',
            suffix: ' users',
          },
        },
        {
          id: 'uptime',
          type: 'metric',
          title: 'Uptime',
          query: 'uptime',
          position: { x: 8, y: 4, w: 4, h: 2 },
          options: {
            format: 'duration',
          },
        },
      ],
    });

    // Dashboard de Sistema
    this.dashboards.set('system', {
      title: 'System Dashboard',
      description: 'Métricas do sistema e infraestrutura',
      refreshInterval: 10000,
      timeRange: '24h',
      widgets: [
        {
          id: 'memory-usage',
          type: 'gauge',
          title: 'Memory Usage (%)',
          query: 'memory_usage',
          position: { x: 0, y: 0, w: 3, h: 4 },
          options: {
            min: 0,
            max: 100,
            thresholds: [
              { value: 70, color: 'green' },
              { value: 85, color: 'yellow' },
              { value: 95, color: 'red' },
            ],
          },
        },
        {
          id: 'cpu-usage',
          type: 'gauge',
          title: 'CPU Usage (%)',
          query: 'cpu_usage',
          position: { x: 3, y: 0, w: 3, h: 4 },
          options: {
            min: 0,
            max: 100,
            thresholds: [
              { value: 50, color: 'green' },
              { value: 75, color: 'yellow' },
              { value: 90, color: 'red' },
            ],
          },
        },
        {
          id: 'disk-usage',
          type: 'gauge',
          title: 'Disk Usage (%)',
          query: 'disk_usage',
          position: { x: 6, y: 0, w: 3, h: 4 },
          options: {
            min: 0,
            max: 100,
            thresholds: [
              { value: 70, color: 'green' },
              { value: 85, color: 'yellow' },
              { value: 95, color: 'red' },
            ],
          },
        },
        {
          id: 'cache-stats',
          type: 'table',
          title: 'Cache Statistics',
          query: 'cache_stats',
          position: { x: 9, y: 0, w: 3, h: 4 },
          options: {
            columns: [
              { key: 'connected', label: 'Connected', type: 'boolean' },
              { key: 'keys', label: 'Keys', type: 'number' },
              { key: 'memory', label: 'Memory', type: 'bytes' },
              { key: 'hitRate', label: 'Hit Rate', type: 'percentage' },
            ],
          },
        },
        {
          id: 'connections',
          type: 'metric',
          title: 'Active Connections',
          query: 'connections',
          position: { x: 0, y: 4, w: 4, h: 2 },
          options: {
            format: 'number',
            suffix: ' connections',
          },
        },
        {
          id: 'database-health',
          type: 'status',
          title: 'Database Health',
          query: 'database_health',
          position: { x: 4, y: 4, w: 4, h: 2 },
          options: {
            statusMapping: {
              healthy: 'green',
              warning: 'yellow',
              unhealthy: 'red',
            },
          },
        },
        {
          id: 'cache-health',
          type: 'status',
          title: 'Cache Health',
          query: 'cache_health',
          position: { x: 8, y: 4, w: 4, h: 2 },
          options: {
            statusMapping: {
              healthy: 'green',
              warning: 'yellow',
              unhealthy: 'red',
            },
          },
        },
      ],
    });

    // Dashboard de Negócio
    this.dashboards.set('business', {
      title: 'Business Dashboard',
      description: 'Métricas de negócio e KPIs',
      refreshInterval: 30000,
      timeRange: '7d',
      widgets: [
        {
          id: 'total-users',
          type: 'metric',
          title: 'Total Users',
          query: 'total_users',
          position: { x: 0, y: 0, w: 3, h: 3 },
          options: {
            format: 'number',
            suffix: ' users',
          },
        },
        {
          id: 'active-projects',
          type: 'metric',
          title: 'Active Projects',
          query: 'active_projects',
          position: { x: 3, y: 0, w: 3, h: 3 },
          options: {
            format: 'number',
            suffix: ' projects',
          },
        },
        {
          id: 'daily-productions',
          type: 'chart',
          title: 'Daily Productions',
          query: 'daily_productions',
          position: { x: 6, y: 0, w: 6, h: 3 },
          options: {
            chartType: 'bar',
            yAxis: 'Productions',
          },
        },
        {
          id: 'top-projects',
          type: 'table',
          title: 'Top Projects',
          query: 'top_projects',
          position: { x: 0, y: 3, w: 6, h: 3 },
          options: {
            columns: [
              { key: 'name', label: 'Project', type: 'string' },
              { key: 'productions', label: 'Productions', type: 'number' },
              { key: 'completion', label: 'Completion', type: 'percentage' },
            ],
            sortBy: 'productions',
            sortOrder: 'desc',
          },
        },
        {
          id: 'user-activity',
          type: 'chart',
          title: 'User Activity',
          query: 'user_activity',
          position: { x: 6, y: 3, w: 6, h: 3 },
          options: {
            chartType: 'line',
            yAxis: 'Active Users',
          },
        },
      ],
    });
  }

  /**
   * Configurar rotas dos dashboards
   */
  private setupRoutes(): void {
    // Listar dashboards disponíveis
    this.server.get('/dashboards', async (request, reply) => {
      const dashboards = Array.from(this.dashboards.entries()).map(([id, config]) => ({
        id,
        title: config.title,
        description: config.description,
        refreshInterval: config.refreshInterval,
        timeRange: config.timeRange,
        widgetCount: config.widgets.length,
      }));

      reply.send({ dashboards });
    });

    // Obter configuração específica de dashboard
    this.server.get('/dashboards/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const dashboard = this.dashboards.get(id);

      if (!dashboard) {
        return reply.status(404).send({ error: 'Dashboard not found' });
      }

      reply.send(dashboard);
    });

    // Obter dados de widget
    this.server.get('/dashboards/:id/widgets/:widgetId/data', async (request, reply) => {
      const { id, widgetId } = request.params as { id: string; widgetId: string };
      const dashboard = this.dashboards.get(id);

      if (!dashboard) {
        return reply.status(404).send({ error: 'Dashboard not found' });
      }

      const widget = dashboard.widgets.find((w) => w.id === widgetId);
      if (!widget) {
        return reply.status(404).send({ error: 'Widget not found' });
      }

      try {
        const data = await this.getWidgetData(widget);
        reply.send({
          widgetId,
          data,
          timestamp: Date.now(),
          refreshInterval: dashboard.refreshInterval,
        });
      } catch (error) {
        reply.status(500).send({ error: 'Failed to get widget data' });
      }
    });

    // Obter dados de múltiplos widgets
    this.server.post('/dashboards/:id/data', async (request, reply) => {
      const { id } = request.params as { id: string };
      const { widgetIds } = request.body as { widgetIds: string[] };
      const dashboard = this.dashboards.get(id);

      if (!dashboard) {
        return reply.status(404).send({ error: 'Dashboard not found' });
      }

      const widgets = dashboard.widgets.filter((w) => widgetIds.includes(w.id));
      const data: Record<string, any> = {};

      for (const widget of widgets) {
        try {
          data[widget.id] = await this.getWidgetData(widget);
        } catch (error) {
          data[widget.id] = { error: 'Failed to load data' };
        }
      }

      reply.send({
        dashboardId: id,
        data,
        timestamp: Date.now(),
      });
    });

    // Criar dashboard customizado
    this.server.post('/dashboards', async (request, reply) => {
      const dashboardConfig = request.body as DashboardConfig;
      const id = `custom_${Date.now()}`;

      this.dashboards.set(id, dashboardConfig);

      reply.status(201).send({
        id,
        ...dashboardConfig,
        createdAt: new Date().toISOString(),
      });
    });

    // Atualizar dashboard
    this.server.put('/dashboards/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const dashboardConfig = request.body as DashboardConfig;

      if (!this.dashboards.has(id)) {
        return reply.status(404).send({ error: 'Dashboard not found' });
      }

      this.dashboards.set(id, dashboardConfig);

      reply.send({
        id,
        ...dashboardConfig,
        updatedAt: new Date().toISOString(),
      });
    });

    // Deletar dashboard
    this.server.delete('/dashboards/:id', async (request, reply) => {
      const { id } = request.params as { id: string };

      if (!this.dashboards.has(id)) {
        return reply.status(404).send({ error: 'Dashboard not found' });
      }

      this.dashboards.delete(id);
      reply.send({ message: 'Dashboard deleted successfully' });
    });
  }

  /**
   * Obter dados de widget
   */
  private async getWidgetData(widget: DashboardWidget): Promise<any> {
    switch (widget.query) {
      case 'response_time':
        return this.getMetricData('response_time', 60);
      case 'throughput':
        return this.getMetricData('throughput', 60);
      case 'error_rate':
        return this.getMetricData('error_rate', 60);
      case 'slow_requests':
        return this.getMetricData('slow_requests', 60);
      case 'active_users':
        return this.getMetricData('active_users', 60);
      case 'uptime':
        return this.getMetricData('uptime', 1);
      case 'memory_usage':
        return this.getSystemMetric('memory');
      case 'cpu_usage':
        return this.getSystemMetric('cpu');
      case 'disk_usage':
        return this.getSystemMetric('disk');
      case 'cache_stats':
        return this.getCacheStats();
      case 'connections':
        return this.getSystemMetric('connections');
      case 'database_health':
        return this.getHealthStatus('database');
      case 'cache_health':
        return this.getHealthStatus('cache');
      case 'total_users':
        return this.getBusinessMetric('total_users');
      case 'active_projects':
        return this.getBusinessMetric('active_projects');
      case 'daily_productions':
        return this.getBusinessMetric('daily_productions');
      case 'top_projects':
        return this.getBusinessMetric('top_projects');
      case 'user_activity':
        return this.getBusinessMetric('user_activity');
      default:
        throw new Error(`Unknown query: ${widget.query}`);
    }
  }

  /**
   * Obter métricas de performance
   */
  private async getMetricData(metric: string, minutes: number): Promise<MetricData[]> {
    const cacheKey = `metric_${metric}_${minutes}`;
    const cached = this.metricsCache.get(cacheKey);

    if (cached && cached.length > 0) {
      return cached;
    }

    // Simular coleta de métricas
    const data: MetricData[] = [];
    const now = Date.now();
    const interval = (minutes * 60 * 1000) / 60; // 1 ponto por minuto

    for (let i = 0; i < minutes; i++) {
      const timestamp = now - i * interval;
      let value = 0;

      switch (metric) {
        case 'response_time':
          value = 100 + Math.random() * 400; // 100-500ms
          break;
        case 'throughput':
          value = 50 + Math.random() * 200; // 50-250 req/s
          break;
        case 'error_rate':
          value = Math.random() * 5; // 0-5%
          break;
        case 'slow_requests':
          value = Math.floor(Math.random() * 10); // 0-10
          break;
        case 'active_users':
          value = Math.floor(10 + Math.random() * 90); // 10-100
          break;
        case 'uptime':
          value = process.uptime();
          break;
      }

      data.push({
        timestamp,
        value,
        labels: {
          metric,
          unit: this.getMetricUnit(metric),
        },
      });
    }

    this.metricsCache.set(cacheKey, data);
    return data.reverse(); // Mais recente primeiro
  }

  /**
   * Obter métricas do sistema
   */
  private async getSystemMetric(metric: string): Promise<any> {
    switch (metric) {
      case 'memory':
        return {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          percentage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100,
        };
      case 'cpu':
        return {
          usage: process.cpuUsage().user / 1000000, // Convert para segundos
        };
      case 'disk':
        return {
          used: 1024 * 1024 * 1024 * 10, // 10GB simulado
          total: 1024 * 1024 * 1024 * 50, // 50GB total
          percentage: 20,
        };
      case 'connections':
        return {
          active: Math.floor(10 + Math.random() * 90),
        };
      default:
        throw new Error(`Unknown system metric: ${metric}`);
    }
  }

  /**
   * Obter estatísticas do cache
   */
  private async getCacheStats(): Promise<any> {
    const cache = getCacheService();
    const stats = await cache.getStats();

    return {
      connected: stats.connected,
      keys: stats.keys,
      memory: stats.memory,
      hitRate: 85 + Math.random() * 10, // Simular 85-95%
    };
  }

  /**
   * Obter status de saúde
   */
  private async getHealthStatus(service: string): Promise<string> {
    // Simular verificação de saúde
    const random = Math.random();

    if (random > 0.95) {
      return 'unhealthy';
    } else if (random > 0.8) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  /**
   * Obter métricas de negócio
   */
  private async getBusinessMetric(metric: string): Promise<any> {
    switch (metric) {
      case 'total_users':
        return Math.floor(100 + Math.random() * 900);
      case 'active_projects':
        return Math.floor(5 + Math.random() * 20);
      case 'daily_productions':
        return Array.from({ length: 7 }, (_, i) => ({
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          count: Math.floor(50 + Math.random() * 200),
        })).reverse();
      case 'top_projects':
        return [
          { name: 'Project A', productions: 150, completion: 85 },
          { name: 'Project B', productions: 120, completion: 92 },
          { name: 'Project C', productions: 100, completion: 78 },
          { name: 'Project D', productions: 80, completion: 65 },
          { name: 'Project E', productions: 60, completion: 45 },
        ];
      case 'user_activity':
        return Array.from({ length: 24 }, (_, i) => ({
          hour: i,
          users: Math.floor(10 + Math.random() * 40),
        }));
      default:
        throw new Error(`Unknown business metric: ${metric}`);
    }
  }

  /**
   * Obter unidade da métrica
   */
  private getMetricUnit(metric: string): string {
    const units: Record<string, string> = {
      response_time: 'ms',
      throughput: 'req/s',
      error_rate: '%',
      slow_requests: 'count',
      active_users: 'users',
      uptime: 'seconds',
    };

    return units[metric] || '';
  }

  /**
   * Limpar cache de métricas
   */
  clearMetricsCache(): void {
    this.metricsCache.clear();
  }

  /**
   * Obter todos os dashboards
   */
  getDashboards(): Map<string, DashboardConfig> {
    return this.dashboards;
  }

  /**
   * Criar dashboard customizado
   */
  createDashboard(id: string, config: DashboardConfig): void {
    this.dashboards.set(id, config);
  }

  /**
   * Remover dashboard
   */
  removeDashboard(id: string): boolean {
    return this.dashboards.delete(id);
  }

  /**
   * Inicializar serviço de dashboards
   */
  static initialize(server: FastifyInstance): DashboardService {
    const dashboard = new DashboardService(server);
    console.log('Dashboard service initialized with default dashboards');
    return dashboard;
  }
}

export default DashboardService;
