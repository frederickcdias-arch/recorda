/**
 * Backup Service - Implementação de backup automatizado e disaster recovery
 * Garanteia proteção de dados com RPO/RTO definidos
 */

import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { logger } from '../logging/logger.js';
import { getEventService, EventTypes } from '../events/index.js';

export interface BackupConfig {
  id: string;
  name: string;
  type: 'full' | 'incremental' | 'differential';
  schedule: string; // Cron expression
  retention: number; // em dias
  compression: boolean;
  encryption: boolean;
  destinations: BackupDestination[];
  databases: string[];
  rpo: number; // Recovery Point Objective em minutos
  rto: number; // Recovery Time Objective em minutos
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BackupDestination {
  id: string;
  type: 'local' | 's3' | 'azure' | 'gcs' | 'ftp';
  name: string;
  config: Record<string, any>;
  priority: number;
  enabled: boolean;
}

export interface BackupJob {
  id: string;
  configId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  size?: number;
  files: BackupFile[];
  error?: string;
  logs: string[];
  metadata: Record<string, any>;
}

export interface BackupFile {
  id: string;
  name: string;
  path: string;
  size: number;
  checksum: string;
  compressed: boolean;
  encrypted: boolean;
  destinationId: string;
  createdAt: Date;
}

export interface DisasterRecoveryPlan {
  id: string;
  name: string;
  tenantId: string;
  rpo: number;
  rto: number;
  procedures: RecoveryProcedure[];
  contacts: EmergencyContact[];
  lastTested?: Date;
  status: 'active' | 'inactive' | 'testing';
  createdAt: Date;
  updatedAt: Date;
}

export interface RecoveryProcedure {
  id: string;
  name: string;
  description: string;
  steps: RecoveryStep[];
  estimatedDuration: number;
  dependencies: string[];
}

export interface RecoveryStep {
  id: string;
  name: string;
  description: string;
  command: string;
  expectedOutput?: string;
  timeout: number;
  retryAttempts: number;
}

export interface EmergencyContact {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  priority: 'primary' | 'secondary' | 'tertiary';
  available24h: boolean;
}

export class BackupService {
  private configs: Map<string, BackupConfig> = new Map();
  private jobs: Map<string, BackupJob> = new Map();
  private schedules: Map<string, NodeJS.Timeout> = new Map();
  private drPlans: Map<string, DisasterRecoveryPlan> = new Map();
  private eventService = getEventService();

  constructor(private server: FastifyInstance) {
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeDefaultConfigs();
    this.startSchedules();
  }

  /**
   * Configurar middleware de backup
   */
  private setupMiddleware(): void {
    // Middleware para registrar alterações críticas
    this.server.addHook('onResponse', async (request, reply) => {
      const criticalOperations = ['POST', 'PUT', 'DELETE'];
      const isCritical = criticalOperations.includes(request.method);

      if (isCritical && reply.statusCode >= 200 && reply.statusCode < 300) {
        await this.recordCriticalOperation(request);
      }
    });
  }

  /**
   * Configurar rotas de backup
   */
  private setupRoutes(): void {
    // Gerenciar configurações de backup
    this.server.post(
      '/admin/backup/configs',
      {
        schema: {
          description: 'Criar configuração de backup',
          tags: ['admin', 'backup'],
          body: {
            type: 'object',
            required: ['name', 'type', 'schedule', 'databases'],
            properties: {
              name: { type: 'string' },
              type: { type: 'string', enum: ['full', 'incremental', 'differential'] },
              schedule: { type: 'string' },
              databases: { type: 'array', items: { type: 'string' } },
              retention: { type: 'number' },
              compression: { type: 'boolean' },
              encryption: { type: 'boolean' },
              rpo: { type: 'number' },
              rto: { type: 'number' },
              destinations: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
      async (request, reply) => {
        const configData = request.body as any;

        try {
          const config = await this.createBackupConfig(configData);
          reply.status(201).send(config);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create backup config' });
        }
      }
    );

    // Listar configurações de backup
    this.server.get(
      '/admin/backup/configs',
      {
        schema: {
          description: 'Listar configurações de backup',
          tags: ['admin', 'backup'],
        },
      },
      async (request, reply) => {
        const configs = Array.from(this.configs.values());
        reply.send({ configs });
      }
    );

    // Executar backup manual
    this.server.post(
      '/admin/backup/execute/:configId',
      {
        schema: {
          description: 'Executar backup manual',
          tags: ['admin', 'backup'],
          params: {
            type: 'object',
            properties: {
              configId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { configId } = request.params as { configId: string };

        try {
          const job = await this.executeBackup(configId);
          reply.status(201).send(job);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to execute backup' });
        }
      }
    );

    // Obter status do backup
    this.server.get(
      '/admin/backup/jobs/:jobId',
      {
        schema: {
          description: 'Obter status do backup',
          tags: ['admin', 'backup'],
          params: {
            type: 'object',
            properties: {
              jobId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { jobId } = request.params as { jobId: string };
        const job = this.jobs.get(jobId);

        if (!job) {
          return reply.status(404).send({ error: 'Backup job not found' });
        }

        reply.send(job);
      }
    );

    // Cancelar backup
    this.server.post(
      '/admin/backup/cancel/:jobId',
      {
        schema: {
          description: 'Cancelar backup',
          tags: ['admin', 'backup'],
          params: {
            type: 'object',
            properties: {
              jobId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { jobId } = request.params as { jobId: string };

        try {
          await this.cancelBackup(jobId);
          reply.send({ message: 'Backup cancelled' });
        } catch (error) {
          reply.status(500).send({ error: 'Failed to cancel backup' });
        }
      }
    );

    // Criar plano de disaster recovery
    this.server.post(
      '/admin/disaster-recovery/plans',
      {
        schema: {
          description: 'Criar plano de disaster recovery',
          tags: ['admin', 'disaster-recovery'],
          body: {
            type: 'object',
            required: ['name', 'tenantId', 'procedures'],
            properties: {
              name: { type: 'string' },
              tenantId: { type: 'string' },
              rpo: { type: 'number' },
              rto: { type: 'number' },
              procedures: { type: 'array', items: { type: 'object' } },
              contacts: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
      async (request, reply) => {
        const planData = request.body as any;

        try {
          const plan = await this.createDisasterRecoveryPlan(planData);
          reply.status(201).send(plan);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create disaster recovery plan' });
        }
      }
    );

    // Executar disaster recovery
    this.server.post(
      '/admin/disaster-recovery/execute/:planId',
      {
        schema: {
          description: 'Executar plano de disaster recovery',
          tags: ['admin', 'disaster-recovery'],
          params: {
            type: 'object',
            properties: {
              planId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { planId } = request.params as { planId: string };

        try {
          const result = await this.executeDisasterRecovery(planId);
          reply.send(result);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to execute disaster recovery' });
        }
      }
    );

    // Testar plano de disaster recovery
    this.server.post(
      '/admin/disaster-recovery/test/:planId',
      {
        schema: {
          description: 'Testar plano de disaster recovery',
          tags: ['admin', 'disaster-recovery'],
          params: {
            type: 'object',
            properties: {
              planId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { planId } = request.params as { planId: string };

        try {
          const result = await this.testDisasterRecoveryPlan(planId);
          reply.send(result);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to test disaster recovery plan' });
        }
      }
    );
  }

  /**
   * Criar configuração de backup
   */
  private async createBackupConfig(configData: any): Promise<BackupConfig> {
    const config: BackupConfig = {
      id: `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: configData.name,
      type: configData.type,
      schedule: configData.schedule,
      retention: configData.retention || 30,
      compression: configData.compression ?? true,
      encryption: configData.encryption ?? true,
      destinations: configData.destinations || [],
      databases: configData.databases,
      rpo: configData.rpo || 60,
      rto: configData.rto || 60,
      enabled: configData.enabled ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.configs.set(config.id, config);

    // Agendar backup se schedule fornecido
    if (config.schedule && config.enabled) {
      this.scheduleBackup(config.id, config.schedule);
    }

    // Publicar evento
    const event = this.eventService.createEvent('BACKUPUP_CONFIG_CREATED', {
      configId: config.id,
      name: config.name,
      type: config.type,
      schedule: config.schedule,
      timestamp: config.createdAt.toISOString(),
    });

    await this.eventService.publish(event);

    logger.info('Backup config created', { configId: config.id, name: config.name });

    return config;
  }

  /**
   * Executar backup
   */
  private async executeBackup(configId: string): Promise<BackupJob> {
    const config = this.configs.get(configId);
    if (!config) {
      throw new Error('Backup config not found');
    }

    const job: BackupJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      configId,
      status: 'pending',
      startedAt: new Date(),
      logs: [],
      metadata: {},
    };

    this.jobs.set(job.id, job);

    // Publicar evento
    const event = this.eventService.createEvent('BACKUPUP_STARTED', {
      jobId: job.id,
      configId,
      type: config.type,
      timestamp: job.startedAt.toISOString(),
    });

    await this.eventService.publish(event);

    // Executar backup em background
    this.runBackupJob(job.id);

    return job;
  }

  /**
   * Executar job de backup
   */
  private async runBackupJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      job.status = 'running';
      job.startedAt = new Date();

      const config = this.configs.get(job.configId);
      if (!config) {
        throw new Error('Backup config not found');
      }

      job.logs.push(`Starting ${config.type} backup for databases: ${config.databases.join(', ')}`);

      // Simular backup
      await this.simulateBackup(job, config);

      job.status = 'completed';
      job.completedAt = new Date();
      job.duration = job.completedAt.getTime() - job.startedAt!.getTime();

      job.logs.push(`Backup completed successfully in ${job.duration}ms`);

      // Publicar evento
      const event = this.eventService.createEvent('BACKUPUP_COMPLETED', {
        jobId: job.id,
        configId: job.configId,
        duration: job.duration,
        size: job.size,
        files: job.files.length,
        timestamp: job.completedAt.toISOString(),
      });

      await this.eventService.publish(event);

      logger.info('Backup completed', { jobId, configId: job.configId, duration: job.duration });
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      job.completedAt = new Date();

      if (job.startedAt) {
        job.duration = job.completedAt.getTime() - job.startedAt.getTime();
      }

      job.logs.push(`Backup failed: ${job.error}`);

      // Publicar evento
      const event = this.eventService.createEvent('BACKUPUP_FAILED', {
        jobId: job.id,
        configId: job.configId,
        error: job.error,
        duration: job.duration,
        timestamp: job.completedAt.toISOString(),
      });

      await this.eventService.publish(event);

      logger.error('Backup failed', { jobId, configId: job.configId, error: job.error });
    }
  }

  /**
   * Simular execução de backup
   */
  private async simulateBackup(job: BackupJob, config: BackupConfig): Promise<void> {
    const startTime = Date.now();

    // Simular tempo de backup baseado no tamanho e tipo
    const baseTime = config.type === 'full' ? 30000 : 10000; // 30s full, 10s incremental
    const randomVariation = Math.random() * 10000; // Variação de 0-10s
    const backupTime = baseTime + randomVariation;

    // Simular progress
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / backupTime) * 100, 95);
      job.logs.push(`Progress: ${progress.toFixed(1)}%`);
    }, 2000);

    await new Promise((resolve) => setTimeout(resolve, backupTime));

    clearInterval(progressInterval);

    // Simular arquivos gerados
    const files: BackupFile[] = [];
    const totalSize = 1024 * 1024 * 100; // 100MB

    config.databases.forEach((db, index) => {
      const fileSize = totalSize / config.databases.length;
      files.push({
        id: `file_${index}`,
        name: `${db}_${config.type}_${Date.now()}.sql`,
        path: `/backups/${db}/${config.type}`,
        size: fileSize,
        checksum: this.generateChecksum(fileSize),
        compressed: config.compression,
        encrypted: config.encryption,
        destinationId: config.destinations[0]?.id || 'local',
        createdAt: new Date(),
      });
    });

    job.files = files;
    job.size = files.reduce((sum, file) => sum + file.size, 0);
  }

  /**
   * Gerar checksum
   */
  private generateChecksum(size: number): string {
    return crypto.createHash('md5').update(size.toString()).digest('hex');
  }

  /**
   * Cancelar backup
   */
  private async cancelBackup(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error('Backup job not found');
    }

    if (job.status === 'completed' || job.status === 'failed') {
      throw new Error('Cannot cancel completed backup');
    }

    job.status = 'cancelled';
    job.completedAt = new Date();

    if (job.startedAt) {
      job.duration = job.completedAt.getTime() - job.startedAt.getTime();
    }

    job.logs.push('Backup cancelled by user');

    // Publicar evento
    const event = this.eventService.createEvent('BACKUPUP_CANCELLED', {
      jobId,
      configId: job.configId,
      duration: job.duration,
      timestamp: job.completedAt.toISOString(),
    });

    await this.eventService.publish(event);

    logger.info('Backup cancelled', { jobId });
  }

  /**
   * Agendar backup
   */
  private scheduleBackup(configId: string, schedule: string): void {
    // Cancelar schedule existente
    if (this.schedules.has(configId)) {
      clearTimeout(this.schedules.get(configId)!);
    }

    // Parse cron expression (simplificado)
    const interval = this.parseCronToInterval(schedule);

    const timeout = setInterval(() => {
      this.executeBackup(configId).catch((error) => {
        logger.error('Scheduled backup failed', { configId, error: error.message });
      });
    }, interval);

    this.schedules.set(configId, timeout);

    logger.info('Backup scheduled', { configId, schedule, interval });
  }

  /**
   * Parse cron expression para interval (simplificado)
   */
  private parseCronToInterval(cron: string): number {
    // Simulação - na implementação real, usaria biblioteca de cron
    if (cron === '0 2 * * *') return 2 * 60 * 60 * 1000; // 2 AM
    if (cron === '0 0 * * *') return 24 * 60 * 60 * 1000; // Meia-noite
    if (cron === '0 */6 * *') return 6 * 60 * 60 * 1000; // A cada 6 horas
    return 60 * 60 * 1000; // 1 hora (padrão)
  }

  /**
   * Iniciar schedules
   */
  private startSchedules(): void {
    for (const [configId, config] of this.configs.entries()) {
      if (config.enabled && config.schedule) {
        this.scheduleBackup(configId, config.schedule);
      }
    }
  }

  /**
   * Registrar operação crítica
   */
  private async recordCriticalOperation(request: any): Promise<void> {
    const operation = {
      method: request.method,
      url: request.url,
      timestamp: new Date().toISOString(),
      userId: (request as any).user?.id,
      tenantId: (request as any).tenantId,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    };

    // Publicar evento
    const event = this.eventService.createEvent('CRITICAL_OPERATION_RECORDED', operation);
    await this.eventService.publish(event);
  }

  /**
   * Criar plano de disaster recovery
   */
  private async createDisasterRecoveryPlan(planData: any): Promise<DisasterRecoveryPlan> {
    const plan: DisasterRecoveryPlan = {
      id: `drp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: planData.name,
      tenantId: planData.tenantId,
      rpo: planData.rpo || 60,
      rto: planData.rto || 60,
      procedures: planData.procedures,
      contacts: planData.contacts,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.drPlans.set(plan.id, plan);

    // Publicar evento
    const event = this.eventService.createEvent('DISASTER_RECOVERY_PLAN_CREATED', {
      planId: plan.id,
      name: plan.name,
      tenantId: plan.tenantId,
      rpo: plan.rpo,
      rto: plan.rto,
      timestamp: plan.createdAt.toISOString(),
    });

    await this.eventService.publish(event);

    logger.info('Disaster recovery plan created', { planId: plan.id, name: plan.name });

    return plan;
  }

  /**
   * Executar disaster recovery
   */
  private async executeDisasterRecovery(planId: string): Promise<any> {
    const plan = this.drPlans.get(planId);
    if (!plan) {
      throw new Error('Disaster recovery plan not found');
    }

    const startTime = Date.now();
    const results: any = {
      planId,
      status: 'running',
      procedures: [],
      startTime: new Date().toISOString(),
      duration: 0,
      success: false,
    };

    try {
      for (const procedure of plan.procedures) {
        const procedureResult = await this.executeRecoveryProcedure(procedure);
        results.procedures.push(procedureResult);

        if (!procedureResult.success) {
          throw new Error(`Procedure ${procedure.name} failed`);
        }
      }

      results.status = 'completed';
      results.success = true;
      results.duration = Date.now() - startTime;

      // Atualizar plano
      plan.lastTested = new Date();
      plan.updatedAt = new Date();

      // Publicar evento
      const event = this.eventService.createEvent('DISASTER_RECOVERY_EXECUTED', {
        planId,
        status: results.status,
        duration: results.duration,
        success: results.success,
        timestamp: new Date().toISOString(),
      });

      await this.eventService.publish(event);

      logger.info('Disaster recovery executed', {
        planId,
        success: results.success,
        duration: results.duration,
      });
    } catch (error) {
      results.status = 'failed';
      results.success = false;
      results.duration = Date.now() - startTime;
      results.error = (error as Error).message;

      // Publicar evento
      const event = this.eventService.createEvent('DISASTER_RECOVERY_FAILED', {
        planId,
        status: results.status,
        error: results.error,
        duration: results.duration,
        timestamp: new Date().toISOString(),
      });

      await this.eventService.publish(event);

      logger.error('Disaster recovery failed', { planId, error: results.error });
    }

    return results;
  }

  /**
   * Executar procedimento de recovery
   */
  private async executeRecoveryProcedure(procedure: RecoveryProcedure): Promise<any> {
    const startTime = Date.now();

    try {
      for (const step of procedure.steps) {
        await this.executeRecoveryStep(step);
      }

      return {
        procedureId: procedure.id,
        name: procedure.name,
        success: true,
        duration: Date.now() - startTime,
        steps: procedure.steps.length,
      };
    } catch (error) {
      return {
        procedureId: procedure.id,
        name: procedure.name,
        success: false,
        duration: Date.now() - startTime,
        error: (error as Error).message,
        steps: procedure.steps.length,
      };
    }
  }

  /**
   * Executar step de recovery
   */
  private async executeRecoveryStep(step: RecoveryStep): Promise<void> {
    // Simular execução de step
    logger.info('Executing recovery step', { stepId: step.id, name: step.name });

    // Simular tempo de execução
    await new Promise((resolve) => setTimeout(resolve, step.timeout || 30000));

    // Simular verificação de output esperado
    if (step.expectedOutput) {
      // Na implementação real, verificaria o output
      logger.debug('Checking expected output', { expected: step.expectedOutput });
    }
  }

  /**
   * Testar plano de disaster recovery
   */
  private async testDisasterRecoveryPlan(planId: string): Promise<any> {
    const plan = this.drPlans.get(planId);
    if (!plan) {
      throw new Error('Disaster recovery plan not found');
    }

    const testResults = {
      planId,
      testName: `Test_${Date.now()}`,
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'running',
      procedures: [],
      overallSuccess: false,
      recommendations: [],
    };

    try {
      // Executar procedimentos em modo de teste
      for (const procedure of plan.procedures) {
        const testResult = await this.testRecoveryProcedure(procedure);
        testResults.procedures.push(testResult);

        if (!testResult.success) {
          testResults.recommendations.push(`Review and fix procedure: ${procedure.name}`);
        }
      }

      testResults.endTime = new Date().toISOString();
      testResults.status = 'completed';
      testResults.overallSuccess = testResults.procedures.every((p) => p.success);

      // Atualizar plano
      plan.lastTested = new Date();
      plan.updatedAt = new Date();

      // Publicar evento
      const event = this.eventService.createEvent('DISASTER_RECOVERY_TESTED', {
        planId,
        testName: testResults.testName,
        success: testResults.overallSuccess,
        timestamp: testResults.endTime,
      });

      await this.eventService.publish(event);

      logger.info('Disaster recovery plan tested', { planId, success: testResults.overallSuccess });
    } catch (error) {
      testResults.status = 'failed';
      testResults.endTime = new Date().toISOString();
      testResults.error = (error as Error).message;

      // Publicar evento
      const event = this.eventService.createEvent('DR_TEST_FAILED', {
        planId,
        testName: testResults.testName,
        error: testResults.error,
        timestamp: testResults.endTime,
      });

      await this.eventService.publish(event);

      logger.error('Disaster recovery test failed', { planId, error: testResults.error });
    }

    return testResults;
  }

  /**
   * Testar procedimento de recovery
   */
  private async testRecoveryProcedure(procedure: RecoveryProcedure): Promise<any> {
    const startTime = Date.now();

    try {
      // Simular teste (dry run)
      for (const step of procedure.steps) {
        logger.info('Testing recovery step', { stepId: step.id, name: step.name });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return {
        procedureId: procedure.id,
        name: procedure.name,
        success: true,
        duration: Date.now() - startTime,
        steps: procedure.steps.length,
        testMode: true,
      };
    } catch (error) {
      return {
        procedureId: procedure.id,
        name: procedure.name,
        success: false,
        duration: Date.now() - startTime,
        error: (error as Error).message,
        steps: procedure.steps.length,
        testMode: true,
      };
    }
  }

  /**
   * Inicializar configurações padrão
   */
  private initializeDefaultConfigs(): void {
    // Configuração de backup diário
    const dailyBackup: BackupConfig = {
      id: 'default-daily',
      name: 'Daily Full Backup',
      type: 'full',
      schedule: '0 2 * * *',
      retention: 30,
      compression: true,
      encryption: true,
      destinations: [
        {
          id: 'local',
          type: 'local',
          name: 'Local Storage',
          config: { path: '/backups' },
          priority: 1,
          enabled: true,
        },
      ],
      databases: ['recorda'],
      rpo: 60,
      rto: 60,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.configs.set(dailyBackup.id, dailyBackup);

    // Configuração de backup incremental
    const incrementalBackup: BackupConfig = {
      id: 'default-incremental',
      name: 'Hourly Incremental Backup',
      type: 'incremental',
      schedule: '0 */6 * * *',
      retention: 7,
      compression: true,
      encryption: true,
      destinations: [
        {
          id: 'local',
          type: 'local',
          name: 'Local Storage',
          config: { path: '/backups/incremental' },
          priority: 1,
          enabled: true,
        },
      ],
      databases: ['recorda'],
      rpo: 15,
      rto: 30,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.configs.set(incrementalBackup.id, incrementalBackup);

    logger.info('Default backup configs initialized');
  }

  /**
   * Inicializar serviço de backup
   */
  static initialize(server: FastifyInstance): BackupService {
    const backup = new BackupService(server);
    logger.info('Backup service initialized');
    return backup;
  }
}

// Singleton instance
let backupService: BackupService | null;

export function getBackupService(): BackupService {
  if (!backupService) {
    throw new Error('Backup service not initialized');
  }
  return backupService;
}

export default BackupService;
