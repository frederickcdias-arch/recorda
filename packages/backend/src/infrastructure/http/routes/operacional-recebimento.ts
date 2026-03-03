import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { sendDatabaseError } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import {
  nomeObrigatorioSchema,
  criarProcessoRecebimentoSchema,
  criarVolumeSchema,
  criarApensoSchema,
} from '../schemas/operacional.js';
import {
  type OrigemDocumentoRecebimento,
  getCurrentUser,
  saveOCRImageBase64,
  loadRepositorio,
} from './operacional-helpers.js';

/**
 * Recebimento routes: setores, classificações, processos, volumes, apensos.
 */
export function createOperacionalRecebimentoRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {

    // ============================================================
    // RECEBIMENTO - Setores e Classificações (opções do selector)
    // ============================================================

    // GET /operacional/setores-recebimento
    server.get('/operacional/setores-recebimento', {
      schema: { tags: ['operacional'], summary: 'Listar setores de recebimento ativos', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (_request, reply) => {
      try {
        const result = await server.database.query(
          `SELECT id, nome FROM setores_recebimento WHERE ativo = TRUE ORDER BY nome ASC`
        );
        return reply.send({ itens: result.rows });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar setores';
        return sendDatabaseError(reply, error, message);
      }
    });

    // POST /operacional/setores-recebimento
    server.post('/operacional/setores-recebimento', {
      schema: { tags: ['operacional'], summary: 'Criar setor de recebimento', security: [{ bearerAuth: [] }], body: { type: 'object', required: ['nome'], properties: { nome: { type: 'string' } } }, response: { 201: { type: 'object', additionalProperties: true }, 400: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } } },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(nomeObrigatorioSchema)],
    }, async (request, reply) => {
      try {
        const user = getCurrentUser(request);
        const { nome } = request.body as { nome: string };
        const result = await server.database.query(
          `INSERT INTO setores_recebimento (nome, criado_por)
           VALUES ($1, $2)
           ON CONFLICT (LOWER(TRIM(nome))) WHERE ativo = TRUE
           DO UPDATE SET nome = EXCLUDED.nome
           RETURNING id, nome`,
          [nome, user.id]
        );
        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao criar setor';
        return reply.status(400).send({ error: message });
      }
    });

    // GET /operacional/classificacoes-recebimento
    server.get('/operacional/classificacoes-recebimento', {
      schema: { tags: ['operacional'], summary: 'Listar classificações de recebimento ativas', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (_request, reply) => {
      try {
        const result = await server.database.query(
          `SELECT id, nome FROM classificacoes_recebimento WHERE ativo = TRUE ORDER BY nome ASC`
        );
        return reply.send({ itens: result.rows });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar classificações';
        return sendDatabaseError(reply, error, message);
      }
    });

    // POST /operacional/classificacoes-recebimento
    server.post('/operacional/classificacoes-recebimento', {
      schema: { tags: ['operacional'], summary: 'Criar classificação de recebimento', security: [{ bearerAuth: [] }], body: { type: 'object', required: ['nome'], properties: { nome: { type: 'string' } } }, response: { 201: { type: 'object', additionalProperties: true }, 400: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } } },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(nomeObrigatorioSchema)],
    }, async (request, reply) => {
      try {
        const user = getCurrentUser(request);
        const { nome } = request.body as { nome: string };
        const result = await server.database.query(
          `INSERT INTO classificacoes_recebimento (nome, criado_por)
           VALUES ($1, $2)
           ON CONFLICT (LOWER(TRIM(nome))) WHERE ativo = TRUE
           DO UPDATE SET nome = EXCLUDED.nome
           RETURNING id, nome`,
          [nome, user.id]
        );
        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao criar classificação';
        return reply.status(400).send({ error: message });
      }
    });

    // ============================================================
    // RECEBIMENTO - Processos (novo modelo simplificado)
    // ============================================================

    // GET /operacional/repositorios/:id/recebimento-processos
    server.get('/operacional/repositorios/:id/recebimento-processos', {
      schema: { tags: ['operacional'], summary: 'Listar processos de recebimento de um repositório', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const repositorio = await loadRepositorio(server, id);
        if (!repositorio) {
          return reply.status(404).send({ error: 'Repositorio nao encontrado' });
        }

        const procResult = await server.database.query(
          `SELECT rp.id, rp.protocolo, rp.interessado,
                  rp.setor_id, sr.nome AS setor_nome,
                  rp.classificacao_id, cr.nome AS classificacao_nome,
                  rp.volume_atual, rp.volume_total, rp.numero_caixas, rp.caixa_nova,
                  rp.origem, rp.ocr_confianca, rp.criado_em
           FROM recebimento_processos rp
           LEFT JOIN setores_recebimento sr ON sr.id = rp.setor_id
           LEFT JOIN classificacoes_recebimento cr ON cr.id = rp.classificacao_id
           WHERE rp.repositorio_id = $1
           ORDER BY rp.criado_em ASC`,
          [id]
        );

        const processos = [];
        for (const proc of procResult.rows as Record<string, unknown>[]) {
          const apResult = await server.database.query(
            `SELECT id, protocolo, interessado,
                    volume_atual, volume_total, origem, criado_em
             FROM recebimento_apensos
             WHERE processo_principal_id = $1
             ORDER BY criado_em ASC`,
            [proc.id]
          );

          processos.push({
            ...proc,
            apensos: apResult.rows,
          });
        }

        return reply.send({ processos });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar processos do recebimento';
        return sendDatabaseError(reply, error, message);
      }
    });

    // POST /operacional/repositorios/:id/recebimento-processos
    server.post('/operacional/repositorios/:id/recebimento-processos', {
      schema: { tags: ['operacional'], summary: 'Criar processo de recebimento em repositório', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, response: { 201: { type: 'object', additionalProperties: true }, 400: { type: 'object', properties: { error: { type: 'string' } } }, 404: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } } },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(criarProcessoRecebimentoSchema)],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = getCurrentUser(request);
        const body = request.body as {
          protocolo?: string;
          interessado?: string;
          setorId?: string;
          volumeAtual?: number;
          volumeTotal?: number;
          origem?: OrigemDocumentoRecebimento;
          ocrConfianca?: number;
          textoExtraido?: string;
          imagemBase64?: string;
        };

        const repositorio = await loadRepositorio(server, id);
        if (!repositorio) {
          return reply.status(404).send({ error: 'Repositorio nao encontrado' });
        }
        const repoMeta = await server.database.query<{ classificacao_padrao_id: string | null }>(
          `SELECT classificacao_padrao_id FROM repositorios WHERE id_repositorio_recorda = $1`,
          [id]
        );
        const classificacaoPadraoId = repoMeta.rows[0]?.classificacao_padrao_id ?? null;

        const protocolo = body.protocolo?.trim() ?? '';
        const interessado = body.interessado?.trim() ?? '';
        if (!protocolo || !interessado) {
          return reply.status(400).send({ error: 'Campos obrigatórios: protocolo, interessado' });
        }

        const imagemPath = body.imagemBase64
          ? await saveOCRImageBase64(body.imagemBase64, `repo-${id}`)
          : null;

        const result = await server.database.query(
          `INSERT INTO recebimento_processos (
             repositorio_id, protocolo, interessado,
             setor_id, classificacao_id,
             volume_atual, volume_total, numero_caixas, caixa_nova,
             origem, ocr_confianca, texto_extraido, imagem_path, criado_por
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING *`,
          [
            id,
            protocolo,
            interessado,
            body.setorId ?? null,
            classificacaoPadraoId,
            Math.max(Number(body.volumeAtual ?? 1), 1),
            Math.max(Number(body.volumeTotal ?? 0), 0),
            1,
            false,
            body.origem ?? 'MANUAL',
            body.ocrConfianca ?? null,
            body.textoExtraido ?? '',
            imagemPath,
            user.id,
          ]
        );

        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao salvar processo do recebimento';
        return reply.status(400).send({ error: message });
      }
    });

    // DELETE /operacional/recebimento-processos/:processoId
    server.delete('/operacional/recebimento-processos/:processoId', {
      schema: { tags: ['operacional'], summary: 'Excluir processo de recebimento', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { processoId: { type: 'string' } }, required: ['processoId'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { processoId } = request.params as { processoId: string };
        await server.database.query('DELETE FROM recebimento_processos WHERE id = $1', [processoId]);
        return reply.send({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao excluir processo';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/recebimento-processos/:processoId/volumes
    server.post('/operacional/recebimento-processos/:processoId/volumes', {
      schema: { tags: ['operacional'], summary: 'Adicionar volume a processo', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { processoId: { type: 'string' } }, required: ['processoId'] }, response: { 201: { type: 'object', additionalProperties: true }, 400: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } } },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(criarVolumeSchema)],
    }, async (request, reply) => {
      try {
        const { processoId } = request.params as { processoId: string };
        const user = getCurrentUser(request);
        const body = request.body as {
          numeroVolume?: number;
          volumeTotal?: number;
          origem?: string;
          observacao?: string;
          ocrConfianca?: number;
          textoExtraido?: string;
          imagemBase64?: string;
        };

        const imagemPath = body.imagemBase64
          ? await saveOCRImageBase64(body.imagemBase64, `repo-vol-${processoId}`)
          : null;

        const result = await server.database.query(
          `INSERT INTO recebimento_volumes (
             processo_id, numero_volume, volume_total, origem,
             ocr_confianca, texto_extraido, imagem_path, observacao, criado_por
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING *`,
          [
            processoId,
            Math.max(Number(body.numeroVolume ?? 1), 1),
            Math.max(Number(body.volumeTotal ?? 0), 0),
            body.origem ?? 'MANUAL',
            body.ocrConfianca ?? null,
            body.textoExtraido ?? '',
            imagemPath,
            body.observacao?.trim() ?? '',
            user.id,
          ]
        );
        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao adicionar volume';
        return reply.status(400).send({ error: message });
      }
    });

    // POST /operacional/recebimento-processos/:processoId/apensos
    server.post('/operacional/recebimento-processos/:processoId/apensos', {
      schema: { tags: ['operacional'], summary: 'Adicionar apenso a processo', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { processoId: { type: 'string' } }, required: ['processoId'] }, response: { 201: { type: 'object', additionalProperties: true }, 400: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } } },
      preHandler: [server.authenticate, authorize('operador', 'administrador'), validateBody(criarApensoSchema)],
    }, async (request, reply) => {
      try {
        const { processoId } = request.params as { processoId: string };
        const user = getCurrentUser(request);
        const body = request.body as {
          protocolo?: string;
          interessado?: string;
          volumeAtual?: number;
          volumeTotal?: number;
          origem?: string;
          ocrConfianca?: number;
          textoExtraido?: string;
          imagemBase64?: string;
        };

        const protocolo = body.protocolo?.trim() ?? '';
        if (!protocolo) {
          return reply.status(400).send({ error: 'Campo obrigatório: protocolo' });
        }

        const imagemPath = body.imagemBase64
          ? await saveOCRImageBase64(body.imagemBase64, `repo-apenso-${processoId}`)
          : null;

        const result = await server.database.query(
          `INSERT INTO recebimento_apensos (
             processo_principal_id, protocolo, interessado,
             volume_atual, volume_total, origem, ocr_confianca, texto_extraido,
             imagem_path, criado_por
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *`,
          [
            processoId,
            protocolo,
            body.interessado?.trim() ?? null,
            Math.max(Number(body.volumeAtual ?? 1), 1),
            Math.max(Number(body.volumeTotal ?? 0), 0),
            body.origem ?? 'MANUAL',
            body.ocrConfianca ?? null,
            body.textoExtraido ?? '',
            imagemPath,
            user.id,
          ]
        );
        return reply.status(201).send(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao adicionar apenso';
        return reply.status(400).send({ error: message });
      }
    });

    // DELETE /operacional/recebimento-apensos/:apensoId
    server.delete('/operacional/recebimento-apensos/:apensoId', {
      schema: { tags: ['operacional'], summary: 'Excluir apenso', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { apensoId: { type: 'string' } }, required: ['apensoId'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { apensoId } = request.params as { apensoId: string };
        await server.database.query('DELETE FROM recebimento_apensos WHERE id = $1', [apensoId]);
        return reply.send({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao excluir apenso';
        return reply.status(400).send({ error: message });
      }
    });

    // Compatibilidade: GET /operacional/repositorios/:id/documentos-recebimento (retorna processos no formato antigo)
    server.get('/operacional/repositorios/:id/documentos-recebimento', {
      schema: { tags: ['operacional'], summary: 'Listar documentos de recebimento (formato legado)', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await server.database.query(
          `SELECT id, protocolo AS processo, interessado, numero_caixas,
                  volume_atual::text AS volume, caixa_nova,
                  origem, ocr_confianca, criado_em
           FROM recebimento_processos
           WHERE repositorio_id = $1
           ORDER BY criado_em ASC`,
          [id]
        );
        return reply.send({ itens: result.rows });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar documentos de recebimento';
        return sendDatabaseError(reply, error, message);
      }
    });

  };
}

