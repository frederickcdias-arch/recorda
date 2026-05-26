import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import sharp from 'sharp';
import { authorize } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { processMapImage, type ProcessMapImageInput } from '../../services/map-image-processor.js';
import { getCurrentUser } from './operacional-helpers.js';

const UPLOADS_BASE = path.resolve(process.cwd(), 'uploads');
const MAPAS_DIR = path.join(UPLOADS_BASE, 'mapas');
const MAPAS_ORIGINAL_DIR = path.join(MAPAS_DIR, 'original');
const MAPAS_CORRIGIDAS_DIR = path.join(MAPAS_DIR, 'corrigidas');
const MAPAS_THUMBS_DIR = path.join(MAPAS_DIR, 'thumbs');
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const capturasMapaBodySchema = z.object({
  imagemBase64: z.string().min(1, 'imagemBase64 e obrigatoria'),
  imagemCorrigidaBase64: z.string().optional(),
  manualCorners: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
      })
    )
    .length(4)
    .optional(),
  detectedCorners: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
      })
    )
    .length(4)
    .optional(),
});

const capturaIdParamsSchema = z.object({
  id: z.string().uuid('ID invalido'),
});

type ManualCorner = { x: number; y: number };

function parseImageDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  const mimeType = match?.[1];
  const payload = match?.[2];
  if (!mimeType || !payload || !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Imagem invalida. Envie JPEG, PNG ou WEBP em data URI base64.');
  }

  const buffer = Buffer.from(payload.replace(/\s+/g, ''), 'base64');
  if (buffer.length === 0) {
    throw new Error('Imagem vazia.');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Imagem muito grande. Tamanho maximo permitido: 10MB.');
  }

  return { mimeType, buffer };
}

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

function processingStatusFromFallback(fallback: boolean): string {
  return fallback ? 'processado_com_fallback' : 'concluido';
}

function mimeTypeFromRelativePath(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function resolveUploadPath(relativePath: string): string {
  const fullPath = path.resolve(UPLOADS_BASE, relativePath);
  const uploadsRoot = `${UPLOADS_BASE}${path.sep}`;
  if (fullPath !== UPLOADS_BASE && !fullPath.startsWith(uploadsRoot)) {
    throw new Error('Caminho de arquivo invalido.');
  }
  return fullPath;
}

type CaptureFileRow = {
  arquivo_path: string | null;
  arquivo_original_path: string | null;
  arquivo_corrigido_path: string | null;
  thumbnail_path: string | null;
};

async function deleteCaptureFiles(rows: CaptureFileRow[]): Promise<void> {
  const relativePaths = Array.from(
    new Set(
      rows.flatMap((row) =>
        [
          row.arquivo_path,
          row.arquivo_original_path,
          row.arquivo_corrigido_path,
          row.thumbnail_path,
        ].filter((value): value is string => Boolean(value))
      )
    )
  );

  await Promise.all(
    relativePaths.map(async (relativePath) => {
      const filePath = resolveUploadPath(relativePath);
      await fs.unlink(filePath).catch(() => {
        // Ignora se o arquivo ja nao existe
      });
    })
  );
}

export function createCapturasMapaRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    server.post(
      '/colaborador/capturas-mapa',
      {
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
          tags: ['colaborador'],
          summary: 'Processar e salvar captura de mapa',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            required: ['imagemBase64'],
            properties: {
              imagemBase64: { type: 'string' },
              imagemCorrigidaBase64: { type: 'string' },
              manualCorners: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['x', 'y'],
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                  },
                },
              },
              detectedCorners: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['x', 'y'],
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                  },
                },
              },
            },
          },
          response: {
            201: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } } },
            500: { type: 'object', properties: { error: { type: 'string' } } },
          },
        },
        preHandler: [
          server.authenticate,
          authorize('colaborador'),
          validateBody(capturasMapaBodySchema),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { imagemBase64, imagemCorrigidaBase64, manualCorners, detectedCorners } =
          request.body as {
            imagemBase64: string;
            imagemCorrigidaBase64?: string;
            manualCorners?: ManualCorner[];
            detectedCorners?: ManualCorner[];
          };

        try {
          const original = parseImageDataUrl(imagemBase64);
          const originalMeta = await sharp(original.buffer, { failOn: 'none' }).metadata();
          const correctedPreview = imagemCorrigidaBase64
            ? parseImageDataUrl(imagemCorrigidaBase64)
            : null;
          const safeCorners =
            manualCorners?.length === 4
              ? manualCorners.map((corner) => ({
                  x: Number(corner.x),
                  y: Number(corner.y),
                }))
              : undefined;
          const safeDetectedCorners =
            detectedCorners?.length === 4
              ? detectedCorners.map((corner) => ({
                  x: Number(corner.x),
                  y: Number(corner.y),
                }))
              : undefined;

          const processInput: ProcessMapImageInput = {
            imagemBase64,
            imagemCorrigidaBase64,
            manualCorners: safeCorners,
            detectedCorners: safeDetectedCorners,
          };
          const fileBaseName = `mapa-${user.id}-${Date.now()}-${randomUUID()}`;
          const originalName = `${fileBaseName}-original.${extensionFromMimeType(original.mimeType)}`;

          await fs.mkdir(MAPAS_ORIGINAL_DIR, { recursive: true });
          await fs.mkdir(MAPAS_CORRIGIDAS_DIR, { recursive: true });
          await fs.mkdir(MAPAS_THUMBS_DIR, { recursive: true });

          await fs.writeFile(path.join(MAPAS_ORIGINAL_DIR, originalName), original.buffer);

          let processedBase64: string;
          let thumbnailBase64: string | undefined;
          let tamanhoBytes: number;
          let confiancaDeteccao: number;
          let fallbackUsado: boolean;
          let dimensoesFinais: { width: number; height: number };
          let processador: string;
          let metadata:
            | {
                originalWidth?: number;
                originalHeight?: number;
                documentClass?:
                  | 'map_document'
                  | 'color_document'
                  | 'text_document'
                  | 'low_confidence_capture';
                decision?:
                  | 'frontend_assisted'
                  | 'python_detected'
                  | 'backend_manual_corners'
                  | 'backend_detected_corners'
                  | 'safe_fallback'
                  | 'manual_review_recommended';
                analysis?: {
                  paperLikeRatio: number;
                  colorRatio: number;
                  edgeDensity: number;
                  dynamicRange: number;
                  fillFrameLikelihood: number;
                };
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
                corners?: ManualCorner[];
                warnings?: string[];
              }
            | undefined;
          let processamentoStatus = 'concluido';

          try {
            const processedResult = await processMapImage(processInput);
            processedBase64 = processedResult.processedBase64;
            thumbnailBase64 = processedResult.thumbnailBase64;
            tamanhoBytes = processedResult.tamanhoBytes;
            confiancaDeteccao = processedResult.confiancaDeteccao;
            fallbackUsado = processedResult.fallbackUsado;
            dimensoesFinais = processedResult.dimensoesFinais;
            processador = processedResult.processador;
            metadata = processedResult.metadata;
            processamentoStatus = processingStatusFromFallback(fallbackUsado);
          } catch (processingError) {
            processedBase64 = imagemBase64;
            thumbnailBase64 = undefined;
            tamanhoBytes = original.buffer.length;
            confiancaDeteccao = 0;
            fallbackUsado = true;
            dimensoesFinais = {
              width: originalMeta.width ?? 0,
              height: originalMeta.height ?? 0,
            };
            processador = 'sharp-fallback';
            metadata = {
              originalWidth: originalMeta.width ?? 0,
              originalHeight: originalMeta.height ?? 0,
              warnings: [
                processingError instanceof Error
                  ? processingError.message
                  : 'Falha ao processar imagem; original preservado.',
              ],
            };
            processamentoStatus = 'falhou_processamento';
          }

          const processed = parseImageDataUrl(processedBase64);
          const correctedName = `${fileBaseName}-corrigida.${extensionFromMimeType(processed.mimeType)}`;
          const thumbName = `${fileBaseName}-thumb.jpg`;
          const thumbnail = thumbnailBase64 ? parseImageDataUrl(thumbnailBase64) : null;

          if (dimensoesFinais.width === 0 || dimensoesFinais.height === 0) {
            dimensoesFinais = {
              width: Number(metadata?.originalWidth ?? 0),
              height: Number(metadata?.originalHeight ?? 0),
            };
          }

          await fs.writeFile(path.join(MAPAS_CORRIGIDAS_DIR, correctedName), processed.buffer);
          if (thumbnail) {
            await fs.writeFile(path.join(MAPAS_THUMBS_DIR, thumbName), thumbnail.buffer);
          }

          const arquivoOriginalPath = path.posix.join('mapas', 'original', originalName);
          const arquivoCorrigidoPath = path.posix.join('mapas', 'corrigidas', correctedName);
          const thumbnailPath = thumbnail ? path.posix.join('mapas', 'thumbs', thumbName) : null;
          const processamentoMetadata = {
            originalMimeType: original.mimeType,
            correctedMimeType: processed.mimeType,
            originalWidth: metadata?.originalWidth ?? null,
            originalHeight: metadata?.originalHeight ?? null,
            width: dimensoesFinais.width,
            height: dimensoesFinais.height,
            documentClass: metadata?.documentClass ?? null,
            decision: metadata?.decision ?? null,
            analysis: metadata?.analysis ?? null,
            postprocess: metadata?.postprocess ?? null,
            manualCorners: safeCorners ?? null,
            detectedCorners: safeDetectedCorners ?? null,
            frontendCorrigida: Boolean(correctedPreview),
            warnings: metadata?.warnings ?? [],
          };

          const result = await server.database.query(
            `INSERT INTO capturas_mapa (
               usuario_id,
               arquivo_path,
               nome_arquivo,
               tamanho_bytes,
               arquivo_original_path,
               arquivo_corrigido_path,
               thumbnail_path,
               processamento_status,
               processamento_engine,
               processamento_confianca,
               processamento_fallback,
               processamento_metadata,
               processado_em
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW())
             RETURNING
               id,
               nome_arquivo,
               tamanho_bytes,
               criado_em,
               expira_em,
               arquivo_path,
               arquivo_original_path,
               arquivo_corrigido_path,
               thumbnail_path,
               processamento_status,
               processamento_engine,
               processamento_confianca,
               processamento_fallback,
               processamento_metadata`,
            [
              user.id,
              arquivoCorrigidoPath,
              correctedName,
              tamanhoBytes,
              arquivoOriginalPath,
              arquivoCorrigidoPath,
              thumbnailPath,
              processamentoStatus,
              processador,
              Number(confiancaDeteccao.toFixed(2)),
              fallbackUsado,
              JSON.stringify(processamentoMetadata),
            ]
          );

          const registro = result.rows[0] as {
            id: string;
            nome_arquivo: string;
            tamanho_bytes: number;
            criado_em: string;
            expira_em: string;
            arquivo_path: string;
            arquivo_original_path: string | null;
            arquivo_corrigido_path: string | null;
            thumbnail_path: string | null;
            processamento_status: string;
            processamento_engine: string | null;
            processamento_confianca: number | null;
            processamento_fallback: boolean;
            processamento_metadata: Record<string, unknown> | null;
          };

          const expiradas = await server.database.query<CaptureFileRow>(
            `DELETE FROM capturas_mapa
             WHERE usuario_id = $1 AND expira_em < NOW()
             RETURNING arquivo_path, arquivo_original_path, arquivo_corrigido_path, thumbnail_path`,
            [user.id]
          );
          await deleteCaptureFiles(expiradas.rows);

          return reply.status(201).send({
            id: registro.id,
            nomeArquivo: registro.nome_arquivo,
            tamanhoBytes: registro.tamanho_bytes,
            criadoEm: registro.criado_em,
            expiraEm: registro.expira_em,
            arquivoPath: registro.arquivo_path,
            arquivoOriginalPath: registro.arquivo_original_path,
            arquivoCorrigidoPath: registro.arquivo_corrigido_path,
            thumbnailPath: registro.thumbnail_path,
            imagemProcessada: processedBase64,
            processamento: {
              status: registro.processamento_status,
              engine: registro.processamento_engine,
              confidence: registro.processamento_confianca,
              fallback: registro.processamento_fallback,
              metadata: registro.processamento_metadata,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao processar imagem';
          server.log.error(error);
          if (
            message.includes('Imagem invalida') ||
            message.includes('Imagem vazia') ||
            message.includes('Imagem muito grande') ||
            message.includes('Tipo de imagem nao suportado')
          ) {
            return reply.status(400).send({ error: message });
          }
          return reply.status(500).send({ error: message });
        }
      }
    );

    server.get(
      '/colaborador/capturas-mapa',
      {
        schema: {
          tags: ['colaborador'],
          summary: 'Listar capturas de mapa do colaborador',
          security: [{ bearerAuth: [] }],
          response: {
            200: { type: 'object', additionalProperties: true },
            500: { type: 'object', properties: { error: { type: 'string' } } },
          },
        },
        preHandler: [server.authenticate, authorize('colaborador')],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        try {
          const result = await server.database.query(
            `SELECT id,
                    nome_arquivo,
                    tamanho_bytes,
                    criado_em,
                    expira_em,
                    thumbnail_path,
                    processamento_status,
                    processamento_engine,
                    processamento_confianca,
                    processamento_fallback
             FROM capturas_mapa
             WHERE usuario_id = $1 AND expira_em > NOW()
             ORDER BY criado_em DESC`,
            [user.id]
          );
          return reply.send({ capturas: result.rows });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao listar capturas';
          return reply.status(500).send({ error: message });
        }
      }
    );

    server.get(
      '/colaborador/capturas-mapa/:id/download',
      {
        schema: {
          tags: ['colaborador'],
          summary: 'Download de captura de mapa',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        preHandler: [
          server.authenticate,
          authorize('colaborador'),
          validateParams(capturaIdParamsSchema),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params as { id: string };

        try {
          const result = await server.database.query(
            `SELECT
               COALESCE(arquivo_corrigido_path, arquivo_path) AS download_path,
               arquivo_original_path,
               nome_arquivo,
               expira_em
             FROM capturas_mapa
             WHERE id = $1 AND usuario_id = $2`,
            [id, user.id]
          );

          if (result.rows.length === 0) {
            return reply.status(404).send({ error: 'Captura nao encontrada' });
          }

          const row = result.rows[0] as {
            download_path: string | null;
            arquivo_original_path: string | null;
            nome_arquivo: string;
            expira_em: string;
          };

          if (new Date(row.expira_em) < new Date()) {
            return reply.status(410).send({ error: 'Captura expirada e nao disponivel' });
          }

          const relativePath = row.download_path || row.arquivo_original_path;
          if (!relativePath) {
            return reply.status(404).send({ error: 'Arquivo nao encontrado no servidor' });
          }

          const filePath = resolveUploadPath(relativePath);
          const fileBuffer = await fs.readFile(filePath);

          return reply
            .header('Content-Type', mimeTypeFromRelativePath(relativePath))
            .header('Content-Disposition', `attachment; filename="${row.nome_arquivo}"`)
            .header('Cache-Control', 'private, max-age=3600')
            .send(fileBuffer);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return reply.status(404).send({ error: 'Arquivo nao encontrado no servidor' });
          }
          const message = error instanceof Error ? error.message : 'Erro ao baixar arquivo';
          return reply.status(500).send({ error: message });
        }
      }
    );

    server.delete(
      '/colaborador/capturas-mapa/:id',
      {
        schema: {
          tags: ['colaborador'],
          summary: 'Excluir captura de mapa',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        preHandler: [
          server.authenticate,
          authorize('colaborador'),
          validateParams(capturaIdParamsSchema),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params as { id: string };

        try {
          const result = await server.database.query(
            `DELETE FROM capturas_mapa WHERE id = $1 AND usuario_id = $2
             RETURNING arquivo_path, arquivo_original_path, arquivo_corrigido_path, thumbnail_path`,
            [id, user.id]
          );

          if (result.rows.length === 0) {
            return reply.status(404).send({ error: 'Captura nao encontrada' });
          }

          const row = result.rows[0] as CaptureFileRow;
          await deleteCaptureFiles([row]);

          return reply.send({ ok: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao excluir captura';
          return reply.status(500).send({ error: message });
        }
      }
    );
  };
}
