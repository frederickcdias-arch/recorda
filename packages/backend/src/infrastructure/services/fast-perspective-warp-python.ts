import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';
import type { DocumentImagePoint } from './document-image-processor.js';

export type AIWarpMethod = 'python-fast-script' | 'node-native-warp' | 'faithful-scan';

export interface AIWarpMetadata {
  attempted: boolean;
  method: AIWarpMethod;
  success: boolean;
  timeout?: boolean;
  durationMs?: number;
  pythonStartupMs?: number;
  cv2ImportMs?: number;
  warpMs?: number;
  outputMs?: number;
  inputWidth?: number;
  inputHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
  error?: string;
}

export interface FastPerspectiveWarpPayload {
  success: boolean;
  output_path: string;
  confidence: number;
  final_dimensions: { width: number; height: number };
  input_dimensions?: { width: number; height: number };
  fallback_used: boolean;
  output_format?: string;
  method?: string;
  timing?: {
    duration_ms?: number;
    python_startup_ms?: number;
    cv2_import_ms?: number;
    warp_ms?: number;
    output_ms?: number;
  };
  error?: string;
}

export interface RunFastPerspectiveWarpResult {
  outputBuffer: Buffer;
  confidence: number;
  width: number;
  height: number;
  aiWarp: AIWarpMetadata;
}

const serviceDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(serviceDir, '../../..');
const repoRoot = path.resolve(packageRoot, '..', '..');

const DEFAULT_SCRIPT = 'packages/backend/python/fast_perspective_warp.py';

function getFastWarpScriptPath(): string {
  return process.env.FAST_PERSPECTIVE_WARP_SCRIPT?.trim() || DEFAULT_SCRIPT;
}

async function resolveReadablePath(configuredPath: string): Promise<string> {
  const normalized = configuredPath.replace(/\\/g, '/');
  const packageRelative = normalized.replace(/^packages\/backend\//, '');
  const candidates = [
    path.resolve(process.cwd(), configuredPath),
    path.resolve(packageRoot, configuredPath),
    path.resolve(repoRoot, configuredPath),
    path.resolve(packageRoot, packageRelative),
    path.resolve(repoRoot, packageRelative),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`Script fast warp não encontrado: ${configuredPath}`);
}

function imageExtensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return '.jpg';
  }
}

function buildFailureMetadata(
  error: string,
  timeout = false,
  partial?: Partial<AIWarpMetadata>
): AIWarpMetadata {
  return {
    attempted: true,
    method: 'python-fast-script',
    success: false,
    timeout,
    error,
    ...partial,
  };
}

function metadataFromPayload(payload: FastPerspectiveWarpPayload): AIWarpMetadata {
  return {
    attempted: true,
    method: 'python-fast-script',
    success: payload.success,
    durationMs: payload.timing?.duration_ms,
    pythonStartupMs: payload.timing?.python_startup_ms,
    cv2ImportMs: payload.timing?.cv2_import_ms,
    warpMs: payload.timing?.warp_ms,
    outputMs: payload.timing?.output_ms,
    inputWidth: payload.input_dimensions?.width,
    inputHeight: payload.input_dimensions?.height,
    outputWidth: payload.final_dimensions?.width,
    outputHeight: payload.final_dimensions?.height,
    error: payload.error,
  };
}

async function runPythonScript(
  scriptPath: string,
  inputPath: string,
  outputPath: string,
  cornersFilePath: string,
  timeoutMs: number
): Promise<FastPerspectiveWarpPayload> {
  return await new Promise((resolve, reject) => {
    const args = [
      scriptPath,
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--corners-file',
      cornersFilePath,
      '--json',
    ];
    const child = spawn(config.documentProcessor.pythonBinary, args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | undefined;

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Fast warp timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const jsonLine = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .find((line) => line.startsWith('{') && line.endsWith('}'));

      if (!jsonLine) {
        reject(new Error(stderr.trim() || `Fast warp exited with code ${code ?? 'unknown'}`));
        return;
      }

      try {
        resolve(JSON.parse(jsonLine) as FastPerspectiveWarpPayload);
      } catch (error) {
        reject(
          new Error(
            `Falha ao interpretar JSON do fast warp: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }
    });
  });
}

export async function runFastPerspectiveWarp(
  imageBuffer: Buffer,
  mimeType: string,
  corners: DocumentImagePoint[],
  timeoutMs: number
): Promise<RunFastPerspectiveWarpResult> {
  if (!config.documentProcessor.enabled) {
    throw new Error('Processador de documento desabilitado (DOCUMENT_PROCESSOR_ENABLED=false).');
  }

  const scriptPath = await resolveReadablePath(getFastWarpScriptPath());
  const tempRoot = path.resolve(process.cwd(), config.documentProcessor.tempDir || os.tmpdir());
  const tempDir = path.join(tempRoot, `fast-warp-${randomUUID()}`);
  const inputPath = path.join(tempDir, `input${imageExtensionFromMimeType(mimeType)}`);
  const outputPath = path.join(tempDir, 'output.jpg');
  const cornersFilePath = path.join(tempDir, 'corners.json');

  await fs.mkdir(tempDir, { recursive: true });

  try {
    await fs.writeFile(inputPath, imageBuffer);
    await fs.writeFile(cornersFilePath, JSON.stringify(corners), 'utf8');

    let payload: FastPerspectiveWarpPayload;
    try {
      payload = await runPythonScript(
        scriptPath,
        inputPath,
        outputPath,
        cornersFilePath,
        timeoutMs
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fast warp failed';
      const timeout = message.includes('timeout');
      throw Object.assign(new Error(message), {
        aiWarp: buildFailureMetadata(message, timeout),
      });
    }

    const aiWarp = metadataFromPayload(payload);
    if (!payload.success) {
      throw Object.assign(new Error(payload.error || 'Fast warp falhou.'), { aiWarp });
    }

    const outputBuffer = await fs.readFile(outputPath);
    return {
      outputBuffer,
      confidence: payload.confidence,
      width: payload.final_dimensions.width,
      height: payload.final_dimensions.height,
      aiWarp: { ...aiWarp, success: true },
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function extractAIWarpFromError(error: unknown): AIWarpMetadata | undefined {
  if (error && typeof error === 'object' && 'aiWarp' in error) {
    return (error as { aiWarp?: AIWarpMetadata }).aiWarp;
  }
  return undefined;
}
