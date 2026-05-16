import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';

export interface PythonDocumentProcessorResult {
  processedBase64: string;
  tamanhoBytes: number;
  confiancaDeteccao: number;
  fallbackUsado: boolean;
  dimensoesFinais: {
    width: number;
    height: number;
  };
  processador: 'python-opencv' | 'opencv-manual-corners' | 'opencv-detected-corners';
  postprocess?: {
    manualMode?: string | null;
    cornersSource: string;
    manualCornersReceived: boolean;
    pythonUsed: boolean;
    manualFinalizeUsed: boolean;
    borderCleanup: boolean;
    isolateExterior: boolean;
    marginMode: string;
    paperNormalization: string | boolean;
    shadowBalance: boolean;
    onlyWarpAndMargin?: boolean;
    contentPreserved: boolean;
  };
}

interface PythonDocumentProcessorPayload {
  success: boolean;
  output_path: string;
  confidence: number;
  final_dimensions: {
    width: number;
    height: number;
  };
  fallback_used: boolean;
  error?: string;
  output_format?: string;
  postprocess?: {
    manualMode?: string | null;
    cornersSource?: string;
    manualCornersReceived?: boolean;
    pythonUsed?: boolean;
    manualFinalizeUsed?: boolean;
    borderCleanup?: boolean;
    isolateExterior?: boolean;
    marginMode?: string;
    paperNormalization?: string | boolean;
    shadowBalance?: boolean;
    onlyWarpAndMargin?: boolean;
    contentPreserved?: boolean;
  };
}

export interface PythonProcessorCornersInput {
  points: Array<{ x: number; y: number }>;
  source: 'manual' | 'detected';
}

const serviceDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(serviceDir, '../../..');
const repoRoot = path.resolve(packageRoot, '..', '..');

function toContainerPath(relativeOrAbsolutePath: string): string {
  return path.posix.join('/workspace', relativeOrAbsolutePath.replace(/\\/g, '/'));
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

  throw new Error(`Arquivo nao encontrado para o processador de documento: ${configuredPath}`);
}

function parseImageDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const mimeType = match?.[1];
  const base64Payload = match?.[2];
  if (!mimeType || !base64Payload) {
    throw new Error('Imagem invalida. Envie base64 com data URI.');
  }

  return {
    mimeType,
    buffer: Buffer.from(base64Payload, 'base64'),
  };
}

function imageExtensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/heic':
    case 'image/heif':
      return '.heic';
    default:
      return '.jpg';
  }
}

function outputMimeType(format?: string): string {
  switch ((format || '').toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpeg':
    case 'jpg':
    default:
      return 'image/jpeg';
  }
}

async function runPythonProcessor(
  scriptPath: string,
  inputPath: string,
  outputPath: string,
  cornersFilePath?: string
): Promise<PythonDocumentProcessorPayload> {
  if (config.documentProcessor.runtime === 'docker') {
    return await runDockerProcessor(scriptPath, inputPath, outputPath, cornersFilePath);
  }

  try {
    return await runLocalPythonProcessor(scriptPath, inputPath, outputPath, cornersFilePath);
  } catch (error) {
    const shouldTryDocker =
      config.documentProcessor.runtime === 'auto' &&
      config.documentProcessor.dockerImage.trim().length > 0 &&
      error instanceof Error &&
      /enoent|not recognized|cannot find/i.test(error.message);

    if (!shouldTryDocker) {
      throw error;
    }

    return await runDockerProcessor(scriptPath, inputPath, outputPath, cornersFilePath);
  }
}

async function runLocalPythonProcessor(
  scriptPath: string,
  inputPath: string,
  outputPath: string,
  cornersFilePath?: string
): Promise<PythonDocumentProcessorPayload> {
  return await new Promise((resolve, reject) => {
    const args = [scriptPath, '--input', inputPath, '--output', outputPath, '--json'];
    if (cornersFilePath) {
      args.push('--corners-file', cornersFilePath);
    }
    const child = spawn(config.documentProcessor.pythonBinary, args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Document processor exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as PythonDocumentProcessorPayload);
      } catch (error) {
        reject(
          new Error(
            `Falha ao interpretar retorno do processador Python: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }
    });
  });
}

async function runDockerProcessor(
  scriptPath: string,
  inputPath: string,
  outputPath: string,
  cornersFilePath?: string
): Promise<PythonDocumentProcessorPayload> {
  const dockerImage = config.documentProcessor.dockerImage.trim();
  if (!dockerImage) {
    throw new Error(
      'DOCUMENT_PROCESSOR_DOCKER_IMAGE nao configurada para runtime docker do processador.'
    );
  }

  const workspacePath = repoRoot;
  const tempDir = path.dirname(inputPath);
  const containerScriptPath = toContainerPath(path.relative(workspacePath, scriptPath));
  const containerInputPath = `/work/${path.basename(inputPath)}`;
  const containerOutputPath = `/work/${path.basename(outputPath)}`;
  const containerCornersPath = cornersFilePath ? `/work/${path.basename(cornersFilePath)}` : null;
  const bootstrap = config.documentProcessor.dockerBootstrap.trim();
  const commandParts = bootstrap
    ? [
        bootstrap,
        `python ${containerScriptPath} --input ${containerInputPath} --output ${containerOutputPath} --json${
          containerCornersPath ? ` --corners-file ${containerCornersPath}` : ''
        }`,
      ]
    : [
        `python ${containerScriptPath} --input ${containerInputPath} --output ${containerOutputPath} --json${
          containerCornersPath ? ` --corners-file ${containerCornersPath}` : ''
        }`,
      ];

  return await new Promise((resolve, reject) => {
    const args = [
      'run',
      '--rm',
      '-v',
      `${workspacePath}:/workspace`,
      '-v',
      `${tempDir}:/work`,
      dockerImage,
      'bash',
      '-lc',
      commandParts.join(' ; '),
    ];

    const child = spawn('docker', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Document processor docker exited with code ${code}`));
        return;
      }

      const jsonLine = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .find((line) => line.startsWith('{') && line.endsWith('}'));

      if (!jsonLine) {
        reject(
          new Error(
            stderr.trim() ||
              'Falha ao interpretar retorno do processador Docker: nenhuma saida JSON encontrada.'
          )
        );
        return;
      }

      try {
        resolve(JSON.parse(jsonLine) as PythonDocumentProcessorPayload);
      } catch (error) {
        reject(
          new Error(
            `Falha ao interpretar retorno do processador Docker: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }
    });
  });
}

export async function tryProcessDocumentImageWithPython(
  imagemBase64: string,
  cornersInput?: PythonProcessorCornersInput
): Promise<PythonDocumentProcessorResult | null> {
  if (!config.documentProcessor.enabled) {
    return null;
  }

  const scriptPath = await resolveReadablePath(config.documentProcessor.scriptPath);

  const { mimeType, buffer } = parseImageDataUrl(imagemBase64);
  const tempRoot = path.resolve(process.cwd(), config.documentProcessor.tempDir || os.tmpdir());
  const tempDir = path.join(tempRoot, randomUUID());
  const inputPath = path.join(tempDir, `input${imageExtensionFromMimeType(mimeType)}`);
  const outputPath = path.join(tempDir, 'output.jpg');
  const cornersFilePath = cornersInput ? path.join(tempDir, 'corners.json') : undefined;

  await fs.mkdir(tempDir, { recursive: true });

  try {
    await fs.writeFile(inputPath, buffer);
    if (cornersFilePath && cornersInput) {
      await fs.writeFile(cornersFilePath, JSON.stringify(cornersInput.points), 'utf8');
    }
    const payload = await runPythonProcessor(scriptPath, inputPath, outputPath, cornersFilePath);
    if (!payload.success) {
      throw new Error(payload.error || 'Processamento do documento falhou.');
    }

    const resolvedOutputPath =
      config.documentProcessor.runtime === 'docker' ||
      (config.documentProcessor.runtime === 'auto' && payload.output_path.startsWith('/work/'))
        ? outputPath
        : payload.output_path || outputPath;
    const outputBuffer = await fs.readFile(resolvedOutputPath);
    const resultMimeType = outputMimeType(payload.output_format);

    return {
      processedBase64: `data:${resultMimeType};base64,${outputBuffer.toString('base64')}`,
      tamanhoBytes: outputBuffer.length,
      confiancaDeteccao: payload.confidence,
      fallbackUsado: payload.fallback_used,
      dimensoesFinais: payload.final_dimensions,
      processador: cornersInput
        ? cornersInput.source === 'manual'
          ? 'opencv-manual-corners'
          : 'opencv-detected-corners'
        : 'python-opencv',
      postprocess: payload.postprocess
        ? {
            manualMode: payload.postprocess.manualMode ?? null,
            cornersSource:
              payload.postprocess.cornersSource || (cornersInput?.source ?? 'auto-detect'),
            manualCornersReceived:
              payload.postprocess.manualCornersReceived === undefined
                ? Boolean(cornersInput?.source === 'manual')
                : Boolean(payload.postprocess.manualCornersReceived),
            pythonUsed:
              payload.postprocess.pythonUsed === undefined
                ? true
                : Boolean(payload.postprocess.pythonUsed),
            manualFinalizeUsed:
              payload.postprocess.manualFinalizeUsed === undefined
                ? Boolean(cornersInput?.source === 'manual')
                : Boolean(payload.postprocess.manualFinalizeUsed),
            borderCleanup: Boolean(payload.postprocess.borderCleanup),
            isolateExterior:
              payload.postprocess.isolateExterior === undefined
                ? cornersInput?.source !== 'manual'
                : Boolean(payload.postprocess.isolateExterior),
            marginMode: payload.postprocess.marginMode || 'clean-white',
            paperNormalization:
              payload.postprocess.paperNormalization === undefined
                ? 'soft'
                : payload.postprocess.paperNormalization,
            shadowBalance:
              payload.postprocess.shadowBalance === undefined
                ? true
                : Boolean(payload.postprocess.shadowBalance),
            onlyWarpAndMargin:
              payload.postprocess.onlyWarpAndMargin === undefined
                ? false
                : Boolean(payload.postprocess.onlyWarpAndMargin),
            contentPreserved:
              payload.postprocess.contentPreserved === undefined
                ? true
                : Boolean(payload.postprocess.contentPreserved),
          }
        : undefined,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
