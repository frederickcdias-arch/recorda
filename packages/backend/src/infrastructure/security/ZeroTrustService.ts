/**
 * Zero Trust Security Service
 * Implementa arquitetura de confiança zero com validação contínua
 */

import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { logger } from '../logging/logger.js';
import { getEventService, EventTypes } from '../events/index.js';

export interface DeviceTrust {
  id: string;
  userId: string;
  deviceId: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'iot';
  trustScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  lastSeen: Date;
  ipAddress: string;
  userAgent: string;
  location: {
    country?: string;
    city?: string;
    timezone?: string;
  };
  securityPosture: {
    firewall: boolean;
    antivirus: boolean;
    encryption: boolean;
    screenLock: boolean;
    biometric: boolean;
    vpn: boolean;
  };
  behaviorMetrics: {
    failedLogins: number;
    unusualAccess: number;
    timeOfDayPatterns: number[];
    dataAccessPatterns: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface SecurityContext {
  userId: string;
  tenantId: string;
  sessionId: string;
  deviceId: string;
  trustLevel: 'untrusted' | 'low' | 'medium' | 'high' | 'trusted';
  permissions: string[];
  riskFactors: string[];
  lastValidation: Date;
  sessionDuration: number;
  ipAddress: string;
  userAgent: string;
  location: string;
}

export interface SecurityPolicy {
  id: string;
  name: string;
  tenantId: string;
  type: 'device' | 'network' | 'application' | 'data';
  rules: SecurityRule[];
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SecurityRule {
  id: string;
  name: string;
  condition: string;
  action: 'allow' | 'deny' | 'challenge' | 'monitor';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  parameters: Record<string, any>;
}

export interface ThreatDetection {
  id: string;
  type: 'malware' | 'phishing' | 'brute_force' | 'ddos' | 'data_breach' | 'unauthorized_access';
  severity: 'low' | 'medium' | 'export' | 'critical';
  description: string;
  source: string;
  target: string;
  timestamp: Date;
  metadata: Record<string, any>;
  resolved: boolean;
}

export class ZeroTrustService {
  private deviceTrusts: Map<string, DeviceTrust> = new Map();
  private securityContexts: Map<string, SecurityContext> = new Map();
  private securityPolicies: Map<string, SecurityPolicy[]> = new Map();
  private threatDetections: ThreatDetection[] = [];
  private riskThresholds = {
    deviceTrust: 30,
    sessionDuration: 8 * 60 * 60 * 1000, // 8 horas
    failedLogins: 3,
    unusualAccess: 5,
    dataAccessAnomaly: 10,
  };
  private eventService = getEventService();

  constructor(private server: FastifyInstance) {
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeDefaultPolicies();
    this.startThreatDetection();
  }

  /**
   * Configurar middleware Zero Trust
   */
  private setupMiddleware(): void {
    // Middleware para validação contínua
    this.server.addHook('preHandler', async (request, reply) => {
      const securityContext = await this.validateTrustContext(request);

      if (securityContext.trustLevel === 'untrusted') {
        // Solicitar autenticação adicional
        return reply.status(401).send({
          error: 'Additional authentication required',
          challenge: this.generateChallenge(securityContext),
        });
      }

      // Adicionar contexto de segurança ao request
      (request as any).securityContext = securityContext;

      // Verificar se a sessão expirou
      if (this.isSessionExpired(securityContext)) {
        return reply.status(401).send({ error: 'Session expired' });
      }

      // Verificar se o dispositivo ainda é confiável
      const deviceTrust = this.deviceTrusts.get(securityContext.deviceId);
      if (deviceTrust && deviceTrust.trustScore < this.riskThresholds.deviceTrust) {
        return reply.status(403).send({ error: 'Device trust score too low' });
      }
    });

    // Middleware para análise de comportamento
    this.server.addHook('onResponse', async (request, reply) => {
      const securityContext = (request as any).securityContext;
      if (securityContext) {
        await this.analyzeBehaviorPattern(securityContext, request, reply);
      }
    });

    // Middleware para detecção de ameaças
    this.server.addHook('onError', async (request, reply, error) => {
      await this.detectThreats(request, error);
    });
  }

  /**
   * Configurar rotas de segurança
   */
  private setupRoutes(): void {
    // Gerenciar desafio de autenticação
    this.server.post(
      '/security/challenge',
      {
        schema: {
          description: 'Gerar desafio de autenticação',
          tags: ['security'],
          body: {
            type: 'object',
            required: ['contextId', 'response'],
            properties: {
              contextId: { type: 'string' },
              response: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { contextId, response } = request.body as any;

        try {
          const result = await this.validateChallengeResponse(contextId, response);
          reply.send(result);
        } catch (error) {
          reply.status(400).send({ error: 'Invalid challenge response' });
        }
      }
    );

    // Obter contexto de segurança
    this.server.get(
      '/security/context/:sessionId',
      {
        schema: {
          description: 'Obter contexto de segurança',
          tags: ['security'],
          params: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { sessionId } = request.params as { sessionId: string };
        const context = this.securityContexts.get(sessionId);

        if (!context) {
          return reply.status(404).send({ error: 'Security context not found' });
        }

        reply.send(context);
      }
    );

    // Avaliar risco de dispositivo
    this.server.post(
      '/security/assess-device',
      {
        schema: {
          description: 'Avaliar risco de dispositivo',
          tags: ['security'],
          body: {
            type: 'object',
            required: ['deviceId', 'deviceType', 'ipAddress'],
            properties: {
              deviceId: { type: 'string' },
              deviceType: { type: 'string', enum: ['desktop', 'mobile', 'tablet', 'iot'] },
              ipAddress: { type: 'string' },
              userAgent: { type: 'string' },
              location: { type: 'object' },
            },
          },
        },
      },
      async (request, rev) => {
        const { deviceId, deviceType, ipAddress, userAgent, location } = request.body as any;

        try {
          const assessment = await this.assessDeviceRisk(
            deviceId,
            deviceType,
            ipAddress,
            userAgent,
            location
          );
          rev.send(assessment);
        } catch (error) {
          rev.status(500).send({ error: 'Failed to assess device risk' });
        }
      }
    );

    // Relatório de segurança
    this.server.get(
      '/security/report/:tenantId',
      {
        schema: {
          description: 'Obter relatório de segurança',
          tags: ['security'],
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
          const report = await this.generateSecurityReport(tenantId);
          reply.send(report);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to generate security report' });
        }
      }
    );

    // Gerenciar políticas de segurança
    this.server.post(
      '/admin/security/policies',
      {
        schema: {
          description: 'Criar política de segurança',
          tags: ['admin', 'security'],
          body: {
            type: 'object',
            required: ['name', 'tenantId', 'type', 'rules'],
            properties: {
              name: { type: 'string' },
              tenantId: { type: 'string' },
              type: { type: 'string', enum: ['device', 'network', 'application', 'data'] },
              rules: { type: 'array', items: { type: 'object' } },
              enabled: { type: 'boolean' },
              priority: { type: 'number' },
            },
          },
        },
      },
      async (request, reply) => {
        const policyData = request.body as any;

        try {
          const policy = await this.createSecurityPolicy(policyData);
          reply.status(201).send(policy);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create security policy' });
        }
      }
    );

    // Testar políticas de segurança
    this.server.post(
      '/admin/security/test-policy/:policyId',
      {
        schema: {
          description: 'Testar política de segurança',
          tags: ['admin', 'security'],
          params: {
            type: 'object',
            properties: {
              policyId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { policyId } = request.params as { policyId: string };

        try {
          const result = await this.testSecurityPolicy(policyId);
          reply.send(result);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to test security policy' });
        }
      }
    );

    // Gerenciar desafio de autenticação
    this.server.post(
      '/security/challenge',
      {
        schema: {
          description: 'Gerar desafio de autenticação',
          tags: ['security'],
          body: {
            type: 'object',
            required: ['contextId', 'response'],
            properties: {
              contextId: { type: 'string' },
              response: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { contextId, response } = request.body as any;

        try {
          const result = await this.validateChallengeResponse(contextId, response);
          reply.send(result);
        } catch (error) {
          reply.status(400).send({ error: 'Invalid challenge response' });
        }
      }
    );
  }

  /**
   * Validar contexto de confiança
   */
  private async validateTrustContext(request: any): Promise<SecurityContext> {
    const userId = (request.user as any)?.id;
    const tenantId = (request as any).tenantId;
    const sessionId = this.extractSessionId(request);
    const deviceId = this.extractDeviceId(request);
    const ipAddress = this.getClientIP(request);
    const userAgent = request.headers['user-agent'] || '';

    // Obter ou criar contexto
    let context = this.securityContexts.get(sessionId);

    if (!context) {
      context = await this.createSecurityContext(
        userId,
        tenantId,
        sessionId,
        deviceId,
        ipAddress,
        userAgent
      );
    }

    // Atualizar informações
    context.lastValidation = new Date();
    context.ipAddress = ipAddress;
    context.userAgent = userAgent;

    // Calcular nível de confiança
    context.trustLevel = await this.calculateTrustLevel(context);

    return context;
  }

  /**
   * Criar contexto de segurança
   */
  private async createSecurityContext(
    userId: string,
    tenantId: string,
    sessionId: string,
    deviceId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<SecurityContext> {
    const deviceTrust = this.deviceTrusts.get(deviceId);
    const trustLevel = deviceTrust
      ? this.calculateTrustLevel({ deviceId, userId, tenantId } as any)
      : 'untrusted';

    const context: SecurityContext = {
      userId,
      tenantId,
      sessionId,
      deviceId,
      trustLevel,
      permissions: await this.getUserPermissions(userId, tenantId),
      riskFactors: [],
      lastValidation: new Date(),
      sessionDuration: this.riskThresholds.sessionDuration,
      ipAddress,
      userAgent,
      location: this.getLocationFromIP(ipAddress),
    };

    this.securityContexts.set(sessionId, context);

    // Publicar evento
    const event = this.eventService.createEvent('SECURITY_CONTEXT_CREATED', {
      userId,
      tenantId,
      sessionId,
      deviceId,
      trustLevel,
      timestamp: context.lastValidation.toISOString(),
    });

    await this.eventService.publish(event);

    return context;
  }

  /**
   * Calcular nível de confiança
   */
  private async calculateTrustLevel(
    context: Partial<SecurityContext>
  ): Promise<'untrusted' | 'low' | 'medium' | 'high' | 'trusted'> {
    let trustScore = 0;

    // Verificar confiança do dispositivo
    const deviceTrust = this.deviceTrusts.get(context.deviceId!);
    if (deviceTrust) {
      trustScore += deviceTrust.trustScore;
    } else {
      trustScore += 20; // Padrão para dispositivos não conhecidos
    }

    // Verificar padrões de comportamento
    if (context.userId) {
      const behaviorScore = await this.calculateBehaviorScore(context.userId!);
      trustScore += behaviorScore;
    }

    // Verificar localização
    const locationScore = this.calculateLocationScore(context.location);
    trustScore += locationScore;

    // Verificar hora do dia
    const timeScore = this.calculateTimeScore();
    trustScore += timeScore;

    // Determinar nível de confiança
    if (trustScore >= 80) return 'trusted';
    if (trustScore >= 60) return 'high';
    if (trustScore >= 40) return 'medium';
    if (trustScore >= 20) return 'low';
    return 'untrusted';
  }

  /**
   * Calcular score de comportamento
   */
  private async calculateBehaviorScore(userId: string): Promise<number> {
    return 50; // Simulação
  }

  /**
   * Calcular score de localização
   */
  private calculateLocationScore(location: any): number {
    let score = 50; // Base score

    // Verificar se o país é conhecido e confiável
    const trustedCountries = ['BR', 'US', 'CA', 'GB', 'DE', 'FR'];
    if (location.country && trustedCountries.includes(location.country)) {
      score += 20;
    }

    // Verificar se o local é razoável
    if (location.city && location.city.length > 2) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Verificar se sessão expirou
   */
  private isSessionExpired(context: SecurityContext): boolean {
    const now = Date.now();
    const sessionAge = now - context.lastValidation.getTime();
    return sessionAge > context.sessionDuration;
  }

  /**
   * Gerar desafio de autenticação
   */
  private generateChallenge(context: SecurityContext): any {
    const challenges = ['password', 'totp', 'sms', 'email', 'push_notification'];

    const selectedChallenge = challenges[Math.floor(Math.random() * challenges.length)];

    return {
      challengeType: selectedChallenge,
      challengeId: `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      contextId: context.sessionId,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      metadata: {
        userId: context.userId,
        tenantId: context.tenantId,
        deviceId: context.deviceId,
      },
    };
  }

  /**
   * Validar resposta do desafio
   */
  private async validateChallengeResponse(contextId: string, response: string): Promise<any> {
    const context = this.securityContexts.get(contextId);
    if (!context) {
      throw new Error('Security context not found');
    }

    // Simulação - na implementação real, validaria a resposta do desafio
    const isValid = response.length > 0;

    if (isValid) {
      context.trustLevel = 'low';
      context.lastValidation = new Date();
    }

    return {
      valid: isValid,
      contextId,
      trustLevel: isValid ? 'low' : 'untrusted',
    };
  }

  /**
   * Analisar padrões de comportamento
   */
  private async analyzeBehaviorPattern(userId: string, request: any, reply: any): Promise<void> {
    const userId = context.userId;

    // Registrar acesso
    const accessPattern = {
      timestamp: new Date().toISOString(),
      endpoint: request.url,
      method: request.method,
      statusCode: reply.statusCode,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip || request.headers['x-forwarded-for'] || request.headers['x-real-ip'],
      metadata: {
        userId,
        tenantId: (request as any).tenantId,
      },
    };

    // Verificar se é acesso incomum
    const isUnusual = await this.isUnusualAccess(userId, accessPattern);

    if (isUnusual) {
      // Publicar evento
      const event = this.eventService.createEvent('UNUSUAL_ACCESS_DETECTED', {
        userId,
        accessPattern,
        timestamp: accessPattern.timestamp,
      });

      await this.eventService.publish(event);
    }

    // Atualizar métricas de comportamento
    const deviceTrust = this.deviceTrusts.get(context.deviceId);
    if (deviceTrust) {
      deviceTrust.behaviorMetrics.unusualAccess++;
      deviceTrust.updatedAt = new Date();
    }
  }

  /**
   * Verificar se acesso é incomum
   */
  private async isUnusualAccess(userId: string, accessPattern: any): Promise<boolean> {
    return false; // Simulação
  }

  /**
   * Obter permissões do usuário
   */
  private async getUserPermissions(userId: string, tenantId: string): Promise<string[]> {
    return ['read', 'write', 'delete', 'admin']; // Simulação
  }

  /**
   * Obter localização baseado no IP
   */
  private getLocationFromIP(ipAddress: string): any {
    // Simulação - na implementação real, usaria GeoIP ou similar
    return {
      country: 'BR',
      city: 'São Paulo',
      timezone: 'America/Sao_Paulo',
    };
  }

  /**
   * Gerar desafio de autenticação
   */
  private generateDeviceFingerprint(request: any): string {
    const fingerprint = [
      request.headers['user-agent'] || '',
      request.headers['accept'] || '',
      request.headers['accept-language'] || '',
      this.getClientIP(request) || request.headers['x-forwarded-for'] || '',
    ].join('|');

    return crypto.createHash('md5').update(fingerprint).digest('hex');
  }

  /**
   * Obter IP do cliente
   */
  private getClientIP(request: any): string {
    return (
      request.ip ||
      request.headers['x-forwarded-for'] ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      '127.0.0.1'
    );
  }

  /**
   * Inicializar políticas de segurança padrão
   */
  private initializeDefaultPolicies(): void {
    // Política de dispositivos
    const devicePolicy: SecurityPolicy = {
      id: 'default-device',
      name: 'Default Device Policy',
      tenantId: 'default',
      type: 'device',
      rules: [
        {
          id: 'device_encryption',
          name: 'Device Encryption Required',
          condition: 'device.securityPosture.encryption == false',
          action: 'deny',
          severity: 'high',
          enabled: true,
          parameters: {},
        },
        {
          id: 'device_firewall',
          name: 'Firewall Required',
          condition: 'device.securityPosture.firewall == false',
          action: 'deny',
          severity: 'high',
          enabled: true,
          parameters: {},
        },
        {
          id: 'untrusted_device',
          name: 'Untrusted Device',
          condition: 'trustScore < 30',
          action: 'deny',
          severity: 'medium',
          enabled: true,
          parameters: {},
        },
      ],
      enabled: true,
      priority: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.securityPolicies.set('default', [devicePolicy]);
    logger.info('Default security policies initialized');
  }

  /**
   * Gerar relatório de segurança
   */
  private async generateSecurityReport(tenantId: string): Promise<any> {
    const policies = this.securityPolicies.get(tenantId) || [];
    const deviceTrusts = Array.from(this.deviceTrusts.values()).filter(
      (trust) => trust.tenantId === tenantId
    );
    const threats = this.threatDetections.filter((threat) => threat.metadata.tenantId === tenantId);

    const report = {
      tenantId,
      reportDate: new Date().toISOString(),
      overview: {
        totalPolicies: policies.length,
        activePolicies: policies.filter((p) => p.enabled).length,
        totalDevices: deviceTrusts.length,
        totalThreats: threats.length,
        overallScore: this.calculateOverallSecurityScore(tenantId),
      },
      policies: policies.map((policy) => ({
        policyId: policy.id,
        name: policy.name,
        type: policy.type,
        enabled: policy.enabled,
        rules: policy.rules.length,
        priority: policy.priority,
        lastTested: null,
      })),
      devices: deviceTrusts.map((device) => ({
        deviceId: device.id,
        trustScore: device.trustScore,
        riskLevel: device.riskLevel,
        lastSeen: device.lastSeen,
        securityPosture: device.securityPosture,
        behaviorMetrics: device.behaviorMetrics,
      })),
      threats: threats.map((threat) => ({
        threatId: threat.id,
        type: threat.type,
        severity: threat.severity,
        description: threat.description,
        source: threat.source,
        target: threat.target,
        timestamp: threat.timestamp,
        resolved: threat.resolved,
      })),
      recommendations: this.generateSecurityRecommendations(policies, deviceTrusts, threats),
    };

    return report;
  }

  /**
   * Calcular score geral de segurança
   */
  private calculateOverallSecurityScore(tenantId: string): number {
    const policies = this.securityPolicies.get(tenantId) || [];
    const deviceTrusts = Array.from(this.deviceTrusts.values()).filter(
      (trust) => trust.tenantId === tenantId
    );
    const threats = this.threatDetections.filter((threat) => threat.metadata.tenantId === tenantId);

    let score = 100;

    // Penalizar políticas desabilitadas
    const disabledPolicies = policies.filter((p) => !p.enabled);
    score -= disabledPolicies.length * 10;

    // Penalizar dispositivos de baixa confiança
    const lowTrustDevices = deviceTrusts.filter((d) => d.trustScore < 30);
    score -= lowTrustDevices.length * 5;

    // Penalizar ameaças não resolvidas
    const unresolvedThreats = threats.filter((threat) => !threat.resolved);
    score -= unresolvedThreats.length * 15;

    return Math.max(0, score);
  }

  /**
   * Gerar recomendações de segurança
   */
  private generateSecurityRecommendations(
    policies: SecurityPolicy[],
    deviceTrusts: DeviceTrust[],
    threats: ThreatDetection[]
  ): string[] {
    const recommendations: string[] = [];

    // Recomendações de políticas
    const disabledPolicies = policies.filter((p) => !p.enabled);
    if (disabledPolicies.length > 0) {
      recommendations.push(
        `${disabledPolicies.length} políticas desabilitadas devem ser revisadas`
      );
    }

    // Recomendações de dispositivos
    const lowTrustDevices = deviceTrusts.filter((d) => d.trustScore < 30);
    if (lowTrustDevices.length > 0) {
      recommendations.push(
        `${lowTrustDevices.length} dispositivos de baixa confiança precisam de atenção`
      );
    }

    // Recomendações de ameaças
    const unresolvedThreats = threats.filter((threat) => !threat.resolved);
    if (unresolvedThreats.length > 0) {
      recommendations.push(
        `${unresolvedThreats.length} ameaças não resolvidas precisam ser investigadas`
      );
    }

    return recommendations;
  }

  /**
   * Inicializar serviço Zero Trust
   */
  static initialize(server: FastifyInstance): ZeroTrustService {
    const zeroTrust = new ZeroTrustService(server);
    logger.info('Zero Trust service initialized');
    return zeroTrust;
  }
}

// Singleton instance
let zeroTrustService: ZeroTrustService | null;

export function getZeroTrustService(): ZeroTrustService {
  if (!zeroTrustService) {
    throw new Error('Zero Trust service not initialized');
  }
  return zeroTrustService;
}

export default ZeroTrustService;
