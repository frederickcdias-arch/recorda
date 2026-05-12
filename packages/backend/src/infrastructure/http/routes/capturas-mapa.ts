import path from 'node:path';
import fs from 'node:fs/promises';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { processMapImage } from '../../services/map-image-processor.js';
import { getCurrentUser } from './operacional-helpers.js';

const UPLOADS_BASE = path.resolve(process.cwd(), 'uploads');
const MAPAS_DIR = path.join(UPLOADS_BASE, 'mapas');

export function createCapturasMapaRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    // ---------------------------------------------------------------
    // POST /colaborador/capturas-mapa
    // Recebe imagem base64, processa (rotate+enhance) e salva.
    // ---------------------------------------------------------------
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
            },
          },
          response: {
            201: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } } },
            500: { type: 'object', properties: { error: { type: 'string' } } },
          },
        },
        preHandler: [server.authenticate, authorize('colaborador')],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { imagemBase64 } = request.body as { imagemBase64: string };

        if (!imagemBase64?.startsWith('data:image/')) {
          return reply.status(400).send({ error: 'Imagem inválida. Envie base64 com data URI.' });
        }

        try {
          const { processedBase64, tamanhoBytes } = await processMapImage(imagemBase64);

          // Salva o arquivo em uploads/mapas/
          await fs.mkdir(MAPAS_DIR, { recursive: true });
          const nomeArquivo = `mapa-${user.id}-${Date.now()}.jpg`;
          const arquivoPath = path.join(MAPAS_DIR, nomeArquivo);
          const base64Data = processedBase64.replace(/^data:image\/\w+;base64,/, '');
          await fs.writeFile(arquivoPath, Buffer.from(base64Data, 'base64'));

          // Registra no banco
          const result = await server.database.query(
            `INSERT INTO capturas_mapa (usuario_id, arquivo_path, nome_arquivo, tamanho_bytes)
             VALUES ($1, $2, $3, $4)
             RETURNING id, nome_arquivo, tamanho_bytes, criado_em, expira_em`,
            [user.id, `mapas/${nomeArquivo}`, nomeArquivo, tamanhoBytes]
          );

          const registro = result.rows[0] as {
            id: string;
            nome_arquivo: string;
            tamanho_bytes: number;
            criado_em: string;
            expira_em: string;
          };

          // Limpa capturas expiradas deste usuário (limpeza lazy)
          await server.database.query(
            `DELETE FROM capturas_mapa WHERE usuario_id = $1 AND expira_em < NOW()`,
            [user.id]
          );

          return reply.status(201).send({
            id: registro.id,
            nomeArquivo: registro.nome_arquivo,
            tamanhoBytes: registro.tamanho_bytes,
            criadoEm: registro.criado_em,
            expiraEm: registro.expira_em,
            imagemProcessada: processedBase64,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao processar imagem';
          server.log.error(error);
          return reply.status(500).send({ error: message });
        }
      }
    );

    // ---------------------------------------------------------------
    // GET /colaborador/capturas-mapa
    // Lista capturas não expiradas do colaborador autenticado.
    // ---------------------------------------------------------------
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
            `SELECT id, nome_arquivo, tamanho_bytes, criado_em, expira_em
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

    // ---------------------------------------------------------------
    // GET /colaborador/capturas-mapa/:id/download
    // Serve o arquivo de imagem para download.
    // ---------------------------------------------------------------
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
        preHandler: [server.authenticate, authorize('colaborador')],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params as { id: string };

        try {
          const result = await server.database.query(
            `SELECT arquivo_path, nome_arquivo, expira_em
             FROM capturas_mapa
             WHERE id = $1 AND usuario_id = $2`,
            [id, user.id]
          );

          if (result.rows.length === 0) {
            return reply.status(404).send({ error: 'Captura não encontrada' });
          }

          const row = result.rows[0] as {
            arquivo_path: string;
            nome_arquivo: string;
            expira_em: string;
          };

          if (new Date(row.expira_em) < new Date()) {
            return reply.status(410).send({ error: 'Captura expirada e não disponível' });
          }

          const filePath = path.join(UPLOADS_BASE, row.arquivo_path);
          const fileBuffer = await fs.readFile(filePath);

          return reply
            .header('Content-Type', 'image/jpeg')
            .header('Content-Disposition', `attachment; filename="${row.nome_arquivo}"`)
            .header('Cache-Control', 'private, max-age=3600')
            .send(fileBuffer);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return reply.status(404).send({ error: 'Arquivo não encontrado no servidor' });
          }
          const message = error instanceof Error ? error.message : 'Erro ao baixar arquivo';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // ---------------------------------------------------------------
    // DELETE /colaborador/capturas-mapa/:id
    // Permite ao colaborador excluir uma captura própria.
    // ---------------------------------------------------------------
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
        preHandler: [server.authenticate, authorize('colaborador')],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params as { id: string };

        try {
          const result = await server.database.query(
            `DELETE FROM capturas_mapa WHERE id = $1 AND usuario_id = $2
             RETURNING arquivo_path`,
            [id, user.id]
          );

          if (result.rows.length === 0) {
            return reply.status(404).send({ error: 'Captura não encontrada' });
          }

          // Remove arquivo do disco
          const row = result.rows[0] as { arquivo_path: string };
          const filePath = path.join(UPLOADS_BASE, row.arquivo_path);
          await fs.unlink(filePath).catch(() => {
            // Ignora se o arquivo já não existe
          });

          return reply.send({ ok: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao excluir captura';
          return reply.status(500).send({ error: message });
        }
      }
    );
  };
}
