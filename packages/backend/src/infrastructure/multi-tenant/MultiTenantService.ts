/**
 * Multi-Tenant Service
 * Implementa isolamento de dados por tenant/organização
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '../logging/logger.js';

export interface Tenant {
  id: string;
  name: string;
  domain: string;
  settings: TenantSettings;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
  plan: 'free' | 'basic' | 'premium' | 'enterprise';
  limits: TenantLimits;
}

export interface TenantSettings {
  timezone: string;
  locale: string;
  currency: string;
  dateFormat: string;
  features: string[];
  customizations: Record<string, any>;
}

export interface TenantLimits {
  users: number;
  projects: number;
  storage: number; // em bytes
  apiCalls: number; // por mês
  reports: number; // por mês
  customFields: number;
}

export interface TenantContext {
  tenantId: string;
  tenant: Tenant;
  userId: string;
  userRole: string;
  permissions: string[];
}

export class MultiTenantService {
  private tenants: Map<string, Tenant> = new Map();
  private tenantContexts: Map<string, TenantContext> = new Map();
  private defaultLimits: TenantLimits = {
    users: 10,
    projects: 5,
    storage: 1024 * 1024 * 100, // 100MB
    apiCalls: 10000,
    reports: 100,
    customFields: 10,
  };

  constructor(private server: FastifyInstance) {
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeDefaultTenant();
  }

  /**
   * Configurar middleware para multi-tenancy
   */
  private setupMiddleware(): void {
    // Middleware para extrair tenant do request
    this.server.addHook('preHandler', async (request, reply) => {
      // Obter tenant ID do header, subdomínio, ou token JWT
      const tenantId = this.extractTenantId(request);

      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant ID required' });
      }

      const tenant = this.tenants.get(tenantId);
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }

      if (tenant.status !== 'active') {
        return reply.status(403).send({ error: 'Tenant is not active' });
      }

      // Adicionar tenant ao request context
      (request as any).tenantId = tenantId;
      (request as any).tenant = tenant;

      // Adicionar contexto de tenant se usuário estiver autenticado
      if ((request as any).user) {
        const context = await this.getTenantContext(tenantId, (request as any).user.id);
        (request as any).tenantContext = context;
      }
    });

    // Middleware para isolar queries por tenant
    this.server.addHook('preValidation', async (request, reply) => {
      const tenantId = (request as any).tenantId;

      // Modificar queries para incluir tenant_id
      if (request.body && typeof request.body === 'object') {
        request.body = {
          ...request.body,
          tenant_id: tenantId,
        };
      }

      // Modificar query params para incluir tenant_id
      if (request.query && typeof request.query === 'object') {
        request.query = {
          ...request.query,
          tenant_id: tenantId,
        };
      }
    });
  }

  /**
   * Configurar rotas de gerenciamento de tenants
   */
  private setupRoutes(): void {
    // Criar novo tenant
    this.server.post(
      '/admin/tenants',
      {
        schema: {
          description: 'Criar novo tenant',
          tags: ['admin', 'tenants'],
          body: {
            type: 'object',
            required: ['name', 'domain', 'plan'],
            properties: {
              name: { type: 'string' },
              domain: { type: 'string' },
              plan: { type: 'string', enum: ['free', 'basic', 'premium', 'enterprise'] },
              settings: { type: 'object' },
            },
          },
        },
      },
      async (request, reply) => {
        const { name, domain, plan, settings } = request.body as any;

        try {
          const tenant = await this.createTenant(name, domain, plan, settings);
          reply.status(201).send(tenant);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create tenant' });
        }
      }
    );

    // Listar todos os tenants
    this.server.get(
      '/admin/tenants',
      {
        schema: {
          description: 'Listar todos os tenants',
          tags: ['admin', 'tenants'],
        },
      },
      async (request, reply) => {
        const tenants = Array.from(this.tenants.values());
        reply.send({ tenants });
      }
    );

    // Obter tenant específico
    this.server.get(
      '/admin/tenants/:tenantId',
      {
        schema: {
          description: 'Obter tenant específico',
          tags: ['admin', 'tenants'],
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
        const tenant = this.tenants.get(tenantId);

        if (!tenant) {
          return reply.status(404).send({ error: 'Tenant not found' });
        }

        reply.send(tenant);
      }
    );

    // Atualizar tenant
    this.server.put(
      '/admin/tenants/:tenantId',
      {
        schema: {
          description: 'Atualizar tenant',
          tags: ['admin', 'tenants'],
          params: {
            type: 'object',
            properties: {
              tenantId: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              settings: { type: 'object' },
              status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
              plan: { type: 'string', enum: ['free', 'basic', 'premium', 'enterprise'] },
            },
          },
        },
      },
      async (request, reply) => {
        const { tenantId } = request.params as { tenantId: string };
        const updates = request.body as any;

        try {
          const tenant = await this.updateTenant(tenantId, updates);
          reply.send(tenant);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to update tenant' });
        }
      }
    );

    // Deletar tenant
    this.server.delete(
      '/admin/tenants/:tenantId',
      {
        schema: {
          description: 'Deletar tenant',
          tags: ['admin', 'tenants'],
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
          await this.deleteTenant(tenantId);
          reply.send({ message: 'Tenant deleted successfully' });
        } catch (error) {
          reply.status(500).send({ error: 'Failed to delete tenant' });
        }
      }
    );

    // Obter estatísticas do tenant
    this.server.get(
      '/tenants/:tenantId/stats',
      {
        schema: {
          description: 'Obter estatísticas do tenant',
          tags: ['tenants'],
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
          const stats = await this.getTenantStats(tenantId);
          reply.send(stats);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to get tenant stats' });
        }
      }
    );
  }

  /**
   * Extrair tenant ID do request
   */
  private extractTenantId(request: any): string | null {
    // 1. Verificar header X-Tenant-ID
    if (request.headers['x-tenant-id']) {
      return request.headers['x-tenant-id'] as string;
    }

    // 2. Verificar subdomínio
    const host = request.headers.host;
    if (host) {
      const subdomain = host.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        return subdomain;
      }
    }

    // 3. Verificar token JWT
    if (request.user && request.user.tenantId) {
      return request.user.tenantId;
    }

    // 4. Verificar query parameter
    if (request.query.tenant_id) {
      return request.query.tenant_id as string;
    }

    return null;
  }

  /**
   * Criar novo tenant
   */
  private async createTenant(
    name: string,
    domain: string,
    plan: string,
    settings?: Partial<TenantSettings>
  ): Promise<Tenant> {
    const tenantId = `tenant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const tenant: Tenant = {
      id: tenantId,
      name,
      domain,
      settings: {
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
        dateFormat: 'DD/MM/YYYY',
        features: ['basic'],
        customizations: {},
        ...settings,
      },
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: plan as any,
      limits: this.getLimitsForPlan(plan as any),
    };

    this.tenants.set(tenantId, tenant);

    // Criar schema do tenant no banco de dados
    await this.createTenantSchema(tenantId);

    logger.info('Tenant created', { tenantId, name, domain, plan });

    return tenant;
  }

  /**
   * Atualizar tenant
   */
  private async updateTenant(tenantId: string, updates: Partial<Tenant>): Promise<Tenant> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const updatedTenant: Tenant = {
      ...tenant,
      ...updates,
      updatedAt: new Date(),
    };

    // Atualizar limits se o plano mudou
    if (updates.plan && updates.plan !== tenant.plan) {
      updatedTenant.limits = this.getLimitsForPlan(updates.plan);
    }

    this.tenants.set(tenantId, updatedTenant);

    logger.info('Tenant updated', { tenantId, updates });

    return updatedTenant;
  }

  /**
   * Deletar tenant
   */
  private async deleteTenant(tenantId: string): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Remover tenant do mapa
    this.tenants.delete(tenantId);

    // Remover contextos do tenant
    const contextsToDelete = Array.from(this.tenantContexts.keys()).filter((key) =>
      key.startsWith(`${tenantId}_`)
    );
    contextsToDelete.forEach((key) => this.tenantContexts.delete(key));

    // Deletar schema do tenant no banco de dados
    await this.deleteTenantSchema(tenantId);

    logger.info('Tenant deleted', { tenantId, name: tenant.name });
  }

  /**
   * Obter contexto do tenant
   */
  private async getTenantContext(tenantId: string, userId: string): Promise<TenantContext> {
    const contextKey = `${tenantId}_${userId}`;
    let context = this.tenantContexts.get(contextKey);

    if (!context) {
      const tenant = this.tenants.get(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Obter informações do usuário no contexto do tenant
      const user = await this.getUserInTenant(tenantId, userId);

      context = {
        tenantId,
        tenant,
        userId,
        userRole: user.role,
        permissions: user.permissions,
      };

      this.tenantContexts.set(contextKey, context);
    }

    return context;
  }

  /**
   * Obter usuário no contexto do tenant
   */
  private async getUserInTenant(tenantId: string, userId: string): Promise<any> {
    // Simulação - na implementação real, buscaria do banco de dados
    return {
      id: userId,
      role: 'admin',
      permissions: ['read', 'write', 'delete'],
    };
  }

  /**
   * Obter limites para plano específico
   */
  private getLimitsForPlan(plan: Tenant['plan']): TenantLimits {
    const baseLimits = { ...this.defaultLimits };

    switch (plan) {
      case 'free':
        return {
          ...baseLimits,
          users: 5,
          projects: 2,
          storage: 1024 * 1024 * 50, // 50MB
          apiCalls: 1000,
          reports: 10,
          customFields: 5,
        };

      case 'basic':
        return {
          ...baseLimits,
          users: 25,
          projects: 10,
          storage: 1024 * 1024 * 500, // 500MB
          apiCalls: 10000,
          reports: 100,
          customFields: 20,
        };

      case 'premium':
        return {
          ...baseLimits,
          users: 100,
          projects: 50,
          storage: 1024 * 1024 * 2048, // 2GB
          apiCalls: 100000,
          reports: 1000,
          customFields: 50,
        };

      case 'enterprise':
        return {
          ...baseLimits,
          users: -1, // ilimitado
          projects: -1,
          storage: 1024 * 1024 * 10240, // 10GB
          apiCalls: -1,
          reports: -1,
          customFields: -1,
        };

      default:
        return baseLimits;
    }
  }

  /**
   * Criar schema do tenant no banco de dados
   */
  private async createTenantSchema(tenantId: string): Promise<void> {
    // Simulação - na implementação real, criaria schema separado
    logger.debug('Creating tenant schema', { tenantId });
  }

  /**
   * Deletar schema do tenant no banco de dados
   */
  private async deleteTenantSchema(tenantId: string): Promise<void> {
    // Simulação - na implementação real, deletaria schema separado
    logger.debug('Deleting tenant schema', { tenantId });
  }

  /**
   * Obter estatísticas do tenant
   */
  private async getTenantStats(tenantId: string): Promise<any> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Simulação - na implementação real, buscaria do banco de dados
    return {
      tenantId,
      name: tenant.name,
      plan: tenant.plan,
      users: {
        current: 15,
        limit: tenant.limits.users,
        percentage: tenant.limits.users === -1 ? 0 : (15 / tenant.limits.users) * 100,
      },
      projects: {
        current: 8,
        limit: tenant.limits.projects,
        percentage: tenant.limits.projects === -1 ? 0 : (8 / tenant.limits.projects) * 100,
      },
      storage: {
        current: 1024 * 1024 * 200, // 200MB
        limit: tenant.limits.storage,
        percentage: ((1024 * 1024 * 200) / tenant.limits.storage) * 100,
      },
      apiCalls: {
        current: 5000,
        limit: tenant.limits.apiCalls,
        percentage: tenant.limits.apiCalls === -1 ? 0 : (5000 / tenant.limits.apiCalls) * 100,
      },
      reports: {
        current: 45,
        limit: tenant.limits.reports,
        percentage: tenant.limits.reports === -1 ? 0 : (45 / tenant.limits.reports) * 100,
      },
    };
  }

  /**
   * Verificar se usuário tem permissão no tenant
   */
  async hasPermission(tenantId: string, userId: string, permission: string): Promise<boolean> {
    try {
      const context = await this.getTenantContext(tenantId, userId);
      return context.permissions.includes(permission);
    } catch (error) {
      return false;
    }
  }

  /**
   * Verificar se tenant atingiu limites
   */
  async checkLimits(
    tenantId: string,
    resource: keyof TenantLimits,
    currentValue: number
  ): Promise<boolean> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return false;
    }

    const limit = tenant.limits[resource];
    return limit === -1 || currentValue < limit;
  }

  /**
   * Obter tenant atual do request
   */
  getCurrentTenant(request: any): Tenant | null {
    return request.tenant || null;
  }

  /**
   * Obter contexto do tenant atual
   */
  getCurrentTenantContext(request: any): TenantContext | null {
    return request.tenantContext || null;
  }

  /**
   * Inicializar tenant padrão
   */
  private initializeDefaultTenant(): void {
    const defaultTenant: Tenant = {
      id: 'default',
      name: 'Default Organization',
      domain: 'recorda',
      settings: {
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
        dateFormat: 'DD/MM/YYYY',
        features: ['basic', 'reports', 'export'],
        customizations: {},
      },
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: 'premium',
      limits: this.getLimitsForPlan('premium'),
    };

    this.tenants.set('default', defaultTenant);
    logger.info('Default tenant initialized');
  }

  /**
   * Inicializar serviço multi-tenant
   */
  static initialize(server: FastifyInstance): MultiTenantService {
    const multiTenant = new MultiTenantService(server);
    logger.info('Multi-tenant service initialized');
    return multiTenant;
  }
}

// Singleton instance
let multiTenantService: MultiTenantService | null;

export function getMultiTenantService(): MultiTenantService {
  return multiTenantService!;
}

export default MultiTenantService;
