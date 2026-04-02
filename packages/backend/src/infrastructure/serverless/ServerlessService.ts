/**
 * Serverless Service
 * Implementa arquitetura serverless com edge computing
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '../logging/logger.js';
import { getEventService, EventTypes } from '../events/index.js';

export interface ServerlessFunction {
  id: string;
  name: string;
  runtime: 'nodejs' | 'python' | 'go' | 'rust' | 'deno';
  handler: string;
  code: string;
  environment: Record<string, string>;
  memory: number; // MB
  timeout: number; // seconds
  triggers: ServerlessTrigger[];
  status: 'active' | 'inactive' | 'deploying' | 'error';
  version: string;
  createdAt: Date;
  updatedAt: Date;
  lastInvoked?: Date;
  invocationCount: number;
  errorCount: number;
  averageExecutionTime: number;
  cost: number;
}

export interface ServerlessTrigger {
  id: string;
  type: 'http' | 'event' | 'schedule' | 'queue' | 'stream' | 'database';
  config: Record<string, any>;
  enabled: boolean;
}

export interface ServerlessExecution {
  id: string;
  functionId: string;
  requestId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  startTime: Date;
  endTime?: Date;
  executionTime: number;
  memoryUsed: number;
  logs: string[];
  error?: string;
  result?: any;
  cost: number;
  coldStart: boolean;
}

export interface EdgeFunction {
  id: string;
  name: string;
  runtime: 'javascript' | 'typescript' | 'webassembly';
  code: string;
  edgeLocations: string[];
  cache: {
    enabled: boolean;
    ttl: number; // seconds
    strategy: 'lru' | 'fifo' | 'ttl';
  };
  triggers: EdgeTrigger[];
  status: 'active' | 'inactive' | 'deploying' | 'error';
  version: string;
  createdAt: Date;
  updatedAt: Date;
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  bandwidth: number;
}

export interface EdgeTrigger {
  id: string;
  type: 'request' | 'response' | 'origin' | 'viewer';
  condition: string;
  priority: number;
}

export interface ServerlessMetrics {
  functions: {
    total: number;
    active: number;
    inactive: number;
    error: number;
  };
  executions: {
    total: number;
    successful: number;
    failed: number;
    averageExecutionTime: number;
    totalCost: number;
  };
  edge: {
    totalFunctions: number;
    activeFunctions: number;
    totalRequests: number;
    averageResponseTime: number;
    bandwidth: number;
    cacheHitRate: number;
  };
  performance: {
    coldStartRate: number;
    errorRate: number;
    averageMemoryUsage: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
}

export class ServerlessService {
  private functions: Map<string, ServerlessFunction> = new Map();
  private executions: Map<string, ServerlessExecution[]> = new Map();
  private edgeFunctions: Map<string, EdgeFunction> = new Map();
  private eventService = getEventService();

  constructor(private server: FastifyInstance) {
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeEdgeComputing();
    this.startAutoScaling();
  }

  /**
   * Configurar middleware serverless
   */
  private setupMiddleware(): void {
    // Middleware para routing serverless
    this.server.addHook('preHandler', async (request, reply) => {
      const path = request.url;
      const method = request.method;

      // Verificar se há função serverless para esta rota
      const serverlessFunction = this.findServerlessFunction(method, path);

      if (serverlessFunction) {
        return this.executeServerlessFunction(serverlessFunction, request, reply);
      }
    });

    // Middleware para edge functions
    this.server.addHook('onRequest', async (request, reply) => {
      const edgeFunction = this.findEdgeFunction(request);

      if (edgeFunction) {
        return this.executeEdgeFunction(edgeFunction, request, reply);
      }
    });

    // Middleware para cold start optimization
    this.server.addHook('onReady', async () => {
      await this.preloadFunctions();
    });
  }

  /**
   * Configurar rotas serverless
   */
  private setupRoutes(): void {
    // Gerenciar funções serverless
    this.server.post(
      '/admin/serverless/functions',
      {
        schema: {
          description: 'Criar função serverless',
          tags: ['admin', 'serverless'],
          body: {
            type: 'object',
            required: ['name', 'runtime', 'handler', 'code'],
            properties: {
              name: { type: 'string' },
              runtime: { type: 'string', enum: ['nodejs', 'python', 'go', 'rust', 'deno'] },
              handler: { type: 'string' },
              code: { type: 'string' },
              environment: { type: 'object' },
              memory: { type: 'number', minimum: 128, maximum: 10240 },
              timeout: { type: 'number', minimum: 1, maximum: 900 },
              triggers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['http', 'event', 'schedule', 'queue', 'stream', 'database'],
                    },
                    config: { type: 'object' },
                    enabled: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const functionData = request.body as any;

        try {
          const serverlessFunction = await this.createServerlessFunction(functionData);
          reply.status(201).send(serverlessFunction);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create serverless function' });
        }
      }
    );

    // Listar funções serverless
    this.server.get(
      '/admin/serverless/functions',
      {
        schema: {
          description: 'Listar funções serverless',
          tags: ['admin', 'serverless'],
        },
      },
      async (request, reply) => {
        const functions = Array.from(this.functions.values());
        reply.send({ functions });
      }
    );

    // Executar função serverless
    this.server.post(
      '/admin/serverless/functions/:id/execute',
      {
        schema: {
          description: 'Executar função serverless',
          tags: ['admin', 'serverless'],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            properties: {
              payload: { type: 'object' },
              context: { type: 'object' },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const { payload, context } = request.body as any;

        try {
          const execution = await this.executeFunctionById(id, payload, context);
          reply.send(execution);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to execute serverless function' });
        }
      }
    );

    // Gerenciar edge functions
    this.server.post(
      '/admin/serverless/edge-functions',
      {
        schema: {
          description: 'Criar edge function',
          tags: ['admin', 'serverless', 'edge'],
          body: {
            type: 'object',
            required: ['name', 'runtime', 'code'],
            properties: {
              name: { type: 'string' },
              runtime: { type: 'string', enum: ['javascript', 'typescript', 'webassembly'] },
              code: { type: 'string' },
              edgeLocations: {
                type: 'array',
                items: { type: 'string' },
              },
              cache: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean' },
                  ttl: { type: 'number' },
                  strategy: { type: 'string', enum: ['lru', 'fifo', 'ttl'] },
                },
              },
              triggers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['request', 'response', 'origin', 'viewer'] },
                    condition: { type: 'string' },
                    priority: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const functionData = request.body as any;

        try {
          const edgeFunction = await this.createEdgeFunction(functionData);
          reply.status(201).send(edgeFunction);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create edge function' });
        }
      }
    );

    // Listar edge functions
    this.server.get(
      '/admin/serverless/edge-functions',
      {
        schema: {
          description: 'Listar edge functions',
          tags: ['admin', 'serverless', 'edge'],
        },
      },
      async (request, reply) => {
        const functions = Array.from(this.edgeFunctions.values());
        reply.send({ functions });
      }
    );

    // Métricas serverless
    this.server.get(
      '/admin/serverless/metrics',
      {
        schema: {
          description: 'Obter métricas serverless',
          tags: ['admin', 'serverless'],
        },
      },
      async (request, reply) => {
        const metrics = await this.getServerlessMetrics();
        reply.send(metrics);
      }
    );

    // Otimização de cold starts
    this.server.post(
      '/admin/serverless/optimize-cold-starts',
      {
        schema: {
          description: 'Otimizar cold starts',
          tags: ['admin', 'serverless'],
        },
      },
      async (request, reply) => {
        try {
          await this.optimizeColdStarts();
          reply.send({ message: 'Cold start optimization completed' });
        } catch (error) {
          reply.status(500).send({ error: 'Failed to optimize cold starts' });
        }
      }
    );

    // Auto-scaling
    this.server.post(
      '/admin/serverless/auto-scale',
      {
        schema: {
          description: 'Configurar auto-scaling',
          tags: ['admin', 'serverless'],
          body: {
            type: 'object',
            properties: {
              minInstances: { type: 'number', minimum: 0 },
              maxInstances: { type: 'number', minimum: 1 },
              targetCPU: { type: 'number', minimum: 1, maximum: 100 },
              targetMemory: { type: 'number', minimum: 1, maximum: 100 },
            },
          },
        },
      },
      async (request, reply) => {
        const scalingConfig = request.body as any;

        try {
          await this.configureAutoScaling(scalingConfig);
          reply.send({ message: 'Auto-scaling configured successfully' });
        } catch (error) {
          reply.status(500).send({ error: 'Failed to configure auto-scaling' });
        }
      }
    );
  }

  /**
   * Criar função serverless
   */
  private async createServerlessFunction(functionData: any): Promise<ServerlessFunction> {
    const id = `function_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const serverlessFunction: ServerlessFunction = {
      id,
      name: functionData.name,
      runtime: functionData.runtime,
      handler: functionData.handler,
      code: functionData.code,
      environment: functionData.environment || {},
      memory: functionData.memory || 512,
      timeout: functionData.timeout || 30,
      triggers: functionData.triggers || [],
      status: 'active',
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      invocationCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      cost: 0,
    };

    this.functions.set(id, serverlessFunction);

    // Publicar evento
    await this.eventService.publish({
      type: EventTypes.SYSTEM_EVENT,
      data: {
        event: 'serverless_function_created',
        functionId: id,
        functionName: functionData.name,
        runtime: functionData.runtime,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info('Serverless function created', { id, name: functionData.name });
    return serverlessFunction;
  }

  /**
   * Criar edge function
   */
  private async createEdgeFunction(functionData: any): Promise<EdgeFunction> {
    const id = `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const edgeFunction: EdgeFunction = {
      id,
      name: functionData.name,
      runtime: functionData.runtime,
      code: functionData.code,
      edgeLocations: functionData.edgeLocations || ['global'],
      cache: functionData.cache || {
        enabled: true,
        ttl: 3600,
        strategy: 'lru',
      },
      triggers: functionData.triggers || [],
      status: 'active',
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      requestCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      bandwidth: 0,
    };

    this.edgeFunctions.set(id, edgeFunction);

    // Publicar evento
    await this.eventService.publish({
      type: EventTypes.SYSTEM_EVENT,
      data: {
        event: 'edge_function_created',
        functionId: id,
        functionName: functionData.name,
        runtime: functionData.runtime,
        edgeLocations: functionData.edgeLocations,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info('Edge function created', { id, name: functionData.name });
    return edgeFunction;
  }

  /**
   * Encontrar função serverless para rota
   */
  private findServerlessFunction(method: string, path: string): ServerlessFunction | null {
    for (const func of this.functions.values()) {
      if (func.status !== 'active') continue;

      for (const trigger of func.triggers) {
        if (trigger.type === 'http' && trigger.enabled) {
          const triggerMethod = trigger.config.method?.toUpperCase() || 'GET';
          const triggerPath = trigger.config.path;

          if (triggerMethod === method && this.matchPath(triggerPath, path)) {
            return func;
          }
        }
      }
    }

    return null;
  }

  /**
   * Encontrar edge function para request
   */
  private findEdgeFunction(request: any): EdgeFunction | null {
    const path = request.url;
    const method = request.method;

    for (const func of this.edgeFunctions.values()) {
      if (func.status !== 'active') continue;

      for (const trigger of func.triggers) {
        if (trigger.type === 'request' || trigger.type === 'viewer') {
          if (this.evaluateCondition(trigger.condition, request)) {
            return func;
          }
        }
      }
    }

    return null;
  }

  /**
   * Executar função serverless
   */
  private async executeServerlessFunction(
    serverlessFunction: ServerlessFunction,
    request: any,
    reply: any
  ): Promise<any> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();

    const execution: ServerlessExecution = {
      id: executionId,
      functionId: serverlessFunction.id,
      requestId: request.id || executionId,
      status: 'running',
      startTime,
      executionTime: 0,
      memoryUsed: 0,
      logs: [],
      cost: 0,
      coldStart:
        !serverlessFunction.lastInvoked ||
        Date.now() - serverlessFunction.lastInvoked.getTime() > 300000, // 5 minutos
    };

    try {
      // Simular execução da função
      const result = await this.simulateFunctionExecution(serverlessFunction, request);

      execution.status = 'completed';
      execution.endTime = new Date();
      execution.executionTime = execution.endTime.getTime() - startTime.getTime();
      execution.result = result;
      execution.cost = this.calculateExecutionCost(serverlessFunction, execution);

      // Atualizar métricas da função
      serverlessFunction.lastInvoked = new Date();
      serverlessFunction.invocationCount++;
      serverlessFunction.averageExecutionTime =
        (serverlessFunction.averageExecutionTime * (serverlessFunction.invocationCount - 1) +
          execution.executionTime) /
        serverlessFunction.invocationCount;
      serverlessFunction.cost += execution.cost;

      // Armazenar execução
      if (!this.executions.has(serverlessFunction.id)) {
        this.executions.set(serverlessFunction.id, []);
      }
      this.executions.get(serverlessFunction.id)!.push(execution);

      // Publicar evento
      await this.eventService.publish({
        type: EventTypes.SYSTEM_EVENT,
        data: {
          event: 'serverless_function_executed',
          executionId,
          functionId: serverlessFunction.id,
          functionName: serverlessFunction.name,
          executionTime: execution.executionTime,
          cost: execution.cost,
          coldStart: execution.coldStart,
          timestamp: new Date().toISOString(),
        },
      });

      logger.info('Serverless function executed', {
        executionId,
        functionId: serverlessFunction.id,
        executionTime: execution.executionTime,
        coldStart: execution.coldStart,
      });

      return result;
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.executionTime = execution.endTime.getTime() - startTime.getTime();
      execution.error = error instanceof Error ? error.message : 'Unknown error';

      serverlessFunction.errorCount++;

      // Publicar evento de erro
      await this.eventService.publish({
        type: EventTypes.SYSTEM_EVENT,
        data: {
          event: 'serverless_function_failed',
          executionId,
          functionId: serverlessFunction.id,
          functionName: serverlessFunction.name,
          error: execution.error,
          executionTime: execution.executionTime,
          timestamp: new Date().toISOString(),
        },
      });

      logger.error('Serverless function execution failed', {
        executionId,
        functionId: serverlessFunction.id,
        error: execution.error,
      });

      throw error;
    }
  }

  /**
   * Executar edge function
   */
  private async executeEdgeFunction(
    edgeFunction: EdgeFunction,
    request: any,
    reply: any
  ): Promise<any> {
    const startTime = new Date();

    try {
      // Simular execução da edge function
      const result = await this.simulateEdgeFunctionExecution(edgeFunction, request);

      const executionTime = Date.now() - startTime.getTime();

      // Atualizar métricas da edge function
      edgeFunction.requestCount++;
      edgeFunction.averageResponseTime =
        (edgeFunction.averageResponseTime * (edgeFunction.requestCount - 1) + executionTime) /
        edgeFunction.requestCount;

      // Publicar evento
      await this.eventService.publish({
        type: EventTypes.SYSTEM_EVENT,
        data: {
          event: 'edge_function_executed',
          functionId: edgeFunction.id,
          functionName: edgeFunction.name,
          executionTime,
          edgeLocation: this.getEdgeLocation(request),
          timestamp: new Date().toISOString(),
        },
      });

      logger.info('Edge function executed', {
        functionId: edgeFunction.id,
        executionTime,
        edgeLocation: this.getEdgeLocation(request),
      });

      return result;
    } catch (error) {
      edgeFunction.errorCount++;

      logger.error('Edge function execution failed', {
        functionId: edgeFunction.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Simular execução de função serverless
   */
  private async simulateFunctionExecution(
    serverlessFunction: ServerlessFunction,
    request: any
  ): Promise<any> {
    // Simular tempo de execução baseado no runtime e memória
    const baseTime = 100; // ms base
    const memoryFactor = serverlessFunction.memory / 512;
    const runtimeFactor = this.getRuntimeFactor(serverlessFunction.runtime);
    const executionTime = baseTime * memoryFactor * runtimeFactor;

    await new Promise((resolve) => setTimeout(resolve, executionTime));

    // Simular resultado baseado no handler
    const result = {
      statusCode: 200,
      body: JSON.stringify({
        message: `Function ${serverlessFunction.name} executed successfully`,
        runtime: serverlessFunction.runtime,
        memory: serverlessFunction.memory,
        executionTime,
        timestamp: new Date().toISOString(),
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-Function-Name': serverlessFunction.name,
        'X-Execution-Time': executionTime.toString(),
      },
    };

    return result;
  }

  /**
   * Simular execução de edge function
   */
  private async simulateEdgeFunctionExecution(
    edgeFunction: EdgeFunction,
    request: any
  ): Promise<any> {
    // Simular tempo de execução mais rápido para edge
    const baseTime = 50; // ms base para edge
    const runtimeFactor = this.getEdgeRuntimeFactor(edgeFunction.runtime);
    const executionTime = baseTime * runtimeFactor;

    await new Promise((resolve) => setTimeout(resolve, executionTime));

    return {
      modified: true,
      headers: {
        'X-Edge-Function': edgeFunction.name,
        'X-Edge-Location': this.getEdgeLocation(request),
        'X-Execution-Time': executionTime.toString(),
      },
      response: {
        message: `Edge function ${edgeFunction.name} executed`,
        edgeLocation: this.getEdgeLocation(request),
        executionTime,
      },
    };
  }

  /**
   * Executar função por ID
   */
  private async executeFunctionById(
    functionId: string,
    payload: any,
    context: any
  ): Promise<ServerlessExecution> {
    const serverlessFunction = this.functions.get(functionId);

    if (!serverlessFunction) {
      throw new Error(`Serverless function not found: ${functionId}`);
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();

    const execution: ServerlessExecution = {
      id: executionId,
      functionId,
      requestId: executionId,
      status: 'running',
      startTime,
      executionTime: 0,
      memoryUsed: 0,
      logs: [],
      cost: 0,
      coldStart:
        !serverlessFunction.lastInvoked ||
        Date.now() - serverlessFunction.lastInvoked.getTime() > 300000,
    };

    try {
      // Simular execução com payload
      const result = await this.simulateFunctionExecutionWithPayload(
        serverlessFunction,
        payload,
        context
      );

      execution.status = 'completed';
      execution.endTime = new Date();
      execution.executionTime = execution.endTime.getTime() - startTime.getTime();
      execution.result = result;
      execution.cost = this.calculateExecutionCost(serverlessFunction, execution);

      // Atualizar métricas
      serverlessFunction.lastInvoked = new Date();
      serverlessFunction.invocationCount++;
      serverlessFunction.averageExecutionTime =
        (serverlessFunction.averageExecutionTime * (serverlessFunction.invocationCount - 1) +
          execution.executionTime) /
        serverlessFunction.invocationCount;
      serverlessFunction.cost += execution.cost;

      // Armazenar execução
      if (!this.executions.has(functionId)) {
        this.executions.set(functionId, []);
      }
      this.executions.get(functionId)!.push(execution);

      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.executionTime = execution.endTime.getTime() - startTime.getTime();
      execution.error = error instanceof Error ? error.message : 'Unknown error';

      serverlessFunction.errorCount++;

      return execution;
    }
  }

  /**
   * Simular execução com payload
   */
  private async simulateFunctionExecutionWithPayload(
    serverlessFunction: ServerlessFunction,
    payload: any,
    context: any
  ): Promise<any> {
    const baseTime = 100;
    const memoryFactor = serverlessFunction.memory / 512;
    const runtimeFactor = this.getRuntimeFactor(serverlessFunction.runtime);
    const executionTime = baseTime * memoryFactor * runtimeFactor;

    await new Promise((resolve) => setTimeout(resolve, executionTime));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Function ${serverlessFunction.name} executed with payload`,
        payload,
        context,
        runtime: serverlessFunction.runtime,
        executionTime,
        timestamp: new Date().toISOString(),
      }),
    };
  }

  /**
   * Obter métricas serverless
   */
  private async getServerlessMetrics(): Promise<ServerlessMetrics> {
    const functions = Array.from(this.functions.values());
    const edgeFunctions = Array.from(this.edgeFunctions.values());
    const allExecutions = Array.from(this.executions.values()).flat();

    const successfulExecutions = allExecutions.filter((e) => e.status === 'completed');
    const failedExecutions = allExecutions.filter((e) => e.status === 'failed');
    const coldStarts = allExecutions.filter((e) => e.coldStart);

    return {
      functions: {
        total: functions.length,
        active: functions.filter((f) => f.status === 'active').length,
        inactive: functions.filter((f) => f.status === 'inactive').length,
        error: functions.filter((f) => f.status === 'error').length,
      },
      executions: {
        total: allExecutions.length,
        successful: successfulExecutions.length,
        failed: failedExecutions.length,
        averageExecutionTime:
          successfulExecutions.reduce((sum, e) => sum + e.executionTime, 0) /
            successfulExecutions.length || 0,
        totalCost: functions.reduce((sum, f) => sum + f.cost, 0),
      },
      edge: {
        totalFunctions: edgeFunctions.length,
        activeFunctions: edgeFunctions.filter((f) => f.status === 'active').length,
        totalRequests: edgeFunctions.reduce((sum, f) => sum + f.requestCount, 0),
        averageResponseTime:
          edgeFunctions.reduce((sum, f) => sum + f.averageResponseTime, 0) / edgeFunctions.length ||
          0,
        bandwidth: edgeFunctions.reduce((sum, f) => sum + f.bandwidth, 0),
        cacheHitRate: 0.85, // Simulado
      },
      performance: {
        coldStartRate: coldStarts.length / allExecutions.length || 0,
        errorRate: failedExecutions.length / allExecutions.length || 0,
        averageMemoryUsage: functions.reduce((sum, f) => sum + f.memory, 0) / functions.length || 0,
        p95ResponseTime: this.calculatePercentile(
          successfulExecutions.map((e) => e.executionTime),
          95
        ),
        p99ResponseTime: this.calculatePercentile(
          successfulExecutions.map((e) => e.executionTime),
          99
        ),
      },
    };
  }

  /**
   * Otimizar cold starts
   */
  private async optimizeColdStarts(): Promise<void> {
    logger.info('Starting cold start optimization');

    // Preaquecer funções mais usadas
    const functions = Array.from(this.functions.values())
      .filter((f) => f.status === 'active')
      .sort((a, b) => b.invocationCount - a.invocationCount)
      .slice(0, 10); // Top 10 funções

    for (const func of functions) {
      // Simular preaquecimento
      await this.preWarmFunction(func);
    }

    // Publicar evento
    await this.eventService.publish({
      type: EventTypes.SYSTEM_EVENT,
      data: {
        event: 'cold_start_optimization_completed',
        optimizedFunctions: functions.length,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info('Cold start optimization completed', { optimizedFunctions: functions.length });
  }

  /**
   * Preaquecer função
   */
  private async preWarmFunction(serverlessFunction: ServerlessFunction): Promise<void> {
    // Simular preaquecimento
    await new Promise((resolve) => setTimeout(resolve, 50));

    logger.debug('Function pre-warmed', { functionId: serverlessFunction.id });
  }

  /**
   * Configurar auto-scaling
   */
  private async configureAutoScaling(config: any): Promise<void> {
    logger.info('Configuring auto-scaling', config);

    // Implementar lógica de auto-scaling
    // Isso envolveria monitoramento de métricas e ajuste automático de instâncias

    await this.eventService.publish({
      type: EventTypes.SYSTEM_EVENT,
      data: {
        event: 'auto_scaling_configured',
        config,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Inicializar edge computing
   */
  private initializeEdgeComputing(): void {
    logger.info('Initializing edge computing');

    // Configurar edge locations
    const edgeLocations = [
      'us-east-1',
      'us-west-2',
      'eu-west-1',
      'ap-southeast-1',
      'ap-northeast-1',
    ];

    // Inicializar edge cache
    this.initializeEdgeCache();
  }

  /**
   * Inicializar edge cache
   */
  private initializeEdgeCache(): void {
    logger.info('Initializing edge cache');

    // Implementar cache distribuído no edge
  }

  /**
   * Iniciar auto-scaling
   */
  private startAutoScaling(): void {
    logger.info('Starting auto-scaling monitoring');

    // Monitorar métricas e ajustar escala automaticamente
    setInterval(async () => {
      await this.monitorAndScale();
    }, 30000); // A cada 30 segundos
  }

  /**
   * Monitorar e ajustar escala
   */
  private async monitorAndScale(): Promise<void> {
    const metrics = await this.getServerlessMetrics();

    // Lógica de auto-scaling baseada em métricas
    if (metrics.performance.errorRate > 0.1) {
      // 10% error rate
      logger.warn('High error rate detected, considering scale up');
    }

    if (metrics.performance.p95ResponseTime > 5000) {
      // 5 segundos
      logger.warn('High response time detected, considering scale up');
    }
  }

  /**
   * Preload functions
   */
  private async preloadFunctions(): Promise<void> {
    logger.info('Preloading serverless functions');

    // Carregar funções mais críticas em memória
    const criticalFunctions = Array.from(this.functions.values())
      .filter((f) => f.status === 'active')
      .slice(0, 5);

    for (const func of criticalFunctions) {
      await this.preWarmFunction(func);
    }
  }

  /**
   * Utilitários
   */
  private matchPath(pattern: string, path: string): boolean {
    // Implementar matching de path com wildcards
    if (pattern === path) return true;
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(path);
    }
    return false;
  }

  private evaluateCondition(condition: string, request: any): boolean {
    // Implementar avaliação de condição (simplificado)
    try {
      // Avaliar condição básica
      return true;
    } catch {
      return false;
    }
  }

  private getRuntimeFactor(runtime: string): number {
    const factors = {
      nodejs: 1.0,
      python: 1.2,
      go: 0.8,
      rust: 0.7,
      deno: 0.9,
    };
    return factors[runtime as keyof typeof factors] || 1.0;
  }

  private getEdgeRuntimeFactor(runtime: string): number {
    const factors = {
      javascript: 1.0,
      typescript: 1.0,
      webassembly: 0.5,
    };
    return factors[runtime as keyof typeof factors] || 1.0;
  }

  private calculateExecutionCost(
    serverlessFunction: ServerlessFunction,
    execution: ServerlessExecution
  ): number {
    // Cálculo simplificado de custo
    const memoryCost = (serverlessFunction.memory / 128) * 0.0000167; // $0.0000167 per GB-second
    const executionCost = (execution.executionTime / 1000) * memoryCost;
    const requestCost = 0.0000002; // $0.20 per million requests

    return executionCost + requestCost;
  }

  private getEdgeLocation(request: any): string {
    // Simular detecção de edge location
    const locations = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];
    return locations[Math.floor(Math.random() * locations.length)];
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }
}

// Singleton instance
let serverlessServiceInstance: ServerlessService | null = null;

export function getServerlessService(server?: FastifyInstance): ServerlessService {
  if (!serverlessServiceInstance && server) {
    serverlessServiceInstance = new ServerlessService(server);
  }

  if (!serverlessServiceInstance) {
    throw new Error('ServerlessService not initialized. Call getServerlessService(server) first.');
  }

  return serverlessServiceInstance;
}
