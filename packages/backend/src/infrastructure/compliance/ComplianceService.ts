/**
 * Compliance Service - Implementação de LGPD, PCI, SOX
 * Garante conformidade com regulamentações de proteção de dados
 */

import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { logger } from '../logging/logger.js';
import { getEventService, EventTypes } from '../events/index.js';

export interface ConsentRecord {
  id: string;
  userId: string;
  tenantId: string;
  consentType: 'data_processing' | 'marketing' | 'analytics' | 'cookies';
  granted: boolean;
  grantedAt: Date;
  revokedAt?: Date;
  ipAddress: string;
  userAgent: string;
  documentHash: string;
  version: string;
}

export interface DataSubject {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  cpf?: string;
  rg?: string;
  birthDate?: Date;
  tenantId: string;
  consentRecords: ConsentRecord[];
  dataCategories: string[];
  retentionPeriod: number; // em dias
  lastAccessed: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataProcessingRecord {
  id: string;
  tenantId: string;
  purpose: string;
  legalBasis:
    | 'consent'
    | 'contract'
    | 'legal_obligation'
    | 'vital_interests'
    | 'public_task'
    | 'legitimate_interests';
  dataCategories: string[];
  retentionPeriod: number;
  processingActivities: string[];
  thirdParties: string[];
  securityMeasures: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplianceAudit {
  id: string;
  tenantId: string;
  type: 'lgpd' | 'pci' | 'sox';
  status: 'compliant' | 'non_compliant' | 'partial';
  findings: ComplianceFinding[];
  recommendations: string[];
  auditDate: Date;
  nextAuditDate: Date;
  score: number; // 0-100
}

export interface ComplianceFinding {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: string[];
  remediationRequired: boolean;
  remediationDeadline?: Date;
  status: 'open' | 'in_progress' | 'resolved';
}

export class ComplianceService {
  private dataSubjects: Map<string, DataSubject> = new Map();
  private consentRecords: Map<string, ConsentRecord[]> = new Map();
  private processingRecords: Map<string, DataProcessingRecord> = new Map();
  private audits: Map<string, ComplianceAudit[]> = new Map();
  private encryptionKeys: Map<string, string> = new Map();
  private eventService = getEventService();

  constructor(private server: FastifyInstance) {
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeDefaultCompliance();
  }

  /**
   * Configurar middleware de compliance
   */
  private setupMiddleware(): void {
    // Middleware para criptografia de dados sensíveis
    this.server.addHook('preHandler', async (request, reply) => {
      // Verificar se a requisição envia dados sensíveis
      const sensitiveData = this.containsSensitiveData(request);

      if (sensitiveData) {
        // Criptografar dados sensíveis
        request.body = await this.encryptSensitiveData(request.body);

        // Registrar processamento de dados
        await this.recordDataProcessing(request, 'data_access');
      }
    });

    // Middleware para logging de compliance
    this.server.addHook('onResponse', async (request, reply) => {
      // Registrar acesso a dados para auditoria
      if (request.user && request.tenantId) {
        await this.logDataAccess(request, reply.statusCode);
      }
    });

    // Middleware para anonimização de logs
    this.server.addHook('onRequest', async (request, reply) => {
      // Anonimizar IP e dados sensíveis nos logs
      const anonymizedRequest = this.anonymizeRequest(request);
      (request as any).anonymized = anonymizedRequest;
    });
  }

  /**
   * Configurar rotas de compliance
   */
  private setupRoutes(): void {
    // Gerenciar consentimentos
    this.server.post(
      '/compliance/consent',
      {
        schema: {
          description: 'Registrar consentimento do usuário',
          tags: ['compliance'],
          body: {
            type: 'object',
            required: ['userId', 'consentType', 'granted'],
            properties: {
              userId: { type: 'string' },
              consentType: {
                type: 'string',
                enum: ['data_processing', 'marketing', 'analytics', 'cookies'],
              },
              granted: { type: 'boolean' },
              documentHash: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { userId, consentType, granted, documentHash } = request.body as any;
        const tenantId = (request as any).tenantId;

        try {
          const consent = await this.recordConsent(
            userId,
            tenantId,
            consentType,
            granted,
            documentHash
          );
          reply.status(201).send(consent);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to record consent' });
        }
      }
    );

    // Obter consentimentos do usuário
    this.server.get(
      '/compliance/consent/:userId',
      {
        schema: {
          description: 'Obter consentimentos do usuário',
          tags: ['compliance'],
          params: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { userId } = request.params as { userId: string };
        const tenantId = (request as any).tenantId;

        try {
          const consents = await this.getUserConsents(userId, tenantId);
          reply.send(consents);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to get user consents' });
        }
      }
    );

    // Direito ao esquecimento (LGPD)
    this.server.delete(
      '/compliance/forget/:userId',
      {
        schema: {
          description: 'Esquecer dados do usuário (Right to be forgotten)',
          tags: ['compliance'],
          params: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { userId } = request.params as { userId: string };
        const tenantId = (request as any).tenantId;

        try {
          await this.forgetUserData(userId, tenantId);
          reply.send({ message: 'User data forgotten successfully' });
        } catch (error) {
          reply.status(500).send({ error: 'Failed to forget user data' });
        }
      }
    );

    // Portabilidade de dados (LGPD)
    this.server.get(
      '/compliance/portability/:userId',
      {
        schema: {
          description: 'Exportar dados do usuário para portabilidade',
          tags: ['compliance'],
          params: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { userId } = request.params as { userId: string };
        const tenantId = (request as any).tenantId;

        try {
          const userData = await this.exportUserData(userId, tenantId);
          reply.type('application/json').send(userData);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to export user data' });
        }
      }
    );

    // Auditoria de compliance
    this.server.post(
      '/compliance/audit',
      {
        schema: {
          description: 'Executar auditoria de compliance',
          tags: ['compliance', 'admin'],
          body: {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['lgpd', 'pci', 'sox'] },
              tenantId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { type, tenantId } = request.body as any;

        try {
          const audit = await this.runComplianceAudit(type, tenantId);
          reply.status(201).send(audit);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to run compliance audit' });
        }
      }
    );

    // Obter relatório de compliance
    this.server.get(
      '/compliance/report/:tenantId',
      {
        schema: {
          description: 'Obter relatório de compliance',
          tags: ['compliance'],
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
          const report = await this.generateComplianceReport(tenantId);
          reply.send(report);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to generate compliance report' });
        }
      }
    );

    // Gerenciar chaves de criptografia
    this.server.post(
      '/compliance/encryption-keys',
      {
        schema: {
          description: 'Gerar nova chave de criptografia',
          tags: ['compliance', 'admin'],
          body: {
            type: 'object',
            properties: {
              tenantId: { type: 'string' },
              keyType: { type: 'string', enum: ['aes', 'rsa'] },
            },
          },
        },
      },
      async (request, reply) => {
        const { tenantId, keyType } = request.body as any;

        try {
          const keyData = await this.generateEncryptionKey(tenantId, keyType);
          reply.send(keyData);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to generate encryption key' });
        }
      }
    );
  }

  /**
   * Verificar se requisição contém dados sensíveis
   */
  private containsSensitiveData(request: any): boolean {
    const sensitiveFields = ['cpf', 'rg', 'phone', 'address', 'birthDate', 'creditCard'];

    const checkObject = (obj: any): boolean => {
      if (!obj || typeof obj !== 'object') return false;

      return Object.keys(obj).some((key) =>
        sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))
      );
    };

    return checkObject(request.body) || checkObject(request.query);
  }

  /**
   * Criptografar dados sensíveis
   */
  private async encryptSensitiveData(data: any): Promise<any> {
    // Simulação - na implementação real, usaria criptografia real
    const encrypted = { ...data };

    // Marcar dados como criptografados
    if (encrypted.cpf) {
      encrypted.cpf = this.hashData(encrypted.cpf);
    }
    if (encrypted.rg) {
      encrypted.rg = this.hashData(encrypted.rg);
    }
    if (encrypted.phone) {
      encrypted.phone = this.hashData(encrypted.phone);
    }

    return encrypted;
  }

  /**
   * Hash de dados para anonimização
   */
  private hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Anonimizar request para logs
   */
  private anonymizeRequest(request: any): any {
    const anonymized = { ...request };

    // Anonimizar IP
    if (anonymized.ip) {
      anonymized.ip = this.anonymizeIP(anonymized.ip);
    }

    // Anonimizar user agent
    if (anonymized.userAgent) {
      anonymized.userAgent = this.anonymizeUserAgent(anonymized.userAgent);
    }

    return anonymized;
  }

  /**
   * Anonimizar IP address
   */
  private anonymizeIP(ip: string): string {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.***.***`;
  }

  /**
   * Anonimizar user agent
   */
  private anonymizeUserAgent(userAgent: string): string {
    return userAgent.substring(0, 20) + '...';
  }

  /**
   * Registrar processamento de dados
   */
  private async recordDataProcessing(request: any, purpose: string): Promise<void> {
    const tenantId = (request as any).tenantId;
    const userId = (request as any).user?.id;

    const event = this.eventService.createEvent('DATA_PROCESSING_RECORDED', {
      tenantId,
      userId,
      purpose,
      endpoint: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    });

    await this.eventService.publish(event);
  }

  /**
   * Log de acesso a dados
   */
  private async logDataAccess(request: any, statusCode: number): Promise<void> {
    const tenantId = (request as any).tenantId;
    const userId = (request as any).user?.id;
    const sensitive = this.containsSensitiveData(request);

    const event = this.eventService.createEvent('DATA_ACCESS_LOGGED', {
      tenantId,
      userId,
      endpoint: request.url,
      method: request.method,
      statusCode,
      sensitive,
      timestamp: new Date().toISOString(),
    });

    await this.eventService.publish(event);
  }

  /**
   * Registrar consentimento
   */
  private async recordConsent(
    userId: string,
    tenantId: string,
    consentType: ConsentRecord['consentType'],
    granted: boolean,
    documentHash: string
  ): Promise<ConsentRecord> {
    const consent: ConsentRecord = {
      id: `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      tenantId,
      consentType,
      granted,
      grantedAt: new Date(),
      ipAddress: '127.0.0.1', // Obter do request real
      userAgent: 'Mozilla/5.0...', // Obter do request real
      documentHash,
      version: '1.0',
    };

    // Armazenar consentimento
    if (!this.consentRecords.has(userId)) {
      this.consentRecords.set(userId, []);
    }
    this.consentRecords.get(userId)!.push(consent);

    // Publicar evento
    const event = this.eventService.createEvent('CONSENT_RECORDED', {
      tenantId,
      userId,
      consentType,
      granted,
      timestamp: consent.grantedAt.toISOString(),
    });

    await this.eventService.publish(event);

    logger.info('Consent recorded', { userId, tenantId, consentType, granted });

    return consent;
  }

  /**
   * Obter consentimentos do usuário
   */
  private async getUserConsents(userId: string, tenantId: string): Promise<ConsentRecord[]> {
    const userConsents = this.consentRecords.get(userId) || [];
    return userConsents.filter((consent) => consent.tenantId === tenantId);
  }

  /**
   * Esquecer dados do usuário (Right to be forgotten)
   */
  private async forgetUserData(userId: string, tenantId: string): Promise<void> {
    // Remover dados do usuário
    this.dataSubjects.delete(`${tenantId}_${userId}`);

    // Remover consentimentos
    const userConsents = this.consentRecords.get(userId) || [];
    const remainingConsents = userConsents.filter((consent) => consent.tenantId !== tenantId);

    if (remainingConsents.length === 0) {
      this.consentRecords.delete(userId);
    } else {
      this.consentRecords.set(userId, remainingConsents);
    }

    // Publicar evento
    const event = this.eventService.createEvent('DATA_FORGOTTEN', {
      tenantId,
      userId,
      timestamp: new Date().toISOString(),
    });

    await this.eventService.publish(event);

    logger.info('User data forgotten', { userId, tenantId });
  }

  /**
   * Exportar dados do usuário para portabilidade
   */
  private async exportUserData(userId: string, tenantId: string): Promise<any> {
    const dataSubject = this.dataSubjects.get(`${tenantId}_${userId}`);

    if (!dataSubject) {
      throw new Error('User data not found');
    }

    const exportData = {
      personalData: {
        name: dataSubject.name,
        email: dataSubject.email,
        phone: dataSubject.phone,
        address: dataSubject.address,
        birthDate: dataSubject.birthDate,
      },
      consentRecords: await this.getUserConsents(userId, tenantId),
      processingRecords: Array.from(this.processingRecords.values()).filter(
        (record) => record.tenantId === tenantId
      ),
      exportDate: new Date().toISOString(),
      format: 'JSON',
      version: '1.0',
    };

    // Publicar evento
    const event = this.eventService.createEvent('DATA_EXPORTED', {
      tenantId,
      userId,
      format: 'JSON',
      timestamp: new Date().toISOString(),
    });

    await this.eventService.publish(event);

    logger.info('User data exported', { userId, tenantId });

    return exportData;
  }

  /**
   * Executar auditoria de compliance
   */
  private async runComplianceAudit(
    type: ComplianceAudit['type'],
    tenantId: string
  ): Promise<ComplianceAudit> {
    const findings: ComplianceFinding[] = [];
    let score = 100;

    switch (type) {
      case 'lgpd':
        findings.push(...(await this.auditLGPD(tenantId)));
        break;
      case 'pci':
        findings.push(...(await this.auditPCI(tenantId)));
        break;
      case 'sox':
        findings.push(...(await this.auditSOX(tenantId)));
        break;
    }

    // Calcular score baseado nos findings
    score = this.calculateComplianceScore(findings);

    const audit: ComplianceAudit = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      type,
      status: score >= 80 ? 'compliant' : score >= 60 ? 'partial' : 'non_compliant',
      findings,
      recommendations: this.generateRecommendations(findings),
      auditDate: new Date(),
      nextAuditDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 dias
      score,
    };

    // Armazenar auditoria
    if (!this.audits.has(tenantId)) {
      this.audits.set(tenantId, []);
    }
    this.audits.get(tenantId)!.push(audit);

    // Publicar evento
    const event = this.eventService.createEvent('COMPLIANCE_AUDIT_COMPLETED', {
      tenantId,
      type,
      score,
      status: audit.status,
      findingsCount: findings.length,
      timestamp: audit.auditDate.toISOString(),
    });

    await this.eventService.publish(event);

    logger.info('Compliance audit completed', { tenantId, type, score });

    return audit;
  }

  /**
   * Auditoria LGPD
   */
  private async auditLGPD(tenantId: string): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // Verificar consentimentos
    const consents = Array.from(this.consentRecords.values())
      .flat()
      .filter((consent) => consent.tenantId === tenantId);

    if (consents.length === 0) {
      findings.push({
        category: 'Consent Management',
        severity: 'critical',
        description: 'No user consents recorded',
        evidence: ['consent_records_empty'],
        remediationRequired: true,
        remediationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'open',
      });
    }

    // Verificar política de retenção
    const dataSubjects = Array.from(this.dataSubjects.values()).filter(
      (subject) => subject.tenantId === tenantId
    );

    const expiredSubjects = dataSubjects.filter((subject) => {
      const retentionDays = subject.retentionPeriod;
      const daysSinceCreation = (Date.now() - subject.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceCreation > retentionDays;
    });

    if (expiredSubjects.length > 0) {
      findings.push({
        category: 'Data Retention',
        severity: 'high',
        description: `${expiredSubjects.length} subjects exceed retention period`,
        evidence: ['expired_data_subjects'],
        remediationRequired: true,
        remediationDeadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: 'open',
      });
    }

    return findings;
  }

  /**
   * Auditoria PCI DSS
   */
  private async auditPCI(tenantId: string): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // Verificar criptografia
    if (this.encryptionKeys.size === 0) {
      findings.push({
        category: 'Encryption',
        severity: 'critical',
        description: 'No encryption keys configured',
        evidence: ['encryption_keys_empty'],
        remediationRequired: true,
        remediationDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'open',
      });
    }

    // Verificar armazenamento de dados de cartão
    // (Simulação - na implementação real, verificaria se há dados de cartão armazenados)

    return findings;
  }

  /**
   * Auditoria SOX
   */
  private async auditSOX(tenantId: string): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // Verificar logs de auditoria
    // (Simulação - na implementação real, verificaria se há logs adequados)

    // Verificar controles internos
    // (Simulação - na implementação real, verificaria controles internos)

    return findings;
  }

  /**
   * Calcular score de compliance
   */
  private calculateComplianceScore(findings: ComplianceFinding[]): number {
    let score = 100;

    findings.forEach((finding) => {
      switch (finding.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    });

    return Math.max(0, score);
  }

  /**
   * Gerar recomendações
   */
  private generateRecommendations(findings: ComplianceFinding[]): string[] {
    const recommendations: string[] = [];

    const categories = [...new Set(findings.map((f) => f.category))];

    if (categories.includes('Consent Management')) {
      recommendations.push('Implement a robust consent management system');
      recommendations.push('Ensure all data processing activities have proper consent');
    }

    if (categories.includes('Data Retention')) {
      recommendations.push('Implement automated data retention policies');
      recommendations.push('Regularly review and purge expired data');
    }

    if (categories.includes('Encryption')) {
      recommendations.push('Implement end-to-end encryption for sensitive data');
      recommendations.push('Regularly rotate encryption keys');
    }

    return recommendations;
  }

  /**
   * Gerar relatório de compliance
   */
  private async generateComplianceReport(tenantId: string): Promise<any> {
    const audits = this.audits.get(tenantId) || [];
    const latestAudits = {
      lgpd: audits.find((a) => a.type === 'lgpd'),
      pci: audits.find((a) => a.type === 'pci'),
      sox: audits.find((a) => a.type === 'sox'),
    };

    const dataSubjects = Array.from(this.dataSubjects.values()).filter(
      (subject) => subject.tenantId === tenantId
    );

    const consents = Array.from(this.consentRecords.values())
      .flat()
      .filter((consent) => consent.tenantId === tenantId);

    return {
      tenantId,
      reportDate: new Date().toISOString(),
      overview: {
        totalDataSubjects: dataSubjects.length,
        totalConsents: consents.length,
        activeAudits: audits.length,
        overallScore: this.calculateOverallScore(latestAudits),
      },
      audits: latestAudits,
      dataSubjects: dataSubjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        email: subject.email,
        dataCategories: subject.dataCategories,
        retentionPeriod: subject.retentionPeriod,
        lastAccessed: subject.lastAccessed,
      })),
      consents: consents.map((consent) => ({
        id: consent.id,
        consentType: consent.consentType,
        granted: consent.granted,
        grantedAt: consent.grantedAt,
        revokedAt: consent.revokedAt,
      })),
      recommendations: this.generateRecommendations(
        Object.values(latestAudits).flatMap((audit) => audit?.findings || [])
      ),
    };
  }

  /**
   * Calcular score geral
   */
  private calculateOverallScore(audits: Partial<Record<string, ComplianceAudit>>): number {
    const scores = Object.values(audits)
      .filter((audit) => audit)
      .map((audit) => audit.score);

    if (scores.length === 0) return 0;

    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }

  /**
   * Gerar chave de criptografia
   */
  private async generateEncryptionKey(tenantId: string, keyType: string): Promise<any> {
    let keyData: any;

    if (keyType === 'aes') {
      const key = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);

      keyData = {
        type: 'aes',
        key: key.toString('hex'),
        iv: iv.toString('hex'),
        algorithm: 'aes-256-cbc',
        tenantId,
        createdAt: new Date().toISOString(),
      };
    } else if (keyType === 'rsa') {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      keyData = {
        type: 'rsa',
        publicKey: publicKey,
        privateKey: privateKey,
        algorithm: 'rsa-2048',
        tenantId,
        createdAt: new Date().toISOString(),
      };
    }

    // Armazenar chave
    this.encryptionKeys.set(`${tenantId}_${keyType}`, JSON.stringify(keyData));

    logger.info('Encryption key generated', { tenantId, keyType });

    return keyData;
  }

  /**
   * Inicializar compliance padrão
   */
  private initializeDefaultCompliance(): void {
    logger.info('Compliance service initialized with default settings');
  }

  /**
   * Inicializar serviço de compliance
   */
  static initialize(server: FastifyInstance): ComplianceService {
    const compliance = new ComplianceService(server);
    logger.info('Compliance service initialized');
    return compliance;
  }
}

// Singleton instance
let complianceService: ComplianceService | null;

export function getComplianceService(): ComplianceService {
  if (!complianceService) {
    throw new Error('Compliance service not initialized');
  }
  return complianceService;
}

export default ComplianceService;
