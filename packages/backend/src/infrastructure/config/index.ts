import dotenv from 'dotenv';

dotenv.config();

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface ServerConfig {
  port: number;
  host: string;
}

export interface DocumentProcessorConfig {
  enabled: boolean;
  runtime: 'auto' | 'python' | 'docker';
  pythonBinary: string;
  scriptPath: string;
  tempDir: string;
  dockerImage: string;
  dockerBootstrap: string;
}

export interface Config {
  database: DatabaseConfig;
  server: ServerConfig;
  documentProcessor: DocumentProcessorConfig;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function createDatabaseConfig(isProduction: boolean): DatabaseConfig {
  const databaseUrl = process.env['DATABASE_URL']?.trim();
  if (databaseUrl) {
    const parsed = new URL(databaseUrl);
    const password = decodeURIComponent(parsed.password || '');
    if (isProduction && password.length === 0) {
      throw new Error('DATABASE_URL is set but has no password.');
    }

    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
      database: parsed.pathname.replace(/^\//, ''),
      user: decodeURIComponent(parsed.username || 'recorda'),
      password: password || getEnvOrDefault('DB_PASSWORD', 'recorda'),
    };
  }

  return {
    host: getEnvOrDefault('DB_HOST', 'localhost'),
    port: parseInt(getEnvOrDefault('DB_PORT', '5433'), 10),
    database: getEnvOrDefault('DB_NAME', 'recorda'),
    user: getEnvOrDefault('DB_USER', 'recorda'),
    password: isProduction
      ? getEnvOrThrow('DB_PASSWORD')
      : getEnvOrDefault('DB_PASSWORD', 'recorda'),
  };
}

function createConfig(): Config {
  const isProduction = process.env['NODE_ENV'] === 'production';

  return {
    database: createDatabaseConfig(isProduction),
    server: {
      port: parseInt(getEnvOrDefault('PORT', '3000'), 10),
      host: getEnvOrDefault('HOST', '0.0.0.0'),
    },
    documentProcessor: {
      enabled: getEnvOrDefault('DOCUMENT_PROCESSOR_ENABLED', 'false') === 'true',
      runtime: (() => {
        const runtime = getEnvOrDefault('DOCUMENT_PROCESSOR_RUNTIME', 'python');
        if (runtime === 'docker') return 'docker';
        if (runtime === 'auto') return 'auto';
        return 'python';
      })(),
      pythonBinary: getEnvOrDefault('DOCUMENT_PROCESSOR_PYTHON', 'python'),
      scriptPath: getEnvOrDefault(
        'DOCUMENT_PROCESSOR_SCRIPT',
        'packages/backend/python/document_processor.py'
      ),
      tempDir: getEnvOrDefault('DOCUMENT_PROCESSOR_TEMP_DIR', '.tmp/document-processor'),
      dockerImage: getEnvOrDefault('DOCUMENT_PROCESSOR_DOCKER_IMAGE', ''),
      dockerBootstrap: getEnvOrDefault('DOCUMENT_PROCESSOR_DOCKER_BOOTSTRAP', ''),
    },
  };
}

export const config = createConfig();
