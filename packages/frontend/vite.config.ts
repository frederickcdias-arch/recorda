import path from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '../..');
  const env = loadEnv(mode, repoRoot, '');
  const isDev = mode !== 'production';
  const devApiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:3000';

  return {
    envDir: repoRoot,
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true,
          type: 'module',
        },
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'favicon.svg',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          name: 'Recorda',
          short_name: 'Recorda',
          description: 'Recorda - Sistema de Gestão Documental e Produção',
          theme_color: '#3b82f6',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        },
      }),
    ].filter(Boolean),
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: devApiTarget,
          changeOrigin: true,
          rewrite: (currentPath) => currentPath.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('@tanstack/')) {
              return 'query';
            }

            if (id.includes('recharts')) {
              return 'charts';
            }

            if (
              id.includes('react-markdown') ||
              id.includes('remark-gfm') ||
              id.includes('remark-') ||
              id.includes('rehype-') ||
              id.includes('micromark') ||
              id.includes('mdast-') ||
              id.includes('hast-') ||
              id.includes('unist-') ||
              id.includes('vfile') ||
              id.includes('unified') ||
              id.includes('bail') ||
              id.includes('trough') ||
              id.includes('property-information') ||
              id.includes('comma-separated-tokens') ||
              id.includes('space-separated-tokens') ||
              id.includes('decode-named-character-reference') ||
              id.includes('character-entities')
            ) {
              return 'markdown';
            }

            if (
              id.includes('react-router-dom') ||
              id.includes('react-router') ||
              id.includes('@remix-run/router')
            ) {
              return 'router';
            }

            if (id.includes('react-dom')) {
              return 'react-dom';
            }

            if (id.includes('scheduler')) {
              return 'react-dom';
            }

            if (
              id.includes('/react/') ||
              id.includes('\\react\\') ||
              id.includes('react/jsx-runtime') ||
              id.includes('react/jsx-dev-runtime') ||
              id.includes('node_modules/react/')
            ) {
              return 'react-core';
            }

            return 'vendor';
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/setupTests.ts',
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
      coverage: {
        reporter: ['text', 'html'],
      },
    },
  };
});
