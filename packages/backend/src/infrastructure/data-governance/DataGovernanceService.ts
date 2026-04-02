/**
 * Data Governance Service
 * Implementa governança de dados, qualidade e linhagem
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '../logging/logger.js';
import { getEventService, EventTypes } from '../events/index.js';

export interface DataQualityRule {
  id: string;
  name: string;
  table: string;
  column: string;
  type: 'format' | 'range' | 'uniqueness' | 'completeness' | 'consistency' | 'validity';
  condition: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  parameters: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataQualityIssue {
  id: string;
  ruleId: string;
  table: string;
  column: string;
  rowId: string;
  value: any;
  expectedValue?: any;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  metadata: Record<string, any>;
}

export interface DataLineage {
  id: string;
  source: string;
  sourceType: 'database' | 'file' | 'api' | 'manual' | 'etl';
  target: string;
  targetType: 'database' | 'file' | 'api' | 'manual' | 'etl';
  transformation: string;
  timestamp: Date;
  userId: string;
  tenantId: string;
  metadata: Record<string, any>;
}

export interface DataCatalog {
  id: string;
  name: string;
  description: string;
  category: string;
  table: string;
  columns: DataCatalogColumn[];
  tags: string[];
  owner: string;
  steward: string;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  retention: {
    period: number; // em dias
    policy: string;
    autoDelete: boolean;
  };
  access: {
    read: string[];
    write: string[];
    delete: string[];
  };
  lineage: string[];
  quality: {
    score: number;
    issues: number;
    lastAssessed: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface DataCatalogColumn {
  name: string;
  dataType: string;
  description: string;
  nullable: boolean;
  unique: boolean;
  defaultValue?: any;
  constraints: string[];
  tags: string[];
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  format: string;
  examples: any[];
}

export interface DataValidationResult {
  table: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  score: number;
  issues: DataQualityIssue[];
  timestamp: Date;
}

export class DataGovernanceService {
  private qualityRules: Map<string, DataQualityRule> = new Map();
  private qualityIssues: Map<string, DataQualityIssue[]> = new Map();
  private dataLineage: Map<string, DataLineage[]> = new Map();
  private dataCatalog: Map<string, DataCatalog> = new Map();
  private validationResults: Map<string, DataValidationResult> = new Map();
  private eventService = getEventService();

  constructor(private server: FastifyInstance) {
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeDefaultRules();
    this.startQualityMonitoring();
  }

  /**
   * Configurar middleware de governança de dados
   */
  private setupMiddleware(): void {
    // Middleware para validação de dados
    this.server.addHook('preValidation', async (request, reply) => {
      if (this.shouldValidateRequest(request)) {
        const validation = await this.validateRequestData(request);

        if (!validation.valid) {
          return reply.status(400).send({
            error: 'Data validation failed',
            issues: validation.issues,
          });
        }
      }
    });

    // Middleware para rastreamento de dados
    this.server.addHook('onResponse', async (request, reply) => {
      if (this.shouldTraceData(request)) {
        await this.traceDataAccess(request, reply);
      }
    });

    // Middleware para catalogação de dados
    this.server.addHook('onRequest', async (request, reply) => {
      if (this.shouldCatalogData(request)) {
        await this.catalogDataAccess(request);
      }
    });
  }

  /**
   * Configurar rotas de governança
   */
  private setupRoutes(): void {
    // Gerenciar regras de qualidade
    this.server.post(
      '/admin/data-governance/rules',
      {
        schema: {
          description: 'Criar regra de qualidade de dados',
          tags: ['admin', 'data-governance'],
          body: {
            type: 'object',
            required: ['name', 'table', 'column', 'type', 'condition'],
            properties: {
              name: { type: 'string' },
              table: { type: 'string' },
              column: { type: 'string' },
              type: {
                type: 'string',
                enum: ['format', 'range', 'uniqueness', 'completeness', 'consistency', 'validity'],
              },
              condition: { type: 'string' },
              severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              enabled: { type: 'boolean' },
              parameters: { type: 'object' },
            },
          },
        },
      },
      async (request, reply) => {
        const ruleData = request.body as any;

        try {
          const rule = await this.createQualityRule(ruleData);
          reply.status(201).send(rule);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create quality rule' });
        }
      }
    );

    // Listar regras de qualidade
    this.server.get(
      '/admin/data-governance/rules',
      {
        schema: {
          description: 'Listar regras de qualidade de dados',
          tags: ['admin', 'data-governance'],
        },
      },
      async (request, reply) => {
        const rules = Array.from(this.qualityRules.values());
        reply.send({ rules });
      }
    );

    // Validar dados de tabela
    this.server.post(
      '/admin/data-governance/validate/:table',
      {
        schema: {
          description: 'Validar dados de tabela',
          tags: ['admin', 'data-governance'],
          params: {
            type: 'object',
            properties: {
              table: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { table } = request.params as { table: string };

        try {
          const result = await this.validateTableData(table);
          reply.send(result);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to validate table data' });
        }
      }
    );

    // Obter catálogo de dados
    this.server.get(
      '/data-governance/catalog',
      {
        schema: {
          description: 'Obter catálogo de dados',
          tags: ['data-governance'],
        },
      },
      async (request, reply) => {
        const catalog = Array.from(this.dataCatalog.values());
        reply.send({ catalog });
      }
    );

    // Adicionar item ao catálogo
    this.server.post(
      '/admin/data-governance/catalog',
      {
        schema: {
          description: 'Adicionar item ao catálogo',
          tags: ['admin', 'data-governance'],
          body: {
            type: 'object',
            required: ['name', 'table', 'category', 'columns'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              category: { type: 'string' },
              table: { type: 'string' },
              columns: { type: 'array', items: { type: 'object' } },
              tags: { type: 'array', items: { type: 'string' } },
              owner: { type: 'string' },
              steward: { type: 'string' },
              sensitivity: {
                type: 'string',
                enum: ['public', 'internal', 'confidential', 'restricted'],
              },
              retention: { type: 'object' },
              access: { type: 'object' },
              lineage: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      async (request, reply) => {
        const catalogData = request.body as any;

        try {
          const catalog = await this.addToCatalog(catalogData);
          reply.status(201).send(catalog);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to add to catalog' });
        }
      }
    );

    // Rastrear linhagem de dados
    this.server.get(
      '/data-governance/lineage/:table',
      {
        schema: {
          description: 'Obter linhagem de dados',
          tags: ['data-governance'],
          params: {
            type: 'object',
            properties: {
              table: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { table } = request.params as { table: string };

        try {
          const lineage = await this.getDataLineage(table);
          reply.send({ table, lineage });
        } catch (error) {
          reply.status(500).send({ error: 'Failed to get data lineage' });
        }
      }
    );

    // Obter relatório de qualidade
    this.server.get(
      '/data-governance/quality-report/:tenantId',
      {
        schema: {
          description: 'Obter relatório de qualidade de dados',
          tags: ['data-governance'],
          params: {
            type: 'object',
            properties: {
              tenantId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { tenantId } = request.params as { tenantId: string };

        try {
          const report = await this.generateQualityReport(tenantId);
          reply.send(report);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to generate quality report' });
        }
      }
    );
  }

  /**
   * Verificar se requisição deve ser validada
   */
  private shouldValidateRequest(request: any): boolean {
    const validatableMethods = ['POST', 'PUT', 'PATCH'];
    const validatableRoutes = ['/usuarios', '/projetos', '/producao', '/relatorios'];

    return (
      validatableMethods.includes(request.method) &&
      validatableRoutes.some((route) => request.url.includes(route))
    );
  }

  /**
   * Validar dados da requisição
   */
  private async validateRequestData(request: any): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Validar body se existir
    if (request.body && typeof request.body === 'object') {
      const bodyValidation = await this.validateObject(request.body);
      issues.push(...bodyValidation);
    }

    // Validar query params se existir
    if (request.query && typeof request.query === 'object') {
      const queryValidation = await this.validateObject(request.query);
      issues.push(...queryValidation);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Validar objeto
   */
  private async validateObject(obj: any): Promise<string[]> {
    const issues: string[] = [];

    // Aplicar regras de qualidade
    for (const [ruleId, rule] of this.qualityRules.entries()) {
      if (!rule.enabled) continue;

      const validation = this.applyQualityRule(obj, rule);
      if (!validation.valid) {
        issues.push(validation.message);
      }
    }

    return issues;
  }

  /**
   * Aplicar regra de qualidade
   */
  private applyQualityRule(obj: any, rule: DataQualityRule): { valid: boolean; message: string } {
    const value = this.extractValue(obj, rule.column);

    if (value === undefined || value === null) {
      return {
        valid: false,
        message: `Column ${rule.table}.${rule.column} is null or undefined`,
      };
    }

    switch (rule.type) {
      case 'format':
        return this.validateFormat(value, rule);
      case 'range':
        return this.validateRange(value, rule);
      case 'uniqueness':
        return this.validateUniqueness(value, rule);
      case 'completeness':
        return this.validateCompleteness(value, rule);
      case 'consistency':
        return this.validateConsistency(value, rule);
      case 'validity':
        return this.validateValidity(value, rule);
      default:
        return { valid: true, message: '' };
    }
  }

  /**
   * Validar formato
   */
  private validateFormat(value: any, rule: DataQualityRule): { valid: boolean; message: string } {
    const format = rule.parameters.format || 'string';

    switch (format) {
      case 'email': {
        const emailRegex = /^[^\s*[^@\s]+@[^@\s]+\.[^@\s]+\s*$/;
        return {
          valid: emailRegex.test(value),
          message: emailRegex.test(value) ? '' : `Invalid email format for ${rule.column}`,
        };
      }
      case 'date': {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        return {
          valid: dateRegex.test(value),
          message: dateRegex.test(value)
            ? ''
            : `Invalid date format for ${rule.column} (expected YYYY-MM-DD)`,
        };
      }
      case 'cpf': {
        const cpfRegex = /^\d{11}$/;
        return {
          valid: cpfRegex.test(value),
          message: cpfRegex.test(value)
            ? ''
            : `Invalid CPF format for ${rule.column} (expected 11 digits)`,
        };
      }
      case 'phone': {
        const phoneRegex = /^\d{10,11}$/;
        return {
          valid: phoneRegex.test(value),
          message: phoneRegex.test(value)
            ? ''
            : `Invalid phone format for ${rule.column} (expected 10-11 digits)`,
        };
      }
      default:
        return { valid: true, message: '' };
    }
  }

  /**
   * Validar range
   */
  private validateRange(value: any, rule: DataQualityRule): { valid: boolean; message: string } {
    const min = rule.parameters.min;
    const max = rule.parameters.max;
    const numValue = Number(value);

    if (isNaN(numValue)) {
      return {
        valid: false,
        message: `Invalid numeric value for ${rule.column}`,
      };
    }

    if (min !== undefined && numValue < min) {
      return {
        valid: false,
        message: `Value ${numValue} is below minimum ${min} for ${rule.column}`,
      };
    }

    if (max !== undefined && numValue > max) {
      return {
        valid: false,
        message: `Value ${numValue} is above maximum ${max} for ${rule.column}`,
      };
    }

    return { valid: true, message: '' };
  }

  /**
   * Validar unicidade
   */
  private validateUniqueness(
    value: any,
    rule: DataQualityRule
  ): { valid: boolean; message: string } {
    // Simulação - na implementação real, verificaria no banco de dados
    return { valid: true, message: '' };
  }

  /**
   * Validar completude
   */
  private validateCompleteness(
    value: any,
    rule: DataQualityRule
  ): { valid: boolean; message: string } {
    if (rule.parameters.required && (value === undefined || value === null || value === '')) {
      return {
        valid: false,
        message: `Required field ${rule.column} is empty`,
      };
    }

    if (rule.parameters.minLength && value.toString().length < rule.parameters.minLength) {
      return {
        valid: false,
        message: `Field ${rule.column} is too short (min ${rule.parameters.minLength})`,
      };
    }

    return { valid: true, message: '' };
  }

  /**
   * Validar consistência
   */
  private validateConsistency(
    value: any,
    rule: DataQualityRule
  ): { valid: boolean; message: string } {
    // Simulação - na implementação real, verificaria referências e relacionamentos
    return { valid: true, message: '' };
  }

  /**
   * Validar validade
   */
  private validateValidity(value: any, rule: DataQualityRule): { valid: boolean; message: string } {
    const pattern = rule.parameters.pattern;

    if (pattern && typeof pattern === 'string') {
      const regex = new RegExp(pattern);
      return {
        valid: regex.test(value.toString()),
        message: regex.test(value.toString())
          ? ''
          : `Value doesn't match pattern for ${rule.column}`,
      };
    }

    return { valid: true, message: '' };
  }

  /**
   * Extrair valor do objeto
   */
  private extractValue(obj: any, columnPath: string): any {
    const parts = columnPath.split('.');
    let value = obj;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Verificar se deve rastrear dados
   */
  private shouldTraceData(request: any): boolean {
    const traceableMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    const traceableRoutes = ['/usuarios', '/projetos', '/producao', '/relatorios'];

    return (
      traceableMethods.includes(request.method) &&
      traceableRoutes.some((route) => request.url.includes(route))
    );
  }

  /**
   * Rastrear acesso a dados
   */
  private async traceDataAccess(request: any, reply: any): Promise<void> {
    const trace: DataLineage = {
      id: `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source: 'api',
      sourceType: 'api',
      target: request.url,
      targetType: 'api',
      transformation: request.method,
      timestamp: new Date(),
      userId: (request.user as any)?.id || 'anonymous',
      tenantId: (request as any).tenantId || 'default',
      metadata: {
        method: request.method,
        headers: request.headers,
        query: request.query,
        statusCode: reply.statusCode,
        userAgent: request.headers['user-agent'],
      },
    };

    // Armazenar rastreamento
    const table = this.extractTableFromRequest(request);
    if (table) {
      if (!this.dataLineage.has(table)) {
        this.dataLineage.set(table, []);
      }
      this.dataLineage.get(table)!.push(trace);
    }

    // Publicar evento
    const event = this.eventService.createEvent('DATA_ACCESS_TRACED', {
      traceId: trace.id,
      source: trace.source,
      target: trace.target,
      userId: trace.userId,
      tenantId: trace.tenantId,
      timestamp: trace.timestamp.toISOString(),
    });

    await this.eventService.publish(event);
  }

  /**
   * Verificar se deve catalogar dados
   */
  private shouldCatalogData(request: any): boolean {
    const catalogableMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    const catalogableRoutes = ['/usuarios', '/projetos', '/producao', '/relatorios'];

    return (
      catalogableMethods.includes(request.method) &&
      catalogableRoutes.some((route) => request.url.includes(route))
    );
  }

  /**
   * Catalogar acesso a dados
   */
  private async catalogDataAccess(request: any): Promise<void> {
    const table = this.extractTableFromRequest(request);

    if (!table) return;

    // Verificar se já existe no catálogo
    if (!this.dataCatalog.has(table)) {
      const catalog = await this.createCatalogEntry(table);
      this.dataCatalog.set(table, catalog);
    }

    // Atualizar estatísticas de acesso
    const catalog = this.dataCatalog.get(table)!;
    catalog.quality.lastAssessed = new Date();
    catalog.updatedAt = new Date();

    // Publicar evento
    const event = this.eventService.createEvent('DATA_ACCESSED', {
      table,
      userId: (request.user as any)?.id || 'anonymous',
      tenantId: (request as any).tenantId || 'default',
      timestamp: new Date().toISOString(),
    });

    await this.eventService.publish(event);
  }

  /**
   * Extrair nome da tabela da requisição
   */
  private extractTableFromRequest(request: any): string | null {
    // Simulação - na implementação real, analisaria a URL e parâmetros
    const url = request.url;

    if (url.includes('/usuarios')) return 'usuarios';
    if (url.includes('/projetos')) return 'projetos';
    if (url.includes('/producao')) return 'producao_repositorio';
    if (url.includes('/relatorios')) return 'relatorios';

    return null;
  }

  /**
   * Criar entrada no catálogo
   */
  private async createCatalogEntry(table: string): Promise<DataCatalog> {
    const catalog: DataCatalog = {
      id: `catalog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: this.generateTableName(table),
      description: `Dados da tabela ${table}`,
      category: 'operational',
      table,
      columns: await this.getTableColumns(table),
      tags: ['operational', 'business'],
      owner: 'system',
      steward: 'data_steward',
      sensitivity: 'internal',
      retention: {
        period: 2555, // 7 anos
        policy: 'business_retention',
        autoDelete: false,
      },
      access: {
        read: ['admin', 'analyst'],
        write: ['admin', 'analyst'],
        delete: ['admin'],
      },
      lineage: ['api_access'],
      quality: {
        score: 0,
        issues: 0,
        lastAssessed: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return catalog;
  }

  /**
   * Gerar nome legível para tabela
   */
  private generateTableName(table: string): string {
    return table
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Obter colunas da tabela
   */
  private async getTableColumns(table: string): Promise<DataCatalogColumn[]> {
    // Simulação - na implementação real, buscaria do banco de dados
    const commonColumns: DataCatalogColumn[] = [
      {
        name: 'id',
        dataType: 'uuid',
        description: 'Primary key',
        nullable: false,
        unique: true,
        defaultValue: null,
        constraints: ['PRIMARY KEY'],
        tags: ['identifier'],
        sensitivity: 'internal',
        format: 'uuid',
        examples: [],
      },
      {
        name: 'created_at',
        dataType: 'timestamp',
        description: 'Creation timestamp',
        nullable: false,
        unique: false,
        defaultValue: 'now()',
        constraints: ['NOT NULL'],
        tags: ['timestamp', 'audit'],
        sensitivity: 'internal',
        format: 'timestamp',
        examples: [],
      },
      {
        name: 'updated_at',
        dataType: 'timestamp',
        description: 'Last update timestamp',
        nullable: false,
        unique: false,
        defaultValue: 'now()',
        constraints: ['NOT NULL'],
        tags: ['timestamp', 'audit'],
        sensitivity: 'internal',
        format: 'timestamp',
        examples: [],
      },
    ];

    // Adicionar colunas específicas da tabela
    const specificColumns = await this.getSpecificTableColumns(table);

    return [...commonColumns, ...specificColumns];
  }

  /**
   * Obter colunas específicas da tabela
   */
  private async getSpecificTableColumns(table: string): Promise<DataCatalogColumn[]> {
    // Simulação - na implementação real, buscaria do banco de dados
    switch (table) {
      case 'usuarios':
        return [
          {
            name: 'nome',
            dataType: 'varchar',
            description: 'Nome completo do usuário',
            nullable: false,
            unique: false,
            constraints: ['NOT NULL'],
            tags: ['personal', 'name'],
            sensitivity: 'confidential',
            format: 'string',
            examples: ['João Silva'],
          },
          {
            name: 'email',
            dataType: 'varchar',
            description: 'Email do usuário',
            nullable: false,
            unique: true,
            constraints: ['NOT NULL', 'UNIQUE'],
            tags: ['contact', 'email'],
            sensitivity: 'confidential',
            format: 'email',
            examples: ['joao.silva@example.com'],
          },
          {
            name: 'cpf',
            dataType: 'varchar',
            description: 'CPF do usuário',
            nullable: true,
            unique: true,
            constraints: ['UNIQUE'],
            tags: ['personal', 'identifier'],
            sensitivity: 'restricted',
            format: 'cpf',
            examples: ['123.456.789-09'],
          },
        ];
      case 'projetos':
        return [
          {
            name: 'nome',
            dataType: 'varchar',
            description: 'Nome do projeto',
            nullable: false,
            unique: false,
            constraints: ['NOT NULL'],
            tags: ['name'],
            sensitivity: 'internal',
            format: 'string',
            examples: ['Projeto Alpha'],
          },
          {
            name: 'descricao',
            dataType: 'text',
            description: 'Descrição do projeto',
            nullable: true,
            unique: false,
            constraints: [],
            tags: ['description'],
            sensitivity: 'internal',
            format: 'text',
            examples: ['Descrição do projeto Alpha'],
          },
          {
            name: 'status',
            dataType: 'varchar',
            description: 'Status do projeto',
            nullable: false,
            unique: false,
            constraints: ['NOT NULL'],
            tags: ['status'],
            sensitivity: 'internal',
            format: 'enum',
            examples: ['ativo', 'inativo'],
          },
        ];
      default:
        return [];
    }
  }

  /**
   * Criar regra de qualidade
   */
  private async createQualityRule(ruleData: any): Promise<DataQualityRule> {
    const rule: DataQualityRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: ruleData.name,
      table: ruleData.table,
      column: ruleData.column,
      type: ruleData.type,
      condition: ruleData.condition,
      severity: ruleData.severity,
      enabled: ruleData.enabled ?? true,
      parameters: ruleData.parameters || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.qualityRules.set(rule.id, rule);

    // Publicar evento
    const event = this.eventService.createEvent('QUALITY_RULE_CREATED', {
      ruleId: rule.id,
      name: rule.name,
      table: rule.table,
      column: rule.column,
      type: rule.type,
      severity: rule.severity,
      enabled: rule.enabled,
      timestamp: rule.createdAt.toISOString(),
    });

    await this.eventService.publish(event);

    logger.info('Quality rule created', {
      ruleId: rule.id,
      name: rule.name,
      table: rule.table,
      column: rule.column,
      type: rule.type,
    });

    return rule;
  }

  /**
   * Validar dados da tabela
   */
  private async validateTableData(table: string): Promise<DataValidationResult> {
    const startTime = Date.now();

    // Simulação - na implementação real, buscaria e validaria dados reais
    const mockData = await this.generateMockData(table);
    const issues: DataQualityIssue[] = [];

    // Aplicar regras de qualidade
    for (const [ruleId, rule] of this.qualityRules.entries()) {
      if (rule.table !== table || !rule.enabled) continue;

      for (const [rowId, row] of mockData.entries()) {
        const validation = this.applyQualityRule(row, rule);
        if (!validation.valid) {
          const issue: DataQualityIssue = {
            id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ruleId,
            table: rule.table,
            column: rule.column,
            rowId,
            value: this.extractValue(row, rule.column),
            description: validation.message,
            severity: rule.severity,
            status: 'open',
            createdAt: new Date(),
            metadata: {
              ruleName: rule.name,
              ruleType: rule.type,
            },
          };

          issues.push(issue);
        }
      }
    }

    const result: DataValidationResult = {
      table,
      totalRows: mockData.size,
      validRows: mockData.size - issues.length,
      invalidRows: issues.length,
      score: mockData.size > 0 ? ((mockData.size - issues.length) / mockData.size) * 100 : 100,
      issues,
      timestamp: new Date(),
    };

    // Armazenar resultado
    this.validationResults.set(table, result);

    // Publicar evento
    const event = this.eventService.createEvent('DATA_VALIDATION_COMPLETED', {
      table,
      totalRows: result.totalRows,
      validRows: result.validRows,
      invalidRows: result.invalidRows,
      score: result.score,
      issues: result.issues.length,
      timestamp: result.timestamp.toISOString(),
    });

    await this.eventService.publish(event);

    logger.info('Table data validated', {
      table,
      score: result.score,
      issues: result.issues.length,
    });

    return result;
  }

  /**
   * Gerar dados mock para validação
   */
  private async generateMockData(table: string): Promise<Map<string, any>> {
    const mockData = new Map<string, any>();

    // Simular dados para diferentes tabelas
    switch (table) {
      case 'usuarios':
        for (let i = 0; i < 100; i++) {
          mockData.set(`user_${i}`, {
            id: `user_${i}`,
            nome: `Usuário ${i}`,
            email: `user${i}@example.com`,
            cpf: i % 2 === 0 ? null : `${i.toString().padStart(11, '0')}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        break;
      case 'projetos':
        for (let i = 0; i < 50; i++) {
          mockData.set(`proj_${i}`, {
            id: `proj_${i}`,
            nome: `Projeto ${i}`,
            descricao: `Descrição do projeto ${i}`,
            status: i % 3 === 0 ? 'ativo' : 'inativo',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        break;
      case 'producao_repositorio':
        for (let i = 0; i < 200; i++) {
          mockData.set(`prod_${i}`, {
            id: `prod_${i}`,
            usuario_id: `user_${i % 10}`,
            repositorio_id: `repo_${i % 5}`,
            quantidade: Math.floor(Math.random() * 1000),
            etapa: ['recebimento', 'producao', 'finalizado'][i % 3],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        break;
      default:
        // Dados genéricos
        for (let i = 0; i < 50; i++) {
          mockData.set(`row_${i}`, {
            id: `row_${i}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
    }

    return mockData;
  }

  /**
   * Obter linhagem de dados
   */
  private async getDataLineage(table: string): Promise<DataLineage[]> {
    return this.dataLineage.get(table) || [];
  }

  /**
   * Gerar relatório de qualidade
   */
  private async generateQualityReport(tenantId: string): Promise<any> {
    const catalogs = Array.from(this.dataCatalog.values()).filter(
      (catalog) => catalog.tenantId === tenantId || 'default'
    );
    const validationResults = Array.from(this.validationResults.values());
    const issues = Array.from(this.qualityIssues.values()).flat();

    const report = {
      tenantId,
      reportDate: new Date().toISOString(),
      overview: {
        totalTables: catalogs.length,
        totalRules: this.qualityRules.size,
        totalIssues: issues.length,
        overallScore: this.calculateOverallQualityScore(tenantId),
        lastAssessment: new Date().toISOString(),
      },
      catalogs: catalogs.map((catalog) => ({
        catalogId: catalog.id,
        name: catalog.name,
        table: catalog.table,
        category: catalog.category,
        owner: catalog.owner,
        steward: catalog.steward,
        sensitivity: catalog.sensitivity,
        quality: catalog.quality,
        columns: catalog.columns.length,
        tags: catalog.tags,
        retention: catalog.retention,
        access: catalog.access,
      })),
      validationResults: validationResults.map((result) => ({
        table: result.table,
        score: result.score,
        totalRows: result.totalRows,
        validRows: result.validRows,
        invalidRows: result.invalidRows,
        issues: result.issues.length,
        timestamp: result.timestamp,
      })),
      issues: issues.map((issue) => ({
        issueId: issue.id,
        ruleId: issue.ruleId,
        table: issue.table,
        column: issue.column,
        rowId: issue.rowId,
        severity: issue.severity,
        status: issue.status,
        description: issue.description,
        createdAt: issue.createdAt,
        resolvedAt: issue.resolvedAt,
        resolvedBy: issue.resolvedBy,
      })),
      recommendations: this.generateQualityRecommendations(catalogs, validationResults, issues),
    };

    return report;
  }

  /**
   * Calcular score geral de qualidade
   */
  private calculateOverallQualityScore(tenantId: string): number {
    const catalogs = Array.from(this.dataCatalog.values()).filter(
      (catalog) => catalog.tenantId === tenantId || 'default'
    );
    const validationResults = Array.from(this.validationResults.values());

    if (catalogs.length === 0) return 100;

    let totalScore = 0;
    let weightSum = 0;

    // Calcular score médio baseado nos catálogos
    for (const catalog of catalogs) {
      const weight = 1; // Peso igual para todos os catálogos
      totalScore += catalog.quality.score * weight;
      weightSum += weight;
    }

    const catalogScore = weightSum > 0 ? totalScore / weightSum : 0;

    // Calcular score médio baseado nas validações
    let validationScore = 0;
    let validationWeight = 0;

    for (const result of validationResults) {
      const weight = 1; // Peso igual para todas as validações
      validationScore += result.score * weight;
      validationWeight += weight;
    }

    const validationScoreAvg = validationWeight > 0 ? validationScore / validationWeight : 0;

    // Combinar scores (70% catálogo + 30% validação)
    const overallScore = catalogScore * 0.7 + validationScoreAvg * 0.3;

    return Math.round(overallScore);
  }

  /**
   * Gerar recomendações de qualidade
   */
  private generateQualityRecommendations(
    catalogs: DataCatalog[],
    validationResults: DataValidationResult[],
    issues: DataQualityIssue[]
  ): string[] {
    const recommendations: string[] = [];

    // Recomendações baseadas nos catálogos
    const lowScoreCatalogs = catalogs.filter((c) => c.quality.score < 70);
    if (lowScoreCatalogs.length > 0) {
      recommendations.push(
        `${lowScoreCatalogs.length} catálogos com score baixo precisam de atenção`
      );
    }

    // Recomendações baseadas nas validações
    const lowScoreValidations = validationResults.filter((r) => r.score < 70);
    if (lowScoreValidations.length > 0) {
      recommendations.push(
        `${lowScoreValidations.length} validações com score baixo precisam de atenção`
      );
    }

    // Recomendações baseadas nos problemas
    const criticalIssues = issues.filter((issue) => issue.severity === 'critical');
    if (criticalIssues.length > 0) {
      recommendations.push(
        `${criticalIssues.length} problemas críticos precisam de resolução imediata`
      );
    }

    return recommendations;
  }

  /**
   * Inicializar regras padrão
   */
  private initializeDefaultRules(): void {
    // Regras para usuários
    const userRules: DataQualityRule[] = [
      {
        id: 'user_email_format',
        name: 'Email Format Validation',
        table: 'usuarios',
        column: 'email',
        type: 'format',
        condition: 'value matches email pattern',
        severity: 'high',
        enabled: true,
        parameters: { format: 'email' },
      },
      {
        id: 'user_cpf_format',
        name: 'CPF Format Validation',
        table: 'usuarios',
        column: 'cpf',
        type: 'format',
        condition: 'value matches CPF pattern',
        severity: 'critical',
        enabled: true,
        parameters: { format: 'cpf' },
      },
      {
        id: 'user_nome_required',
        name: 'Name Required',
        table: 'usuarios',
        column: 'nome',
        type: 'completeness',
        condition: 'value is not null and value is not empty',
        severity: 'high',
        enabled: true,
        parameters: { required: true },
      },
      {
        id: 'user_estado_range',
        name: 'Estado Range Validation',
        table: 'usuarios',
        column: 'estado',
        type: 'range',
        condition: 'value in valid states',
        severity: 'medium',
        enabled: true,
        parameters: {
          valid: [
            'AC',
            'AL',
            'AP',
            'AM',
            'BA',
            'CE',
            'DF',
            'ES',
            'GO',
            'MA',
            'MG',
            'MS',
            'MT',
            'PA',
            'PB',
            'PE',
            'PI',
            'PR',
            'RJ',
            'RN',
            'RS',
            'RO',
            'RR',
            'SC',
            'SP',
            'SE',
            'TO',
          ],
        },
      },
    ];

    // Regras para projetos
    const projectRules: DataQualityRule[] = [
      {
        id: 'projeto_nome_required',
        name: 'Project Name Required',
        table: 'projetos',
        column: 'nome',
        type: 'completeness',
        condition: 'value is not null and value is not empty',
        severity: 'high',
        enabled: true,
        parameters: { required: true },
      },
      {
        id: 'projeto_status_valid',
        name: 'Project Status Validation',
        table: 'projetos',
        column: 'status',
        type: 'validity',
        condition: 'value in valid statuses',
        severity: 'medium',
        enabled: true,
        parameters: { valid: ['ativo', 'inativo'] },
      },
    ];

    // Regras para produção
    const productionRules: DataQualityRule[] = [
      {
        id: 'producao_quantidade_range',
        name: 'Production Quantity Range',
        table: 'producao_repositorio',
        column: 'quantidade',
        type: 'range',
        condition: 'value is between 0 and 10000',
        severity: 'medium',
        enabled: true,
        parameters: { min: 0, max: 10000 },
      },
      {
        id: 'producao_etapa_valid',
        name: 'Production Stage Validation',
        table: 'producao_repositorio',
        column: 'etapa',
        type: 'validity',
        condition: 'value in valid stages',
        severity: 'medium',
        enabled: true,
        parameters: { valid: ['recebimento', 'produção', 'finalizado'] },
      },
      {
        id: 'producao_usuario_required',
        name: 'Production User Required',
        table: 'producao_repositorio',
        column: 'usuario_id',
        type: 'completeness',
        condition: 'value is not null',
        severity: 'high',
        enabled: true,
        parameters: { required: true },
      },
    ];

    // Adicionar regras ao mapa
    userRules.forEach((rule) => this.qualityRules.set(rule.id, rule));
    projectRules.forEach((rule) => this.qualityRules.set(rule.id, rule));
    productionRules.forEach((rule) => this.qualityRules.set(rule.id, rule));

    logger.info('Default quality rules initialized', {
      userRules: userRules.length,
      projectRules: projectRules.length,
      productionRules: productionRules.length,
    });
  }

  /**
   * Iniciar monitoramento de qualidade
   */
  private startQualityMonitoring(): void {
    // Executar validação periódica
    setInterval(async () => {
      for (const table of ['usuarios', 'projetos', 'producao_repositorio']) {
        try {
          await this.validateTableData(table);
        } catch (error) {
          logger.error('Quality monitoring failed', { table, error: (error as Error).message });
        }
      }
    }, 300000); // A cada 5 minutos
  }

  /**
   * Inicializar serviço de governança de dados
   */
  static initialize(server: FastifyInstance): DataGovernanceService {
    const dataGovernance = new DataGovernanceService(server);
    logger.info('Data Governance service initialized');
    return dataGovernance;
  }
}

// Singleton instance
let dataGovernanceService: DataGovernanceService | null;

export function getDataGovernanceService(): DataGovernanceService {
  if (!dataGovernanceService) {
    throw new Error('Data Governance service not initialized');
  }
  return dataGovernanceService;
}

export default DataGovernanceService;
