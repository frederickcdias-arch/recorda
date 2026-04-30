import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { EtiquetaPdfService } from '../../services/etiqueta-pdf-service.js';

function buildOutputFilename(filename: string): string {
  const sanitized = filename.replace(/[^\w.\-]+/g, '_');
  const withoutExtension = sanitized.toLowerCase().endsWith('.pdf')
    ? sanitized.slice(0, -4)
    : sanitized;

  return `${withoutExtension || 'etiquetas'}-4-por-folha.pdf`;
}

export function createOperacionalEtiquetasRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    const etiquetaPdfService = new EtiquetaPdfService();

    server.post(
      '/operacional/etiquetas/compactar',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Compactar PDF de etiquetas em 4 por folha',
          description:
            'Recebe PDFs externos de etiquetas e devolve um novo PDF com 4 etiquetas por folha A4.',
          consumes: ['multipart/form-data'],
          security: [{ bearerAuth: [] }],
          response: {
            400: { type: 'object', properties: { error: { type: 'string' } } },
          },
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const files: Array<{ filename: string; buffer: Buffer }> = [];

          for await (const part of request.files({ limits: { fileSize: 10 * 1024 * 1024 } })) {
            if (!['application/pdf', 'application/x-pdf'].includes(part.mimetype)) {
              return reply.status(400).send({ error: 'Envie apenas arquivos PDF validos.' });
            }

            files.push({
              filename: part.filename,
              buffer: await part.toBuffer(),
            });
          }

          if (files.length === 0) {
            return reply.status(400).send({ error: 'Nenhum arquivo PDF foi enviado.' });
          }

          const outputBuffer = await etiquetaPdfService.compactarTresPorFolha(
            files.map((file) => file.buffer)
          );
          const filename = buildOutputFilename(files[0]!.filename);

          return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(outputBuffer);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao processar PDF de etiquetas';
          return reply.status(400).send({ error: message });
        }
      }
    );
  };
}
