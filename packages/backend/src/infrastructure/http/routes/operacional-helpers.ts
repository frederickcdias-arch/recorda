import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { OperacionalPDFService } from '../../services/operacional-pdf-service.js';
import { OCRServiceDefault } from '../../services/ocr-service-default.js';

import type {
  EtapaFluxo,
  StatusRepositorio,
  ResultadoItemChecklist,
  TipoExcecao,
  StatusTratativa,
  ResultadoCQ,
  TipoRelatorioOperacional,
  OrigemDocumentoRecebimento,
} from '@recorda/shared';

export type {
  EtapaFluxo,
  StatusRepositorio,
  ResultadoItemChecklist,
  TipoExcecao,
  StatusTratativa,
  ResultadoCQ,
  TipoRelatorioOperacional,
  OrigemDocumentoRecebimento,
};

export interface OCRPreview {
  protocolo: string;
  interessado: string;
  textoExtraido: string;
  confianca: number;
}

export function getCurrentUser(request: { user?: unknown }): { id: string; perfil: string } {
  const user = request.user as { id: string; perfil: string } | undefined;
  if (!user?.id) {
    throw new Error('Usuário autenticado não encontrado');
  }
  return user;
}

/**
 * Returns the current date in Brazil timezone (America/Sao_Paulo) as YYYY-MM-DD string.
 * This avoids timezone issues when the server runs in UTC but users are in Brazil.
 */
export function getBrazilDateString(): string {
  const now = new Date();
  const brazilDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const year = brazilDate.getFullYear();
  const month = String(brazilDate.getMonth() + 1).padStart(2, '0');
  const day = String(brazilDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function extractOCRPreview(texto: string, confianca: number): OCRPreview {
  const normalized = normalizeText(texto);
  const lines = texto.split(/\n/).map(l => l.trim()).filter(Boolean);

  // --- Protocolo ---
  // Fix common OCR errors: O→0, l→1, I→1, S→5, B→8
  const fixOcrDigits = (s: string) => s.replace(/[Oo]/g, '0').replace(/[lIi]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
  
  // Try multiple patterns in order of specificity
  // Note: OCR may introduce artifacts like extra hyphens, pipes, etc.
  const protocoloPatterns = [
    // "Protocolo n.: 13142/2024" or "Protocolo n.:-13142/2024" (with OCR artifacts)
    /protocolo\s*n[º°.]?\s*[.:][\s\-|]*([0-9OoIl]{3,}[\/.\-][0-9OoIl]{2,4})/i,
    // "Protocolo: 123456/2024" or "Protocolo n. 123456/2024"
    /protocolo\s*n?[º°.]?\s*:?[\s\-|]*([0-9OoIl]{3,}[\/.\-][0-9OoIl]{2,4})/i,
    // "Protocolo: 123456-2024" with dash
    /protocolo\s*n?[º°.]?\s*:?[\s\-|]*([0-9OoIl]{4,}[\-][0-9OoIl]{2,4})/i,
    // "Protocolo: 123456" (no year separator)
    /protocolo\s*n?[º°.]?\s*:?[\s\-|]*([0-9OoIl]{4,})/i,
    // "Prot:" or "Prot." abbreviation
    /prot[.:]?[\s\-|]*([0-9OoIl]{3,}[\/.\-]?[0-9OoIl]{0,4})/i,
    // "Nº 123456/2024" standalone
    /n[º°][\s\-|]*([0-9OoIl]{3,}[\/.\-][0-9OoIl]{2,4})/i,
    // Standalone pattern: 5+ digits followed by /year (common in government docs)
    /\b([0-9OoIl]{4,}[\/][0-9OoIl]{4})\b/,
    // Standalone pattern: 5+ digits followed by /2-digit year
    /\b([0-9OoIl]{4,}[\/][0-9OoIl]{2})\b/,
  ];
  
  let protocolo = '';
  for (const pattern of protocoloPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      protocolo = fixOcrDigits(match[1].trim());
      break;
    }
  }

  // --- Interessado ---
  const interessadoMatch = normalized.match(/interessad[oa()\s]*:?\s*(.+?)(?=\s*assunto|\s*resumo|$)/i);
  let interessado = interessadoMatch?.[1]?.trim() ?? '';
  interessado = interessado.replace(/\s*(assunto|resumo|setor|volume|data|protocolo).*/i, '').trim();
  if (!interessado) {
    const intLine = lines.find(l => /interessad/i.test(l));
    if (intLine) {
      interessado = intLine.replace(/^.*interessad[oa()\s]*:?\s*/i, '').trim();
    }
  }

  return {
    protocolo,
    interessado,
    textoExtraido: texto,
    confianca,
  };
}

export async function saveOCRImageBase64(imagemBase64: string, prefix: string): Promise<string | null> {
  if (!imagemBase64?.startsWith('data:image/')) {
    return null;
  }

  const match = imagemBase64.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) {
    return null;
  }
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const payload = match[2] ?? '';
  const buffer = Buffer.from(payload, 'base64');
  const relativePath = `ocr-recebimento/${prefix}-${Date.now()}.${ext}`;
  const uploadsBase = path.resolve(process.cwd(), 'uploads');
  const fullPath = path.join(uploadsBase, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
  return relativePath;
}

export async function loadRepositorio(server: FastifyInstance, repositorioId: string): Promise<{
  id_repositorio_recorda: string;
  etapa_atual: EtapaFluxo;
  status_atual: StatusRepositorio;
} | null> {
  const result = await server.database.query<{
    id_repositorio_recorda: string;
    etapa_atual: EtapaFluxo;
    status_atual: StatusRepositorio;
  }>(
    `SELECT id_repositorio_recorda, etapa_atual, status_atual
     FROM repositorios
     WHERE id_repositorio_recorda = $1`,
    [repositorioId]
  );

  return result.rows[0] ?? null;
}

export async function saveOperationalReport(args: {
  server: FastifyInstance;
  userId: string;
  tipo: TipoRelatorioOperacional;
  snapshot: Record<string, unknown>;
  pdfBuffer: Buffer;
  repositorioId?: string;
  loteId?: string;
}): Promise<{
  id: string;
  tipo: string;
  repositorio_id: string | null;
  lote_id: string | null;
  arquivo_path: string;
  hash_arquivo: string;
  gerado_em: string;
}> {
  const { server, userId, tipo, snapshot, pdfBuffer, repositorioId = null, loteId = null } = args;
  const snapshotRaw = JSON.stringify(snapshot);
  const hash = createHash('sha256').update(snapshotRaw).digest('hex');
  const baseFolder = tipo.toLowerCase();
  const targetCode =
    (snapshot.lote as { codigo?: string } | undefined)?.codigo ??
    (snapshot.repositorio as { id_repositorio_ged?: string } | undefined)?.id_repositorio_ged ??
    'registro';
  const safeCode = String(targetCode).replace(/[^a-zA-Z0-9_-]/g, '_');
  const relativePath = `relatorios/${baseFolder}/${safeCode}-${Date.now()}.pdf`;
  const uploadsBase = path.resolve(process.cwd(), 'uploads');
  const fullPath = path.join(uploadsBase, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, pdfBuffer);

  const insertResult = await server.database.query<{
    id: string;
    tipo: string;
    repositorio_id: string | null;
    lote_id: string | null;
    arquivo_path: string;
    hash_arquivo: string;
    gerado_em: string;
  }>(
    `INSERT INTO relatorios_operacionais (
       tipo, repositorio_id, lote_id, arquivo_path, hash_arquivo, dados_snapshot, gerado_por
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     RETURNING id, tipo, repositorio_id, lote_id, arquivo_path, hash_arquivo, gerado_em`,
    [tipo, repositorioId, loteId, relativePath, hash, snapshotRaw, userId]
  );

  const created = insertResult.rows[0];
  if (!created) {
    throw new Error('Falha ao persistir relatório operacional');
  }
  return created;
}

export function createPDFService(): OperacionalPDFService {
  return new OperacionalPDFService();
}

export function createOCRService(): OCRServiceDefault {
  return new OCRServiceDefault();
}
