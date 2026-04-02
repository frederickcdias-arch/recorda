/**
 * Event Bus Service - Implementação de Event-Driven Architecture
 * Centraliza comunicação assíncrona via eventos
 */

import { EventEmitter } from 'node:events';
import { logger } from '../logging/logger.js';

export interface EventData {
  id: string;
  type: string;
  timestamp: number;
  payload: any;
  metadata?: Record<string, any>;
  userId?: string;
  tenantId?: string;
}

export interface EventHandler {
  (event: EventData): Promise<void>;
}

export interface EventFilter {
  eventTypes?: string[];
  tenantIds?: string[];
  userIds?: string[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
}

export class EventService {
  private eventBus: EventEmitter;
  private handlers: Map<string, EventHandler[]> = new Map();
  private eventQueue: EventData[] = [];
  private isProcessing = false;
  private maxQueueSize = 1000;
  private retryAttempts = 3;

  constructor() {
    this.eventBus = new EventEmitter({
      captureRejections: true,
    });

    // Setup error handling
    this.eventBus.on('error', (error: Error) => {
      logger.error('Event bus error', { error: error.message, stack: error.stack });
    });

    // Setup listener limit warnings
    this.eventBus.setMaxListeners(100);
    this.eventBus.on('maxListeners', () => {
      logger.warn('Event bus approaching listener limit');
    });
  }

  /**
   * Publicar evento no barramento de eventos
   */
  publish(eventData: EventData): Promise<void> {
    return new Promise((resolve) => {
      this.eventQueue.push(eventData);

      if (!this.isProcessing && this.eventQueue.length > 0) {
        this.processQueue();
      }

      resolve(undefined);
    });
  }

  /**
   * Assinar handler para tipo de evento específico
   */
  subscribe(eventType: string, handler: EventHandler, filter?: EventFilter): void {
    const key = `${eventType}_${JSON.stringify(filter || {})}`;

    if (!this.handlers.has(key)) {
      this.handlers.set(key, []);
    }

    this.handlers.get(key)!.push(handler);
  }

  /**
   * Remover handler
   */
  unsubscribe(eventType: string, handler: EventHandler): void {
    const key = `${eventType}_${JSON.stringify({})}`;
    const handlers = this.handlers.get(key);

    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);

        if (handlers.length === 0) {
          this.handlers.delete(key);
        }
      }
    }
  }

  /**
   * Processar fila de eventos
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.eventQueue.length > 0 && this.isProcessing) {
      const event = this.eventQueue.shift();
      if (event) {
        await this.processEvent(event);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Processar evento individual
   */
  private async processEvent(event: EventData): Promise<void> {
    const key = `${event.type}_${JSON.stringify(event.tenantId || '')}`;
    const handlers = this.handlers.get(key) || [];

    try {
      await Promise.all(handlers.map((handler) => this.executeHandler(handler, event)));

      logger.debug('Event processed', {
        eventType: event.type,
        eventId: event.id,
        handlers: handlers.length,
        timestamp: event.timestamp,
      });
    } catch (error) {
      logger.error('Event processing error', {
        eventType: event.type,
        eventId: event.id,
        error: (error as Error).message,
        timestamp: event.timestamp,
      });

      // Tentar novamente após falha
      if (this.retryAttempts > 0) {
        this.retryAttempts--;
        this.eventQueue.unshift(event);
      }
    }
  }

  /**
   * Executar handler com retry
   */
  private async executeHandler(handler: EventHandler, event: EventData): Promise<void> {
    try {
      await handler(event);
    } catch (error) {
      logger.error('Event handler error', {
        eventType: event.type,
        eventId: event.id,
        error: (error as Error).message,
        timestamp: event.timestamp,
      });
      throw error;
    }
  }

  /**
   * Criar evento com ID único
   */
  createEvent(type: string, payload: any, metadata?: Record<string, any>): EventData {
    return {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      payload,
      metadata,
    };
  }

  /**
   * Obter estatísticas do event bus
   */
  getStats(): {
    queueSize: number;
    isProcessing: boolean;
    handlerCount: number;
    maxQueueSize: number;
    retryAttempts: number;
  } {
    return {
      queueSize: this.eventQueue.length,
      isProcessing: this.isProcessing,
      handlerCount: Array.from(this.handlers.entries()).reduce(
        (acc, [, handlers]) => acc + handlers.length,
        0
      ),
      maxQueueSize: this.maxQueueSize,
      retryAttempts: this.retryAttempts,
    };
  }

  /**
   * Limpar fila de eventos
   */
  clearQueue(): void {
    this.eventQueue = [];
    this.isProcessing = false;
  }

  /**
   * Obter eventos por tipo
   */
  getEventCount(eventType: string): number {
    return this.eventQueue.filter((e) => e.type === eventType).length;
  }

  /**
   * Obter eventos por tenant
   */
  getEventCountByTenant(tenantId: string): number {
    return this.eventQueue.filter((e) => e.tenantId === tenantId).length;
  }

  /**
   * Obter eventos por usuário
   */
  getEventCountByUser(userId: string): number {
    return this.eventQueue.filter((e) => e.userId === userId).length;
  }

  /**
   * Limpar handlers por tipo
   */
  clearHandlers(eventType?: string): void {
    if (eventType) {
      const keysToDelete = Array.from(this.handlers.keys()).filter((key) =>
        key.startsWith(`${eventType}_`)
      );
      keysToDelete.forEach((key) => this.handlers.delete(key));
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Inicializar serviço de eventos
   */
  static initialize(): EventService {
    const eventService = new EventService();
    logger.info('Event service initialized');
    return eventService;
  }
}

// Singleton instance
let eventService: EventService | null;

export function getEventService(): EventService {
  if (!eventService) {
    eventService = EventService.initialize();
  }
  return eventService;
}

// Event types constantes
export const EventTypes = {
  // Operacionais de Produção
  PRODUCAO_CRIADO: 'producao_criado',
  PRODUCAO_ATUALIZADA: 'producao_atualizada',
  PRODUCAO_EXCLUIDA: 'producao_excluída',
  PRODUCAO_IMPORTADA: 'producao_importada',
  ETAPA_ATUALIZADA: 'etapa_atualizada',
  CHECKLIST_CRIADO: 'checklist_criado',
  CHECKLIST_CONCLUIDO: 'checklist_concluído',
  RECEBIMENTO_INICIADO: 'recebimento_iniciado',
  RECEBIMENTO_CONCLUIDO: 'recebimento_concluído',
  RECEBIMENTO_FINALIZADO: 'recebimento_finalizado',
  RECEBIMENTO_CANCELADO: 'recebimento_cancelado',

  // Sistema
  USUARIO_LOGADO: 'usuario_logado',
  USUARIO_DESLOGADO: 'usuario_deslogado',
  USUARIO_ATUALIZADO: 'usuario_atualizado',
  USUARIO_CRIADO: 'usuario_criado',
  USUARIO_EXCLUIDO: 'usuario_excluído',
  LOGIN_FALHOU: 'login_falhou',
  LOGIN_SUCESS: 'login_success',
  LOGOUT_SUCESS: 'logout_success',

  // Auditoria
  AUDITORIA_CRIADO: 'auditoria_criado',
  AUDITORIA_ATUALIZADO: 'auditoria_atualizado',
  AUDITORIA_DELETADO: 'auditoria_deletado',
  USUARIO_PERMISSAO: 'usuario_permissao',
  ACESSO_NEGADO: 'acesso_negado',
  ERRO_CRITICO: 'erro_crítico',

  // Relatórios
  RELATORIO_GERADO: 'relatorio_gerado',
  RELATORIO_EXPORTADO: 'relatorio_exportado',
  RELATORIO_VISUALIZADO: 'relatorio_visualizado',
  METAS_ATUALIZADAS: 'metas_atualizadas',

  // Configurações
  CONFIG_ATUALIZADA: 'config_atualizada',
  PROJETO_CRIADO: 'projeto_criado',
  EMPRESA_CRIADA: 'empresa_criada',
  SISTEMA_INTEGRADO: 'sistema_integrado',
  BACKUP_CONCLUIDO: 'backup_concluído',

  // Backup
  BACKUP_INICIADO: 'backup_iniciado',
  BACKUP_CONCLUÍDO: 'backup_concluído',
  BACKUP_RESTAURADO: 'backup_restaurado',
  RESTAURADO: 'restaurado',
  DISASTER_RECOVERY: 'disaster_recovery',

  // Performance
  SLOW_REQUEST: 'slow_request',
  ERROR_RATE: 'error_rate',
  MEMORY_HIGH: 'memory_high',
  CPU_HIGH: 'cpu_high',
  DISK_SPACE_LOW: 'disk_space_low',
  CACHE_MISS: 'cache_miss',
  CACHE_HIT: 'cache_hit',
} as const;

export default EventService;
