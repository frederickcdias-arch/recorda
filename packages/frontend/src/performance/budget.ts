/**
 * Performance Budget Configuration
 * Define limites de performance para o frontend
 */

export const performanceBudget = {
  // Bundle size limits (em bytes)
  bundleSize: {
    js: 250 * 1024, // 250KB para JavaScript
    css: 50 * 1024, // 50KB para CSS
    images: 500 * 1024, // 500KB para imagens
    fonts: 100 * 1024, // 100KB para fontes
    total: 500 * 1024, // 500KB total
  },

  // Performance metrics limits
  metrics: {
    // Core Web Vitals
    largestContentfulPaint: 2500, // 2.5s (Good)
    firstContentfulPaint: 1800, // 1.8s (Good)
    firstMeaningfulPaint: 2000, // 2.0s (Good)
    cumulativeLayoutShift: 0.1, // 0.1 (Good)
    totalBlockingTime: 200, // 200ms (Good)
    timeToInteractive: 3800, // 3.8s (Good)

    // Outras métricas
    speedIndex: 3400, // 3.4s (Good)
    interactive: 3800, // 3.8s (Good)
    visualComplete: 4000, // 4.0s
    estimatedInputLatency: 50, // 50ms (Good)
  },

  // Resource limits
  resources: {
    maxRequests: 100, // Máximo de requisições
    maxDomains: 10, // Máximo de domínios diferentes
    maxAsyncRequests: 10, // Máximo de requisições assíncronas
    maxSyncRequests: 4, // Máximo de requisições síncronas
  },

  // Cache strategy
  cache: {
    staticAssets: 31536000, // 1 ano para assets estáticos
    apiResponses: 300, // 5 minutos para respostas de API
    html: 3600, // 1 hora para HTML
    images: 2592000, // 30 dias para imagens
  },

  // Compression
  compression: {
    enabled: true,
    algorithms: ['gzip', 'brotli'],
    minimumSize: 1024, // 1KB mínimo para compressão
  },

  // Image optimization
  images: {
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 85,
    formats: ['webp', 'avif', 'jpg'],
    lazyLoading: true,
  },

  // Font optimization
  fonts: {
    preload: ['critical'],
    display: 'swap',
    formats: ['woff2', 'woff'],
    maxVariants: 3,
  },

  // Code splitting
  codeSplitting: {
    enabled: true,
    chunks: {
      vendor: true,
      common: true,
      pages: true,
      components: true,
    },
    lazy: {
      routes: true,
      components: true,
      images: true,
    },
  },

  // Service Worker
  serviceWorker: {
    enabled: true,
    cacheFirst: ['static'],
    networkFirst: ['api'],
    staleWhileRevalidate: ['html'],
  },
};

// Performance thresholds para CI/CD
export const performanceThresholds = {
  // Lighthouse scores (0-100)
  lighthouse: {
    performance: 90,
    accessibility: 95,
    bestPractices: 90,
    seo: 90,
  },

  // Bundle analyzer
  bundleAnalyzer: {
    maxSize: performanceBudget.bundleSize.total,
    maxChunks: 50,
    maxModules: 500,
  },

  // Web Vitals
  webVitals: {
    LCP: { min: 0, max: performanceBudget.metrics.largestContentfulPaint },
    FID: { min: 0, max: 100 },
    CLS: { min: 0, max: performanceBudget.metrics.cumulativeLayoutShift },
    FCP: { min: 0, max: performanceBudget.metrics.firstContentfulPaint },
    TTFB: { min: 0, max: 800 },
  },
};

// Performance monitoring configuration
export const performanceMonitoring = {
  // Real User Monitoring (RUM)
  rum: {
    enabled: true,
    sampleRate: 0.1, // 10% dos usuários
    endpoints: ['/api/metrics/performance', '/api/metrics/web-vitals'],
  },

  // Synthetic monitoring
  synthetic: {
    enabled: true,
    frequency: '5m', // A cada 5 minutos
    locations: ['us-east-1', 'us-west-1', 'eu-west-1'],
    tests: [
      {
        name: 'Homepage Load',
        url: '/',
        steps: ['navigate', 'waitForLoad', 'measureMetrics'],
      },
      {
        name: 'Login Flow',
        url: '/login',
        steps: ['navigate', 'fillForm', 'submit', 'waitForRedirect'],
      },
      {
        name: 'Dashboard Load',
        url: '/dashboard',
        steps: ['navigate', 'waitForLoad', 'measureMetrics'],
      },
    ],
  },

  // Alerting
  alerts: {
    enabled: true,
    thresholds: {
      responseTime: { warning: 1000, critical: 2000 },
      errorRate: { warning: 0.05, critical: 0.1 },
      availability: { warning: 0.99, critical: 0.95 },
    },
    channels: ['email', 'slack', 'pagerduty'],
  },
};

// Performance optimization recommendations
export const performanceOptimizations = {
  // Critical optimizations
  critical: [
    'Implement code splitting for routes',
    'Optimize images with WebP format',
    'Enable Brotli compression',
    'Implement service worker caching',
    'Minimize JavaScript and CSS',
    'Remove unused dependencies',
  ],

  // Important optimizations
  important: [
    'Implement lazy loading for images',
    'Optimize font loading strategy',
    'Reduce third-party scripts',
    'Implement HTTP/2 server push',
    'Add resource hints (preload, prefetch)',
    'Optimize database queries',
  ],

  // Nice-to-have optimizations
  nice: [
    'Implement edge caching',
    'Use Web Workers for heavy computations',
    'Implement request deduplication',
    'Add performance budgets monitoring',
    'Implement progressive loading',
    'Use Intersection Observer for lazy loading',
  ],
};

// Performance testing scripts
export const performanceTests = {
  // Load testing
  loadTest: {
    script: './tests/load/load-test.js',
    scenarios: [
      { name: 'Light Load', users: 10, duration: '5m' },
      { name: 'Medium Load', users: 50, duration: '10m' },
      { name: 'Heavy Load', users: 100, duration: '15m' },
      { name: 'Stress Test', users: 200, duration: '5m' },
    ],
  },

  // Performance testing
  performanceTest: {
    script: './tests/performance/performance-test.js',
    metrics: ['responseTime', 'throughput', 'errorRate', 'cpuUsage', 'memoryUsage'],
  },

  // Frontend performance testing
  frontendTest: {
    tools: ['Lighthouse', 'WebPageTest', 'GTmetrix'],
    pages: [
      { url: '/', name: 'Homepage' },
      { url: '/login', name: 'Login' },
      { url: '/dashboard', name: 'Dashboard' },
      { url: '/projetos', name: 'Projects' },
    ],
  },
};

export default {
  performanceBudget,
  performanceThresholds,
  performanceMonitoring,
  performanceOptimizations,
  performanceTests,
};
