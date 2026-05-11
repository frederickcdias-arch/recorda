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
 * Returns the current date in the official Recorda timezone (America/Cuiaba) as YYYY-MM-DD string.
 * This avoids timezone issues when the server runs in UTC but users are in Brazil.
 */
export function getBrazilDateString(): string {
  const now = new Date();
  const brazilDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Cuiaba' }));
  const year = brazilDate.getFullYear();
  const month = String(brazilDate.getMonth() + 1).padStart(2, '0');
  const day = String(brazilDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function extractOCRPreview(texto: string, confianca: number): OCRPreview {
  const lines = texto
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Join lines into a single string for pattern matching
  const normalized = lines.join(' ');

  // Fix common OCR character substitutions in numeric strings (applied only to matched groups)
  const fixOcrDigits = (s: string) =>
    s.replace(/[Oo]/g, '0').replace(/[lIi]/g, '1').replace(/S/g, '5').replace(/B/g, '8');

  // Remove spaces that OCR may insert within digit groups, then fix OCR digit errors
  const cleanNum = (s: string) => fixOcrDigits(s.replace(/\s+/g, '').trim());

  // --- Protocolo ---
  // Patterns ordered from most specific (keyword-anchored) to least specific (standalone number).
  // Each digit group allows up to ~3 stray spaces (OCR may split "502824" as "502 824").
  const protocoloPatterns: RegExp[] = [
    // "Protocolo n.: 13142/2024" — colon/period after n, possible OCR artifacts before digits
    /protocolo\s*n[º°.]?\s*[.:][^\d]{0,6}(\d[\d ]{0,5}[/.\-]\d[\d ]{0,5})/i,
    // "Protocolo: 502824/2021" or "Protocolo 502824/2021"
    /protocolo\s*:?[^\d]{0,6}(\d[\d ]{0,5}[/.\-]\d[\d ]{0,5})/i,
    // "Processo nº 123456/2024" or "Processo n. 123456/2024"
    /processo\s+n[º°.]?\s*[.:]*[^\d]{0,4}(\d[\d ]{0,5}[/.\-]\d[\d ]{0,5})/i,
    // "Processo: 123456/2024"
    /processo\s*:\s*[^\d]{0,4}(\d[\d ]{0,5}[/.\-]\d[\d ]{0,5})/i,
    // "Prot.: 123456/2024" abbreviation
    /prot[o.]?\s*[.:]\s*[^\d]{0,4}(\d[\d ]{0,5}[/.\-]\d[\d ]{0,5})/i,
    // "Nº 123456/2024" or "N.º 123456/2024"
    /n[º°]\s*(\d[\d ]{0,5}[/]\d[\d ]{0,5})/i,
    // Standalone: 4+ digits / 4-digit year (e.g., "502824/2021") — least specific
    /\b(\d{3,}[\d ]{0,4}\/\d{4})\b/,
    // Standalone: 4+ digits / 2-digit year
    /\b(\d{3,}[\d ]{0,4}\/\d{2})\b/,
    // With dash as year separator (e.g., "13142-2024")
    /\b(\d{4,}-\d{4})\b/,
  ];

  let protocolo = '';
  for (const pattern of protocoloPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      protocolo = cleanNum(match[1]);
      break;
    }
  }

  // --- Interessado ---
  let interessado = '';

  // Prefer line-by-line search: find the line with "Interessado" or "Requerente" label
  const labelPattern = /(?:interessad[oa]|requerente)\s*:?/i;
  const intIdx = lines.findIndex((l) => labelPattern.test(l));
  if (intIdx !== -1) {
    // Extract value after the label on the same line
    const afterLabel = (lines[intIdx] ?? '')
      .replace(labelPattern, '')
      .replace(/^[\s:]+/, '')
      .trim();
    if (afterLabel.length > 1) {
      interessado = afterLabel;
    } else if (lines[intIdx + 1] != null) {
      // Value might be on the next line — skip if it looks like another field label
      const next = lines[intIdx + 1] as string;
      if (!/^(?:assunto|resumo|setor|volume|data|protocolo|processo|origem)\s*:/i.test(next)) {
        interessado = next;
      }
    }
  }

  // Fallback: search in normalized text
  if (!interessado) {
    const m = normalized.match(
      /(?:interessad[oa]|requerente)\s*:?\s*([A-ZÀ-Úa-zà-ú][^:]{2,80}?)(?=\s*(?:assunto|resumo|setor|protocolo|processo)|$)/i
    );
    interessado = m?.[1]?.trim() ?? '';
  }

  // Strip stray OCR artifacts from the start/end of the interessado value
  interessado = interessado
    .replace(/^[:\-|]+\s*/, '')
    .replace(/[:\-|.]+$/, '')
    .trim();

  return {
    protocolo,
    interessado,
    textoExtraido: texto,
    confianca,
  };
}

export async function saveOCRImageBase64(
  imagemBase64: string,
  prefix: string
): Promise<string | null> {
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

export async function loadRepositorio(
  server: FastifyInstance,
  repositorioId: string
): Promise<{
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
