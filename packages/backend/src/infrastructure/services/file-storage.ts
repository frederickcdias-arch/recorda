import { promises as fs } from 'fs';
import path from 'path';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';

export interface FileStorageOptions {
  maxSize?: number; // bytes
  allowedTypes?: string[];
}

export class FileStorageService {
  private readonly uploadsDir = 'uploads';
  private readonly maxSize: number;
  private readonly allowedTypes: Set<string>;

  constructor(options: FileStorageOptions = {}) {
    this.maxSize = options.maxSize ?? 10 * 1024 * 1024; // 10MB
    this.allowedTypes = new Set(
      options.allowedTypes ?? [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
        'application/vnd.ms-excel', // xls
        'text/csv', // csv
        'application/pdf', // pdf
      ]
    );
  }

  async ensureDirs(): Promise<void> {
    await fs.mkdir(path.join(this.uploadsDir, 'planilhas'), { recursive: true });
    await fs.mkdir(path.join(this.uploadsDir, 'ocr'), { recursive: true });
  }

  async saveFile(
    file: { filename: string; mimetype: string; toBuffer(): Promise<Buffer> },
    category: 'planilhas' | 'ocr'
  ): Promise<string> {
    if (!this.allowedTypes.has(file.mimetype)) {
      throw new Error(`Tipo de arquivo não permitido: ${file.mimetype}`);
    }

    const buffer = await file.toBuffer();
    if (buffer.length > this.maxSize) {
      throw new Error(`Arquivo muito grande. Máximo permitido: ${this.maxSize} bytes`);
    }

    await this.ensureDirs();

    const timestamp = Date.now();
    const safeFilename = `${timestamp}_${file.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(this.uploadsDir, category, safeFilename);
    const fullPath = path.resolve(filePath);

    await fs.writeFile(fullPath, buffer);
    return filePath;
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      const fullPath = path.resolve(filePath);
      await fs.unlink(fullPath);
    } catch {
      // Ignorar erro se arquivo não existir
    }
  }

  static async fromRequest(
    request: FastifyRequest,
    fieldName: string,
    category: 'planilhas' | 'ocr',
    options?: FileStorageOptions
  ): Promise<string | null> {
    const storage = new FileStorageService(options);
    const data = await request.file({ limits: { fileSize: storage.maxSize } });

    if (!data || data.fieldname !== fieldName) {
      return null;
    }

    return storage.saveFile(data, category);
  }
}

// ─── Ausências attachment helpers ─────────────────────────────────────────────

export const AUSENCIA_ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export const AUSENCIA_MAX_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Validates and persists a file attachment for an ausência.
 * Returns a forward-slash relative path (e.g. uploads/ausencias/<filename>)
 * suitable for storage in the `documento_anexo` column.
 */
export async function saveAusenciaAnexo(file: {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}): Promise<string> {
  if (!AUSENCIA_ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new Error('Tipo de arquivo não permitido. Formatos aceitos: PDF, JPG, PNG.');
  }
  if (file.buffer.length > AUSENCIA_MAX_SIZE) {
    throw new Error('Arquivo muito grande. Máximo permitido: 5 MB.');
  }

  const timestamp = Date.now();
  const safeFilename = `${timestamp}_${file.filename.replace(/[^a-zA-Z0-9.\-]/g, '_')}`;
  const absDir = path.resolve(process.cwd(), 'uploads', 'ausencias');

  // Path traversal guard
  const destPath = path.resolve(absDir, safeFilename);
  if (!destPath.startsWith(absDir + path.sep)) {
    throw new Error('Nome de arquivo inválido.');
  }

  await fs.mkdir(absDir, { recursive: true });
  await fs.writeFile(destPath, file.buffer);

  // Return portable relative path using forward slashes
  return `uploads/ausencias/${safeFilename}`;
}

/**
 * Resolves a stored relative path (e.g. "uploads/ausencias/<filename>")
 * to an absolute path applying path-traversal protection, then reads the file.
 *
 * Returns the file buffer, the correct MIME type and the basename.
 * Throws with code 'INVALID_PATH' on traversal attempts,
 *        with code 'INVALID_TYPE' on unsupported extensions,
 *        with code 'ENOENT'       when the file is not found on disk.
 */
export async function serveAusenciaAnexo(relativePath: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  filename: string;
}> {
  const normalizeMimeType = (value: string | null | undefined, fallbackPath: string): string | null => {
    const normalized = (value ?? '').toLowerCase();
    if (normalized.includes('pdf')) return 'application/pdf';
    if (normalized.includes('png')) return 'image/png';
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'image/jpeg';

    const ext = path.extname(fallbackPath).toLowerCase();
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return null;
  };

  const looksLikeUrl = /^https?:\/\//i.test(relativePath) || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(relativePath);
  if (looksLikeUrl) {
    const normalizedUrl = /^https?:\/\//i.test(relativePath) ? relativePath : `https://${relativePath}`;
    const response = await fetch(normalizedUrl);
    if (!response.ok) {
      throw Object.assign(new Error('Arquivo de anexo não encontrado no servidor.'), {
        code: 'ENOENT',
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = path.basename(new URL(normalizedUrl).pathname) || 'anexo';
    const mimeType = normalizeMimeType(response.headers.get('content-type'), filename);
    if (!mimeType) {
      throw Object.assign(new Error('Tipo de arquivo não suportado.'), { code: 'INVALID_TYPE' });
    }

    return { buffer, mimeType, filename };
  }

  // Canonicalise to an absolute path and verify it stays inside uploads/ausencias/
  const allowedBase = path.resolve(process.cwd(), 'uploads', 'ausencias');
  const candidatePath = relativePath.startsWith('/uploads/') || relativePath.startsWith('\\uploads\\')
    ? relativePath.slice(1)
    : relativePath;
  const fullPath = path.resolve(process.cwd(), candidatePath);
  const basename = path.basename(fullPath);

  if (!fullPath.startsWith(allowedBase + path.sep)) {
    throw Object.assign(new Error('Caminho de arquivo inválido.'), { code: 'INVALID_PATH' });
  }

  const mimeType = normalizeMimeType(null, fullPath);

  if (!mimeType) {
    throw Object.assign(new Error('Tipo de arquivo não suportado.'), { code: 'INVALID_TYPE' });
  }

  let resolvedPath = fullPath;
  try {
    await fs.access(resolvedPath);
  } catch {
    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    try {
      const matches: string[] = [];
      const walk = async (dir: string): Promise<void> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const candidate = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(candidate);
            continue;
          }
          if (entry.isFile() && entry.name === basename) {
            matches.push(candidate);
          }
        }
      };
      await walk(uploadsRoot);
      if (matches.length > 0) {
        resolvedPath = matches[0]!;
      }
    } catch {
      // ignore and fail below
    }
  }

  const buffer = await fs.readFile(resolvedPath);
  const filename = path.basename(resolvedPath);
  return { buffer, mimeType, filename };
}
