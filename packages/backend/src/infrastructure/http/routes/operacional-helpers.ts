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
    s.replace(/[Oo]/g, '0').replace(/[lIi]/g, '1').replace(/[Ss]/g, '5').replace(/[Bb]/g, '8');

  // Remove spaces that OCR may insert within digit groups, then fix OCR digit errors
  const cleanNum = (s: string) => fixOcrDigits(s.replace(/\s+/g, '').trim());

  const ocrChar = '\\dOIl';
  const protocoloSegmentOcr = `[${ocrChar}][\\s${ocrChar}]{0,5}[\\/\\.\\-][${ocrChar}][\\s${ocrChar}]{0,3}`;

  // --- Protocolo ---
  // Strict digit patterns first; OCR-tolerant patterns as fallback (O→0, l→1 after cleanNum).
  const protocoloPatterns: RegExp[] = [
    /protocolo\s*n[º°.]?\s*[.:][^\d]{0,6}(\d[\d ]{0,5}[/.\-]\d[\d ]{0,5})/i,
    /protocolo\s*:?[^\d]{0,6}(\d[\d ]{0,5}[/.\-]\d[\d ]{0,5})/i,
    /processo\s+n[º°.]?\s*[.:]*[^\d]{0,4}(\d[\d ]{0,5}[/.\-]\d[\d ]{0,5})/i,
    /processo\s*:\s*[^\d]{0,4}(\d[\d ]{0,5}[/.\-]\d[\d ]{0,5})/i,
    /prot[o.]?\s*[.:]\s*[^\d]{0,4}(\d[\d ]{0,5}[/.\-]\d[\d ]{0,5})/i,
    /n[º°]\s*(\d[\d ]{0,5}[/]\d[\d ]{0,5})/i,
    /\b(\d{3,}[\d ]{0,4}\/\d{4})\b/,
    /\b(\d{3,}[\d ]{0,4}\/\d{2})\b/,
    /\b(\d{4,}-\d{4})\b/,
    new RegExp(`protocolo\\s*n[º°.]?\\s*[.:][^\\dOIl]{0,6}(${protocoloSegmentOcr})`, 'i'),
    new RegExp(`protocolo\\s*:?[^\\dOIl]{0,6}(${protocoloSegmentOcr})`, 'i'),
    new RegExp(`processo\\s+n[º°.]?\\s*[.:]*[^\\dOIl]{0,4}(${protocoloSegmentOcr})`, 'i'),
    new RegExp(`processo\\s*:\\s*[^\\dOIl]{0,4}(${protocoloSegmentOcr})`, 'i'),
    new RegExp(`prot[o.]?\\s*[.:]\\s*[^\\dOIl]{0,4}(${protocoloSegmentOcr})`, 'i'),
    new RegExp(`n[º°]\\s*(${protocoloSegmentOcr})`, 'i'),
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
  const labelPattern = /(?:interessad[oa](?:\(a\))?|requerente)\s*:?/i;
  const intIdx = lines.findIndex((l) => labelPattern.test(l));
  if (intIdx !== -1) {
    // Extract value after the label on the same line
    let afterLabel = (lines[intIdx] ?? '')
      .replace(labelPattern, '')
      .replace(/^[\s:]+/, '')
      .trim();

    // Stop at the next field label if it appears on the same line
    const stopPattern =
      /\b(?:assunto|resumo|setor|volume|data|protocolo|processo|origem)\b\s*[:;]/i;
    const stopIndex = afterLabel.search(stopPattern);
    if (stopIndex !== -1) {
      afterLabel = afterLabel.slice(0, stopIndex).trim();
    }

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

/** Sequência operacional principal (Recebimento → CQ). */
export const OPERACIONAL_FLUXO_ETAPAS: readonly EtapaFluxo[] = [
  'RECEBIMENTO',
  'PREPARACAO',
  'DIGITALIZACAO',
  'CONFERENCIA',
  'RECONFERENCIA',
  'CONTROLE_QUALIDADE',
] as const;

export interface TransicaoEtapaInvalida {
  ok: false;
  etapaAtual: EtapaFluxo;
  etapaDestino: EtapaFluxo;
  etapaEsperada: EtapaFluxo | null;
}

export type TransicaoEtapaResult = { ok: true } | TransicaoEtapaInvalida;

export function getProximaEtapaOperacional(etapaAtual: EtapaFluxo): EtapaFluxo | null {
  const idx = OPERACIONAL_FLUXO_ETAPAS.indexOf(etapaAtual);
  if (idx < 0 || idx >= OPERACIONAL_FLUXO_ETAPAS.length - 1) return null;
  return OPERACIONAL_FLUXO_ETAPAS[idx + 1] ?? null;
}

export function getEtapaAnteriorOperacional(etapaAtual: EtapaFluxo): EtapaFluxo | null {
  const idx = OPERACIONAL_FLUXO_ETAPAS.indexOf(etapaAtual);
  if (idx <= 0) return null;
  return OPERACIONAL_FLUXO_ETAPAS[idx - 1] ?? null;
}

export function validarTransicaoEtapaOperacional(
  etapaAtual: EtapaFluxo,
  etapaDestino: EtapaFluxo
): TransicaoEtapaResult {
  const proxima = getProximaEtapaOperacional(etapaAtual);
  const anterior = getEtapaAnteriorOperacional(etapaAtual);

  if (etapaDestino === proxima || etapaDestino === anterior) {
    return { ok: true };
  }

  const idxAtual = OPERACIONAL_FLUXO_ETAPAS.indexOf(etapaAtual);
  const idxDestino = OPERACIONAL_FLUXO_ETAPAS.indexOf(etapaDestino);
  const etapaEsperada =
    idxAtual >= 0 && idxDestino >= 0 && idxDestino > idxAtual
      ? proxima
      : idxAtual >= 0 && idxDestino >= 0 && idxDestino < idxAtual
        ? anterior
        : proxima;

  return {
    ok: false,
    etapaAtual,
    etapaDestino,
    etapaEsperada,
  };
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
