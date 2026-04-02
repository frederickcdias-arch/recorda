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
