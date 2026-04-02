/**
 * User Cache Service
 * Implementa cache específico para operações de usuário
 */

import { getCacheService, type CacheOptions } from '../cache/index.js';
import { CacheKeys, CacheTTL } from './decorators.js';

export class UserCacheService {
  private cache = getCacheService();

  /**
   * Buscar usuário por ID com cache
   */
  async getUserById(id: string): Promise<any | null> {
    const cacheKey = CacheKeys.USER_BY_ID(id);
    return this.cache.get(cacheKey);
  }

  /**
   * Armazenar usuário por ID no cache
   */
  async setUserById(id: string, user: any, options: CacheOptions = {}): Promise<void> {
    const cacheKey = CacheKeys.USER_BY_ID(id);
    await this.cache.set(cacheKey, user, { ttl: CacheTTL.MEDIUM, ...options });
  }

  /**
   * Buscar usuário por email com cache
   */
  async getUserByEmail(email: string): Promise<any | null> {
    const cacheKey = CacheKeys.USER_BY_EMAIL(email);
    return this.cache.get(cacheKey);
  }

  /**
   * Armazenar usuário por email no cache
   */
  async setUserByEmail(email: string, user: any, options: CacheOptions = {}): Promise<void> {
    const cacheKey = CacheKeys.USER_BY_EMAIL(email);
    await this.cache.set(cacheKey, user, { ttl: CacheTTL.MEDIUM, ...options });
  }

  /**
   * Listar usuários ativos com cache
   */
  async getActiveUsers(): Promise<any[]> {
    const cacheKey = CacheKeys.USUARIOS_ATIVOS;
    const cached = await this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    // Cache miss - retornar array vazio por enquanto
    return [];
  }

  /**
   * Armazenar lista de usuários ativos no cache
   */
  async setActiveUsers(users: any[], options: CacheOptions = {}): Promise<void> {
    const cacheKey = CacheKeys.USUARIOS_ATIVOS;
    await this.cache.set(cacheKey, users, { ttl: CacheTTL.SHORT, ...options });
  }

  /**
   * Salvar usuário com invalidação de cache
   */
  async saveUser(user: any): Promise<void> {
    // Armazenar em múltiplos formatos para diferentes buscas
    await this.setUserById(user.id, user);
    await this.setUserByEmail(user.email, user);

    // Invalidar cache de lista
    await this.cache.delete(CacheKeys.USUARIOS_ATIVOS);
  }

  /**
   * Atualizar usuário com invalidação de cache
   */
  async updateUser(id: string, email: string, updates: any): Promise<void> {
    // Remover caches antigos
    await this.clearUserCache(id, email);

    // Invalidar cache de lista
    await this.cache.delete(CacheKeys.USUARIOS_ATIVOS);
  }

  /**
   * Desativar usuário com invalidação de cache
   */
  async deactivateUser(id: string): Promise<void> {
    // Remover cache do usuário
    await this.cache.delete(CacheKeys.USER_BY_ID(id));

    // Invalidar cache de lista
    await this.cache.delete(CacheKeys.USUARIOS_ATIVOS);
  }

  /**
   * Limpar cache de um usuário específico
   */
  async clearUserCache(id: string, email?: string): Promise<void> {
    const keysToDelete = [CacheKeys.USER_BY_ID(id)];

    if (email) {
      keysToDelete.push(CacheKeys.USER_BY_EMAIL(email));
    }

    await this.cache.deleteMultiple(keysToDelete);
  }

  /**
   * Limpar todo o cache de usuários
   */
  async clearAllUserCache(): Promise<void> {
    await this.cache.deleteMultiple([
      CacheKeys.USUARIOS_ATIVOS,
      CacheKeys.METAS_PRODUCAO,
      CacheKeys.CONFIGURACOES_EMPRESA,
    ]);
  }

  /**
   * Pré-carregar cache de usuários ativos
   */
  async preloadActiveUsers(): Promise<void> {
    try {
      // Simular pré-carregamento
      const usuarios = []; // Viria do repository
      await this.setActiveUsers(usuarios);

      console.log(`Pré-carregados ${usuarios.length} usuários ativos no cache`);
    } catch (error) {
      console.error('Erro ao pré-carregar cache de usuários:', error);
    }
  }

  /**
   * Verificar se usuário está em cache
   */
  async isUserCached(id: string): Promise<boolean> {
    return await this.cache.exists(CacheKeys.USER_BY_ID(id));
  }

  /**
   * Obter estatísticas do cache de usuários
   */
  async getCacheStats(): Promise<{
    userById: boolean;
    userByEmail: boolean;
    activeUsers: boolean;
    totalConnections: number;
  }> {
    const stats = await this.cache.getStats();

    return {
      userById: await this.cache.exists(CacheKeys.USER_BY_ID('sample')),
      userByEmail: await this.cache.exists(CacheKeys.USER_BY_EMAIL('sample')),
      activeUsers: await this.cache.exists(CacheKeys.USUARIOS_ATIVOS),
      totalConnections: stats.connected ? 1 : 0,
    };
  }

  /**
   * Cache de relatórios
   */
  async getRelatorio(inicio: string, fim: string): Promise<any | null> {
    const cacheKey = CacheKeys.RELATORIO_COMPLETO(inicio, fim);
    return this.cache.get(cacheKey);
  }

  /**
   * Armazenar relatório em cache
   */
  async setRelatorio(
    inicio: string,
    fim: string,
    relatorio: any,
    options: CacheOptions = {}
  ): Promise<void> {
    const cacheKey = CacheKeys.RELATORIO_COMPLETO(inicio, fim);
    await this.cache.set(cacheKey, relatorio, { ttl: CacheTTL.LONG, ...options });
  }

  /**
   * Cache de metas de produção
   */
  async getMetasProducao(): Promise<any | null> {
    return this.cache.get(CacheKeys.METAS_PRODUCAO);
  }

  /**
   * Armazenar metas de produção em cache
   */
  async setMetasProducao(metas: any, options: CacheOptions = {}): Promise<void> {
    await this.cache.set(CacheKeys.METAS_PRODUCAO, metas, { ttl: CacheTTL.MEDIUM, ...options });
  }

  /**
   * Cache de configurações da empresa
   */
  async getConfiguracoesEmpresa(): Promise<any | null> {
    return this.cache.get(CacheKeys.CONFIGURACOES_EMPRESA);
  }

  /**
   * Armazenar configurações da empresa em cache
   */
  async setConfiguracoesEmpresa(config: any, options: CacheOptions = {}): Promise<void> {
    await this.cache.set(CacheKeys.CONFIGURACOES_EMPRESA, config, {
      ttl: CacheTTL.LONG,
      ...options,
    });
  }

  /**
   * Cache de projetos ativos
   */
  async getProjetosAtivos(): Promise<any[]> {
    const cached = await this.cache.get(CacheKeys.PROJETOS_ATIVOS);
    return cached || [];
  }

  /**
   * Armazenar projetos ativos em cache
   */
  async setProjetosAtivos(projetos: any[], options: CacheOptions = {}): Promise<void> {
    await this.cache.set(CacheKeys.PROJETOS_ATIVOS, projetos, { ttl: CacheTTL.MEDIUM, ...options });
  }

  /**
   * Cache de estatísticas do dashboard
   */
  async getEstatisticasDashboard(): Promise<any | null> {
    return this.cache.get(CacheKeys.ESTATISTICAS_DASHBOARD);
  }

  /**
   * Armazenar estatísticas do dashboard em cache
   */
  async setEstatisticasDashboard(estatisticas: any, options: CacheOptions = {}): Promise<void> {
    await this.cache.set(CacheKeys.ESTATISTICAS_DASHBOARD, estatisticas, {
      ttl: CacheTTL.SHORT,
      ...options,
    });
  }
}
