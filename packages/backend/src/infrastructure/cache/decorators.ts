/**
 * Cache Decorators - Decorators para cache automático
 * Simplifica o uso de cache nos serviços
 */

import { getCacheService, type CacheOptions } from '../cache/index.js';

/**
 * Decorator para cache de métodos
 */
export function Cacheable(key: string, options: CacheOptions = {}) {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cache = getCacheService();
      const cacheKey = `${key}:${JSON.stringify(args)}`;

      return cache.getOrSet(cacheKey, () => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * Decorator para invalidação de cache
 */
export function CacheInvalidate(pattern: string) {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);

      // Invalidar cache baseado no padrão
      const cache = getCacheService();
      const cacheKey = pattern.replace(/\{(\w+)\}/g, (match, key) => {
        const index = parseInt(key);
        return args[index] || match;
      });

      await cache.delete(cacheKey);

      return result;
    };

    return descriptor;
  };
}

/**
 * Cache Keys Constants
 */
export const CacheKeys = {
  USER_BY_ID: (id: string) => `user:${id}`,
  USER_BY_EMAIL: (email: string) => `user:email:${email}`,
  USUARIOS_ATIVOS: 'users:ativos',
  PRODUCAO_POR_PERIODO: (inicio: string, fim: string) => `producao:${inicio}:${fim}`,
  RELATORIO_COMPLETO: (inicio: string, fim: string) => `relatorio:${inicio}:${fim}`,
  METAS_PRODUCAO: 'metas:producao',
  CONFIGURACOES_EMPRESA: 'configuracoes:empresa',
  PROJETOS_ATIVOS: 'projetos:ativos',
  ESTATISTICAS_DASHBOARD: 'dashboard:estatisticas',
  CHECKLISTS_POR_REPOSITORIO: (repoId: string) => `checklists:${repoId}`,
  RECEBIMENTO_PROCESSOS: (repoId: string) => `recebimento:${repoId}`,
} as const;

/**
 * Cache TTL Constants (em segundos)
 */
export const CacheTTL = {
  SHORT: 300, // 5 minutos
  MEDIUM: 1800, // 30 minutos
  LONG: 3600, // 1 hora
  VERY_LONG: 86400, // 24 horas
  DAILY: 86400, // 1 dia
  WEEKLY: 604800, // 7 dias
} as const;
