/**
 * Cache Service - Implementação de cache com Redis
 * Fornece cache centralizado para a aplicação
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from '../logging/logger.js';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

export class CacheService {
  private client: RedisClientType;
  private defaultTtl: number = 3600; // 1 hora
  private keyPrefix: string = 'recorda:';

  constructor(redisUrl: string) {
    this.client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 5000,
        lazyConnect: true,
      },
    });

    // Setup error handling
    this.client.on('error', (error: Error) => {
      logger.error('Redis client error', { error: error.message });
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis client disconnected');
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Cache service initialized');
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: (error as Error).message });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      logger.info('Cache service disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis', { error: (error as Error).message });
    }
  }

  private getKey(key: string, prefix?: string): string {
    const actualPrefix = prefix || this.keyPrefix;
    return `${actualPrefix}${key}`;
  }

  /**
   * Armazena um valor no cache
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      const cacheKey = this.getKey(key, options.prefix);
      const ttl = options.ttl || this.defaultTtl;

      await this.client.setEx(cacheKey, ttl, serializedValue);

      logger.debug('Cache set', { key: cacheKey, ttl });
    } catch (error) {
      logger.error('Error setting cache', {
        key,
        error: (error as Error).message,
      });
      // Não lançar erro para não quebrar a aplicação
    }
  }

  /**
   * Recupera um valor do cache
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    try {
      const cacheKey = this.getKey(key, options.prefix);
      const value = await this.client.get(cacheKey);

      if (value === null) {
        return null;
      }

      const parsedValue = JSON.parse(value) as T;

      logger.debug('Cache hit', { key: cacheKey });
      return parsedValue;
    } catch (error) {
      logger.error('Error getting cache', {
        key,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Verifica se uma chave existe no cache
   */
  async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    try {
      const cacheKey = this.getKey(key, options.prefix);
      const result = await this.client.exists(cacheKey);
      return result === 1;
    } catch (error) {
      logger.error('Error checking cache existence', {
        key,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Remove uma chave do cache
   */
  async delete(key: string, options: CacheOptions = {}): Promise<void> {
    try {
      const cacheKey = this.getKey(key, options.prefix);
      await this.client.del(cacheKey);

      logger.debug('Cache deleted', { key: cacheKey });
    } catch (error) {
      logger.error('Error deleting cache', {
        key,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Remove múltiplas chaves do cache
   */
  async deleteMultiple(keys: string[], options: CacheOptions = {}): Promise<void> {
    try {
      const cacheKeys = keys.map((key) => this.getKey(key, options.prefix));
      await this.client.del(cacheKeys);

      logger.debug('Multiple cache keys deleted', { keys: cacheKeys });
    } catch (error) {
      logger.error('Error deleting multiple cache keys', {
        keys,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Limpa todo o cache
   */
  async clear(): Promise<void> {
    try {
      await this.client.flushDb();
      logger.info('Cache cleared');
    } catch (error) {
      logger.error('Error clearing cache', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Incrementa um valor numérico
   */
  async increment(key: string, amount: number = 1, options: CacheOptions = {}): Promise<number> {
    try {
      const cacheKey = this.getKey(key, options.prefix);
      const result = await this.client.incrBy(cacheKey, amount);

      logger.debug('Cache incremented', { key: cacheKey, amount, result });
      return result;
    } catch (error) {
      logger.error('Error incrementing cache', {
        key,
        amount,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Cache com fallback - executa função se não estiver em cache
   */
  async getOrSet<T>(key: string, fn: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    // Tentar obter do cache
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Executar função
    const result = await fn();

    // Armazenar no cache
    await this.set(key, result, options);

    return result;
  }

  /**
   * Cache de lista - armazena múltiplos valores
   */
  async setList<T>(key: string, values: T[], options: CacheOptions = {}): Promise<void> {
    try {
      const serializedValues = values.map((v: T) => JSON.stringify(v));
      const cacheKey = this.getKey(key, options.prefix);
      const ttl = options.ttl || this.defaultTtl;

      await this.client.del(cacheKey); // Limpar lista existente
      if (serializedValues.length > 0) {
        await this.client.lPush(cacheKey, serializedValues);
        await this.client.expire(cacheKey, ttl);
      }

      logger.debug('Cache list set', { key: cacheKey, count: values.length });
    } catch (error) {
      logger.error('Error setting cache list', {
        key,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Recupera lista do cache
   */
  async getList<T>(key: string, options: CacheOptions = {}): Promise<T[]> {
    try {
      const cacheKey = this.getKey(key, options.prefix);
      const values = await this.client.lRange(cacheKey, 0, -1);

      if (values.length === 0) {
        return [];
      }

      const parsedValues = values.map((v: string) => JSON.parse(v) as T);

      logger.debug('Cache list hit', { key: cacheKey, count: parsedValues.length });
      return parsedValues;
    } catch (error) {
      logger.error('Error getting cache list', {
        key,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Obtém estatísticas do Redis
   */
  async getStats(): Promise<{
    connected: boolean;
    memory: string;
    keys: number;
    operations: number;
  }> {
    try {
      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');

      const memoryMatch = info.match(/used_memory:(\d+)/);
      const keyspaceMatch = keyspace.match(/db0:keys=(\d+)/);

      return {
        connected: this.client.isOpen,
        memory: memoryMatch ? memoryMatch[1] : '0',
        keys: keyspaceMatch ? parseInt(keyspaceMatch[1]) : 0,
        operations: 0, // Poderia ser implementado com monitoramento
      };
    } catch (error) {
      logger.error('Error getting Redis stats', {
        error: (error as Error).message,
      });
      return {
        connected: false,
        memory: '0',
        keys: 0,
        operations: 0,
      };
    }
  }
}

// Singleton instance
let cacheService: CacheService | null = null;

export function getCacheService(): CacheService {
  if (!cacheService) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    cacheService = new CacheService(redisUrl);
  }
  return cacheService;
}

export async function initializeCache(): Promise<void> {
  const cache = getCacheService();
  await cache.connect();
}

export async function shutdownCache(): Promise<void> {
  if (cacheService) {
    await cacheService.disconnect();
    cacheService = null;
  }
}
