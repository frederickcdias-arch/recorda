/**
 * CDN Service - Content Delivery Network
 * Implementa CDN para assets estáticos
 */

import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { logger } from '../logging/logger.js';

export interface CDNConfig {
  enabled: boolean;
  provider: 'cloudflare' | 'aws' | 'azure' | 'custom';
  domain: string;
  cacheTTL: number;
  compression: boolean;
  optimization: {
    images: boolean;
    fonts: boolean;
    css: boolean;
    js: boolean;
  };
}

export interface CDNAsset {
  url: string;
  originalUrl: string;
  type: 'image' | 'font' | 'css' | 'js' | 'static';
  size: number;
  optimized: boolean;
  lastModified: Date;
  etag?: string;
}

export class CDNService {
  private config: CDNConfig;
  private assetCache: Map<string, CDNAsset> = new Map();
  private cacheStats = {
    hits: 0,
    misses: 0,
    uploads: 0,
    optimizations: 0,
  };

  constructor(
    private server: FastifyInstance,
    config: Partial<CDNConfig> = {}
  ) {
    this.config = {
      enabled: true,
      provider: 'cloudflare',
      domain: process.env.CDN_DOMAIN || 'cdn.recorda.com',
      cacheTTL: 31536000, // 1 ano
      compression: true,
      optimization: {
        images: true,
        fonts: true,
        css: true,
        js: true,
      },
      ...config,
    };

    this.setupCDNRoutes();
    this.setupAssetOptimization();
  }

  /**
   * Configurar rotas CDN
   */
  private setupCDNRoutes(): void {
    // Servir assets via CDN
    this.server.get('/cdn/*', async (request, reply) => {
      if (!this.config.enabled) {
        return reply.status(404).send({ error: 'CDN disabled' });
      }

      const assetPath = (request.params as any)['*'];
      const asset = this.assetCache.get(assetPath);

      if (asset) {
        this.cacheStats.hits++;

        return reply
          .header('Cache-Control', `public, max-age=${this.config.cacheTTL}`)
          .header('ETag', asset.etag || '')
          .header('Last-Modified', asset.lastModified.toUTCString())
          .header('Content-Type', this.getContentType(assetPath))
          .header('X-CDN-Cache', 'HIT')
          .send(asset.url);
      }

      this.cacheStats.misses++;
      return reply.status(404).send({ error: 'Asset not found' });
    });

    // Upload de assets para CDN
    this.server.post(
      '/cdn/upload',
      {
        schema: {
          description: 'Upload asset to CDN',
          tags: ['cdn'],
          consumes: ['multipart/form-data'],
          body: {
            type: 'object',
            properties: {
              file: { type: 'string', format: 'binary' },
              optimize: { type: 'boolean', default: true },
            },
          },
        },
      },
      async (request, reply) => {
        if (!this.config.enabled) {
          return reply.status(400).send({ error: 'CDN disabled' });
        }

        try {
          const data = await request.file();
          if (!data) {
            return reply.status(400).send({ error: 'No file provided' });
          }

          const optimize = (request.body as any)?.optimize ?? true;

          // Converter BusBoyFileStream para Buffer
          const chunks: Buffer[] = [];
          for await (const chunk of data.file) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);

          const asset = await this.uploadAsset(data.filename, buffer, optimize);

          this.cacheStats.uploads++;

          return reply.send({
            success: true,
            asset: {
              url: asset.url,
              originalSize: asset.size,
              optimized: asset.optimized,
              type: asset.type,
            },
          });
        } catch (error) {
          logger.error('CDN upload failed', { error: (error as Error).message });
          return reply.status(500).send({ error: 'Upload failed' });
        }
      }
    );

    // Estatísticas do CDN
    this.server.get('/cdn/stats', async (request, reply) => {
      return reply.send({
        config: this.config,
        stats: this.cacheStats,
        cacheSize: this.assetCache.size,
        uptime: process.uptime(),
      });
    });

    // Limpar cache do CDN
    this.server.delete('/cdn/cache/:assetPath*', async (request, reply) => {
      const assetPath = (request.params as any).assetPath;

      if (assetPath) {
        const deleted = this.assetCache.delete(assetPath);
        return reply.send({ deleted, assetPath });
      } else {
        // Limpar todo o cache
        const size = this.assetCache.size;
        this.assetCache.clear();
        return reply.send({ deleted: size, message: 'All cache cleared' });
      }
    });
  }

  /**
   * Configurar otimização de assets
   */
  private setupAssetOptimization(): void {
    // Middleware para otimizar URLs de assets
    this.server.addHook('preHandler', async (request, reply) => {
      if (!this.config.enabled) return;

      const url = request.url;

      // Otimizar URLs de assets em respostas HTML
      if (url.includes('.html') || url.endsWith('/')) {
        // Interceptar resposta para otimizar URLs
        const originalSend = reply.send.bind(reply);
        reply.send = (payload: any) => {
          if (typeof payload === 'string') {
            const optimized = this.optimizeAssetUrls(payload);
            return originalSend(optimized);
          }
          return originalSend(payload);
        };
      }
    });
  }

  /**
   * Upload de asset para CDN
   */
  private async uploadAsset(
    filename: string,
    buffer: Buffer,
    optimize: boolean
  ): Promise<CDNAsset> {
    const assetType = this.getAssetType(filename);
    let optimizedBuffer = buffer;
    let optimized = false;

    if (optimize && this.config.optimization[this.getOptimizationKey(assetType)]) {
      optimizedBuffer = await this.optimizeAsset(buffer, assetType);
      optimized = true;
      this.cacheStats.optimizations++;
    }

    const cdnUrl = `${this.config.domain}/${filename}`;
    const etag = this.generateETag(optimizedBuffer);
    const lastModified = new Date();

    const asset: CDNAsset = {
      url: cdnUrl,
      originalUrl: `/assets/${filename}`,
      type: assetType,
      size: optimizedBuffer.length,
      optimized,
      lastModified,
      etag,
    };

    // Armazenar no cache
    this.assetCache.set(filename, asset);

    // Simular upload para provedor CDN
    await this.simulateCDNUpload(filename, optimizedBuffer);

    logger.info('Asset uploaded to CDN', {
      filename,
      type: assetType,
      size: asset.size,
      optimized,
    });

    return asset;
  }

  /**
   * Otimizar asset baseado no tipo
   */
  private async optimizeAsset(buffer: Buffer, type: string): Promise<Buffer> {
    switch (type) {
      case 'image':
        return this.optimizeImage(buffer);
      case 'css':
        return this.optimizeCSS(buffer);
      case 'js':
        return this.optimizeJS(buffer);
      case 'font':
        return this.optimizeFont(buffer);
      default:
        return buffer;
    }
  }

  /**
   * Otimizar imagem
   */
  private async optimizeImage(buffer: Buffer): Promise<Buffer> {
    // Simular otimização de imagem
    // Na implementação real, usaria Sharp ou similar
    logger.debug('Optimizing image', { size: buffer.length });

    // Simular compressão de 30%
    const compressionRatio = 0.7;
    const compressedSize = Math.floor(buffer.length * compressionRatio);

    return buffer.slice(0, compressedSize);
  }

  /**
   * Otimizar CSS
   */
  private async optimizeCSS(buffer: Buffer): Promise<Buffer> {
    // Simular minificação de CSS
    const css = buffer.toString('utf-8');
    const minified = css
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remover comentários
      .replace(/\s+/g, ' ') // Reduzir espaços
      .replace(/;\s*}/g, '}') // Remover ; antes de }
      .trim();

    return Buffer.from(minified, 'utf-8');
  }

  /**
   * Otimizar JavaScript
   */
  private async optimizeJS(buffer: Buffer): Promise<Buffer> {
    // Simular minificação de JS
    const js = buffer.toString('utf-8');
    const minified = js
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remover comentários
      .replace(/\/\/.*$/gm, '') // Remover comentários de linha
      .replace(/\s+/g, ' ') // Reduzir espaços
      .trim();

    return Buffer.from(minified, 'utf-8');
  }

  /**
   * Otimizar font
   */
  private async optimizeFont(buffer: Buffer): Promise<Buffer> {
    // Simular otimização de font (subsetting)
    logger.debug('Optimizing font', { size: buffer.length });
    return buffer;
  }

  /**
   * Otimizar URLs de assets em HTML
   */
  private optimizeAssetUrls(html: string): string {
    if (!this.config.enabled) return html;

    // Substituir URLs de assets locais por URLs do CDN
    return html.replace(/(src|href)=["']\/assets\/([^"']+)["']/g, (_match, attr, filename) => {
      const asset = this.assetCache.get(filename);
      if (asset) {
        return `${attr}="${asset.url}"`;
      }
      return `${attr}="${this.config.domain}/${filename}"`;
    });
  }

  /**
   * Obter tipo de asset
   */
  private getAssetType(filename: string): CDNAsset['type'] {
    const ext = filename.split('.').pop()?.toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext || '')) {
      return 'image';
    }
    if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext || '')) {
      return 'font';
    }
    if (ext === 'css') {
      return 'css';
    }
    if (['js', 'mjs', 'ts'].includes(ext || '')) {
      return 'js';
    }

    return 'static';
  }

  /**
   * Obter chave de otimização
   */
  private getOptimizationKey(type: CDNAsset['type']): keyof CDNConfig['optimization'] {
    switch (type) {
      case 'image':
        return 'images';
      case 'font':
        return 'fonts';
      case 'css':
        return 'css';
      case 'js':
        return 'js';
      default:
        return 'js';
    }
  }

  /**
   * Obter content type
   */
  private getContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();

    const contentTypes: Record<string, string> = {
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp',
      woff: 'font/woff',
      woff2: 'font/woff2',
      ttf: 'font/ttf',
      otf: 'font/otf',
    };

    return contentTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * Gerar ETag
   */
  private generateETag(buffer: Buffer): string {
    const hash = crypto.createHash('md5');
    hash.update(buffer);
    return `"${hash.digest('hex')}"`;
  }

  /**
   * Simular upload para CDN
   */
  private async simulateCDNUpload(filename: string, buffer: Buffer): Promise<void> {
    // Simular delay de upload
    await new Promise((resolve) => setTimeout(resolve, 100));

    logger.debug('CDN upload simulated', {
      filename,
      size: buffer.length,
      provider: this.config.provider,
    });
  }

  /**
   * Obter URL do CDN para asset
   */
  getCDNUrl(assetPath: string): string {
    if (!this.config.enabled) {
      return `/assets/${assetPath}`;
    }

    return `${this.config.domain}/${assetPath}`;
  }

  /**
   * Verificar se asset está em cache
   */
  isAssetCached(assetPath: string): boolean {
    return this.assetCache.has(assetPath);
  }

  /**
   * Obter estatísticas do CDN
   */
  getStats(): {
    config: CDNConfig;
    stats: typeof this.cacheStats;
    cacheSize: number;
    hitRate: number;
  } {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = total > 0 ? (this.cacheStats.hits / total) * 100 : 0;

    return {
      config: this.config,
      stats: this.cacheStats,
      cacheSize: this.assetCache.size,
      hitRate,
    };
  }

  /**
   * Limpar cache do CDN
   */
  clearCache(assetPath?: string): number {
    if (assetPath) {
      return this.assetCache.delete(assetPath) ? 1 : 0;
    }

    const size = this.assetCache.size;
    this.assetCache.clear();
    return size;
  }

  /**
   * Configurar CDN
   */
  configure(config: Partial<CDNConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('CDN configuration updated', { config: this.config });
  }

  /**
   * Inicializar serviço CDN
   */
  static initialize(server: FastifyInstance, config?: Partial<CDNConfig>): CDNService {
    const cdn = new CDNService(server, config);
    logger.info('CDN service initialized', {
      enabled: cdn.config.enabled,
      provider: cdn.config.provider,
      domain: cdn.config.domain,
    });
    return cdn;
  }
}

export default CDNService;
