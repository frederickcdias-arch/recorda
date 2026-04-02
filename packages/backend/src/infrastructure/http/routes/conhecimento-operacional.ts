import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';

type Perfil = 'operador' | 'administrador';
type KBCategoria =
  | 'MANUAIS'
  | 'PROCEDIMENTOS_ETAPA'
  | 'CHECKLISTS_EXPLICADOS'
  | 'GLOSSARIO'
  | 'NORMAS_LEIS'
  | 'ATUALIZACOES_PROCESSO';
type KBAcesso = 'OPERADOR_ADMIN' | 'ADMIN';
type KBStatus = 'ATIVO' | 'INATIVO';
type EtapaFluxo =
  | 'RECEBIMENTO'
  | 'PREPARACAO'
  | 'DIGITALIZACAO'
  | 'CONFERENCIA'
  | 'MONTAGEM'
  | 'CONTROLE_QUALIDADE'
  | 'ENTREGA';

function normalizeEtapas(value: unknown): EtapaFluxo[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is EtapaFluxo => typeof item === 'string' && item.length > 0);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inner = trimmed.slice(1, -1);
      if (!inner) return [];
      return inner
        .split(',')
        .map((item) => item.trim().replace(/^"|"$/g, ''))
        .filter((item): item is EtapaFluxo => item.length > 0);
    }
    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter((item): item is EtapaFluxo => item.length > 0);
  }
  return [];
}

function getCurrentUser(request: { user?: unknown }): { id: string; perfil: Perfil } {
  const user = request.user as { id: string; perfil: Perfil } | undefined;
  if (!user?.id) {
    throw new Error('Usuario autenticado nao encontrado');
  }
  return user;
}

export function createConhecimentoOperacionalRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    // GET /operacional/conhecimento/documentos
    server.get(
      '/operacional/conhecimento/documentos',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Listar documentos da base de conhecimento',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              categoria: { type: 'string' },
              etapa: { type: 'string' },
              busca: { type: 'string' },
              pagina: { type: 'number' },
              limite: { type: 'number' },
            },
          },
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const query = request.query as {
            categoria?: KBCategoria;
            etapa?: EtapaFluxo;
            status?: KBStatus;
            busca?: string;
          };
          const user = getCurrentUser(request);

          const params: string[] = [];
          let p = 1;
          let where = 'WHERE 1=1';

          if (query.categoria) {
            where += ` AND d.categoria = $${p++}`;
            params.push(query.categoria);
          }
          if (query.status) {
            where += ` AND d.status = $${p++}`;
            params.push(query.status);
          } else if (user.perfil === 'operador') {
            where += ` AND d.status = 'ATIVO'`;
          }
          if (query.busca) {
            where += ` AND (
            d.codigo ILIKE $${p} OR d.titulo ILIKE $${p} OR d.descricao ILIKE $${p}
            OR to_tsvector('portuguese', COALESCE(d.titulo,'') || ' ' || COALESCE(d.descricao,'') || ' ' || COALESCE(d.codigo,'')) @@ plainto_tsquery('portuguese', $${p + 1})
            OR EXISTS (
              SELECT 1 FROM kb_documento_versoes fv
              WHERE fv.id = d.versao_atual_id
                AND to_tsvector('portuguese', fv.conteudo) @@ plainto_tsquery('portuguese', $${p + 1})
            )
          )`;
            params.push(`%${query.busca}%`);
            params.push(query.busca);
            p += 2;
          }
          if (query.etapa) {
            where += ` AND EXISTS (
            SELECT 1 FROM kb_documento_etapas de
            WHERE de.documento_id = d.id
              AND de.etapa = $${p++}
          )`;
            params.push(query.etapa);
          }
          if (user.perfil === 'operador') {
            where += ` AND d.nivel_acesso = 'OPERADOR_ADMIN'`;
          }

          const result = await server.database.query(
            `SELECT d.id, d.codigo, d.titulo, d.categoria, d.descricao, d.status, d.nivel_acesso,
                  d.criado_em, d.atualizado_em,
                  COALESCE(v.versao, 0) as versao_atual,
                  ARRAY_REMOVE(ARRAY_AGG(DISTINCT de.etapa), NULL) as etapas
           FROM kb_documentos d
           LEFT JOIN kb_documento_versoes v ON v.id = d.versao_atual_id
           LEFT JOIN kb_documento_etapas de ON de.documento_id = d.id
           ${where}
           GROUP BY d.id, v.versao
           ORDER BY d.atualizado_em DESC`,
            params
          );

          return reply.send({
            itens: result.rows.map((row) => ({
              ...row,
              etapas: normalizeEtapas((row as { etapas?: unknown }).etapas),
            })),
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Erro ao listar documentos da base operacional';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /operacional/conhecimento/documentos/:id
    server.get(
      '/operacional/conhecimento/documentos/:id',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Buscar documento por ID com versões',
          security: [{ bearerAuth: [] }],
          params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const { id } = request.params as { id: string };
          const user = getCurrentUser(request);
          const whereAccess =
            user.perfil === 'operador'
              ? ` AND d.nivel_acesso = 'OPERADOR_ADMIN' AND d.status = 'ATIVO'`
              : '';

          const docResult = await server.database.query(
            `SELECT d.id, d.codigo, d.titulo, d.categoria, d.descricao, d.status, d.nivel_acesso, d.versao_atual_id,
                  d.criado_em, d.atualizado_em
           FROM kb_documentos d
           WHERE d.id = $1
           ${whereAccess}`,
            [id]
          );
          const documento = docResult.rows[0];
          if (!documento) {
            return reply.status(404).send({ error: 'Documento nao encontrado' });
          }

          const [etapasResult, versoesResult, atualResult] = await Promise.all([
            server.database.query(
              `SELECT etapa
             FROM kb_documento_etapas
             WHERE documento_id = $1
             ORDER BY etapa`,
              [id]
            ),
            server.database.query(
              `SELECT v.id, v.versao, v.resumo_alteracao, v.publicado_em, u.nome as publicado_por_nome
             FROM kb_documento_versoes v
             JOIN usuarios u ON u.id = v.publicado_por
             WHERE v.documento_id = $1
             ORDER BY v.versao DESC`,
              [id]
            ),
            server.database.query(
              `SELECT v.id, v.versao, v.conteudo, v.resumo_alteracao, v.publicado_em, u.nome as publicado_por_nome
             FROM kb_documento_versoes v
             JOIN usuarios u ON u.id = v.publicado_por
             WHERE v.id = $1`,
              [documento.versao_atual_id as string]
            ),
          ]);

          return reply.send({
            documento,
            etapas: etapasResult.rows.map((row) => row.etapa as EtapaFluxo),
            versaoAtual: atualResult.rows[0] ?? null,
            versoes: versoesResult.rows,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar documento';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // POST /operacional/conhecimento/documentos
    server.post(
      '/operacional/conhecimento/documentos',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Criar documento na base de conhecimento',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const body = request.body as {
            codigo?: string;
            titulo?: string;
            categoria?: KBCategoria;
            descricao?: string;
            nivelAcesso?: KBAcesso;
            etapas?: EtapaFluxo[];
            conteudo?: string;
            resumoAlteracao?: string;
          };

          if (!body.codigo || !body.titulo || !body.categoria || !body.conteudo) {
            return reply
              .status(400)
              .send({ error: 'Campos obrigatorios: codigo, titulo, categoria, conteudo' });
          }

          await server.database.query('BEGIN');
          const docResult = await server.database.query<{ id: string }>(
            `INSERT INTO kb_documentos (
             codigo, titulo, categoria, descricao, nivel_acesso, criado_por
           )
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
            [
              body.codigo.trim(),
              body.titulo.trim(),
              body.categoria,
              body.descricao?.trim() ?? '',
              body.nivelAcesso ?? 'OPERADOR_ADMIN',
              user.id,
            ]
          );
          const documentoId = docResult.rows[0]?.id;
          if (!documentoId) {
            throw new Error('Falha ao criar documento');
          }

          const versaoResult = await server.database.query<{ id: string }>(
            `INSERT INTO kb_documento_versoes (
             documento_id, versao, conteudo, resumo_alteracao, publicado_por
           )
           VALUES ($1, 1, $2, $3, $4)
           RETURNING id`,
            [documentoId, body.conteudo, body.resumoAlteracao?.trim() ?? 'Versao inicial', user.id]
          );
          const versaoId = versaoResult.rows[0]?.id;
          if (!versaoId) {
            throw new Error('Falha ao criar versao inicial');
          }

          if ((body.etapas ?? []).length > 0) {
            for (const etapa of body.etapas ?? []) {
              await server.database.query(
                `INSERT INTO kb_documento_etapas (documento_id, etapa)
               VALUES ($1, $2)
               ON CONFLICT (documento_id, etapa) DO NOTHING`,
                [documentoId, etapa]
              );
            }
          }

          await server.database.query(
            `UPDATE kb_documentos
           SET versao_atual_id = $2
           WHERE id = $1`,
            [documentoId, versaoId]
          );
          await server.database.query('COMMIT');

          return reply.status(201).send({ id: documentoId, versaoAtualId: versaoId });
        } catch (error) {
          await server.database.query('ROLLBACK');
          const message = error instanceof Error ? error.message : 'Erro ao criar documento';
          return reply.status(400).send({ error: message });
        }
      }
    );

    // POST /operacional/conhecimento/documentos/:id/versoes
    server.post(
      '/operacional/conhecimento/documentos/:id/versoes',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Criar nova versão de documento',
          security: [{ bearerAuth: [] }],
          params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { id } = request.params as { id: string };
          const user = getCurrentUser(request);
          const body = request.body as { conteudo?: string; resumoAlteracao?: string };
          if (!body.conteudo) {
            return reply.status(400).send({ error: 'Campo obrigatorio: conteudo' });
          }

          await server.database.query('BEGIN');

          const existsResult = await server.database.query(
            `SELECT id FROM kb_documentos WHERE id = $1`,
            [id]
          );
          if (existsResult.rows.length === 0) {
            await server.database.query('ROLLBACK');
            return reply.status(404).send({ error: 'Documento nao encontrado' });
          }

          const numberResult = await server.database.query<{ ultima_versao: number }>(
            `SELECT COALESCE(MAX(versao), 0) as ultima_versao
           FROM kb_documento_versoes
           WHERE documento_id = $1`,
            [id]
          );
          const nextVersion = Number(numberResult.rows[0]?.ultima_versao ?? 0) + 1;

          const versionResult = await server.database.query<{ id: string }>(
            `INSERT INTO kb_documento_versoes (
             documento_id, versao, conteudo, resumo_alteracao, publicado_por
           )
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
            [
              id,
              nextVersion,
              body.conteudo,
              body.resumoAlteracao?.trim() ?? `Atualizacao v${nextVersion}`,
              user.id,
            ]
          );
          const versaoId = versionResult.rows[0]?.id;
          if (!versaoId) {
            throw new Error('Falha ao criar nova versao');
          }

          await server.database.query(
            `UPDATE kb_documentos
           SET versao_atual_id = $2
           WHERE id = $1`,
            [id, versaoId]
          );

          await server.database.query('COMMIT');
          return reply.status(201).send({ documentoId: id, versaoId, versao: nextVersion });
        } catch (error) {
          await server.database.query('ROLLBACK');
          const message = error instanceof Error ? error.message : 'Erro ao publicar nova versao';
          return reply.status(400).send({ error: message });
        }
      }
    );

    // PATCH /operacional/conhecimento/documentos/:id
    server.patch(
      '/operacional/conhecimento/documentos/:id',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Atualizar metadados de documento',
          security: [{ bearerAuth: [] }],
          params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { id } = request.params as { id: string };
          const body = request.body as {
            titulo?: string;
            descricao?: string;
            status?: KBStatus;
            nivelAcesso?: KBAcesso;
            etapas?: EtapaFluxo[];
          };

          await server.database.query('BEGIN');
          const updateResult = await server.database.query(
            `UPDATE kb_documentos
           SET titulo = COALESCE($2, titulo),
               descricao = COALESCE($3, descricao),
               status = COALESCE($4, status),
               nivel_acesso = COALESCE($5, nivel_acesso)
           WHERE id = $1
           RETURNING *`,
            [
              id,
              body.titulo?.trim() ?? null,
              body.descricao?.trim() ?? null,
              body.status ?? null,
              body.nivelAcesso ?? null,
            ]
          );

          if (updateResult.rows.length === 0) {
            await server.database.query('ROLLBACK');
            return reply.status(404).send({ error: 'Documento nao encontrado' });
          }

          if (body.etapas) {
            await server.database.query(
              `DELETE FROM kb_documento_etapas
             WHERE documento_id = $1`,
              [id]
            );
            for (const etapa of body.etapas) {
              await server.database.query(
                `INSERT INTO kb_documento_etapas (documento_id, etapa)
               VALUES ($1, $2)
               ON CONFLICT (documento_id, etapa) DO NOTHING`,
                [id, etapa]
              );
            }
          }

          await server.database.query('COMMIT');
          return reply.send(updateResult.rows[0]);
        } catch (error) {
          await server.database.query('ROLLBACK');
          const message = error instanceof Error ? error.message : 'Erro ao atualizar documento';
          return reply.status(400).send({ error: message });
        }
      }
    );

    // ═══════════════════════════════════════════════
    // Glossário dinâmico
    // ═══════════════════════════════════════════════

    // GET /operacional/conhecimento/glossario
    server.get(
      '/operacional/conhecimento/glossario',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Listar termos do glossário',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const whereAtivo = user.perfil === 'operador' ? 'WHERE ativo = TRUE' : '';
          const result = await server.database.query(
            `SELECT id, termo, definicao, ativo, ordem FROM kb_glossario ${whereAtivo} ORDER BY ordem, termo`
          );
          return reply.send({ itens: result.rows });
        } catch (error) {
          return reply
            .status(500)
            .send({ error: error instanceof Error ? error.message : 'Erro ao listar glossário' });
        }
      }
    );

    // POST /operacional/conhecimento/glossario
    server.post(
      '/operacional/conhecimento/glossario',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Criar termo no glossário',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const body = request.body as { termo?: string; definicao?: string; ordem?: number };
          if (!body.termo?.trim() || !body.definicao?.trim()) {
            return reply.status(400).send({ error: 'Termo e definição são obrigatórios' });
          }
          const result = await server.database.query<{ id: string }>(
            `INSERT INTO kb_glossario (termo, definicao, ordem, criado_por)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (LOWER(termo)) DO UPDATE SET definicao = EXCLUDED.definicao, ordem = EXCLUDED.ordem, ativo = TRUE
           RETURNING id`,
            [body.termo.trim(), body.definicao.trim(), body.ordem ?? 0, user.id]
          );
          return reply.status(201).send({ id: result.rows[0]?.id });
        } catch (error) {
          return reply
            .status(400)
            .send({ error: error instanceof Error ? error.message : 'Erro ao criar termo' });
        }
      }
    );

    // PATCH /operacional/conhecimento/glossario/:id
    server.patch<{ Params: { id: string } }>(
      '/operacional/conhecimento/glossario/:id',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Atualizar termo do glossário',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { id } = request.params;
          const body = request.body as {
            termo?: string;
            definicao?: string;
            ativo?: boolean;
            ordem?: number;
          };
          const result = await server.database.query(
            `UPDATE kb_glossario
           SET termo = COALESCE($2, termo),
               definicao = COALESCE($3, definicao),
               ativo = COALESCE($4, ativo),
               ordem = COALESCE($5, ordem)
           WHERE id = $1
           RETURNING *`,
            [
              id,
              body.termo?.trim() ?? null,
              body.definicao?.trim() ?? null,
              body.ativo ?? null,
              body.ordem ?? null,
            ]
          );
          if (result.rows.length === 0)
            return reply.status(404).send({ error: 'Termo não encontrado' });
          return reply.send(result.rows[0]);
        } catch (error) {
          return reply
            .status(400)
            .send({ error: error instanceof Error ? error.message : 'Erro ao atualizar termo' });
        }
      }
    );

    // DELETE /operacional/conhecimento/glossario/:id
    server.delete<{ Params: { id: string } }>(
      '/operacional/conhecimento/glossario/:id',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Excluir termo do glossário',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { id } = request.params;
          const result = await server.database.query(
            'DELETE FROM kb_glossario WHERE id = $1 RETURNING id',
            [id]
          );
          if (result.rows.length === 0)
            return reply.status(404).send({ error: 'Termo não encontrado' });
          return reply.send({ message: 'Termo excluído' });
        } catch (error) {
          return reply
            .status(500)
            .send({ error: error instanceof Error ? error.message : 'Erro ao excluir termo' });
        }
      }
    );

    // ═══════════════════════════════════════════════
    // Leis e Normas dinâmicas
    // ═══════════════════════════════════════════════

    // GET /operacional/conhecimento/leis-normas
    server.get(
      '/operacional/conhecimento/leis-normas',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Listar leis e normas',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const whereAtivo = user.perfil === 'operador' ? 'WHERE ativo = TRUE' : '';
          const result = await server.database.query(
            `SELECT id, nome, descricao, referencia, url, ativo, ordem FROM kb_leis_normas ${whereAtivo} ORDER BY ordem, nome`
          );
          return reply.send({ itens: result.rows });
        } catch (error) {
          return reply.status(500).send({
            error: error instanceof Error ? error.message : 'Erro ao listar leis e normas',
          });
        }
      }
    );

    // POST /operacional/conhecimento/leis-normas
    server.post(
      '/operacional/conhecimento/leis-normas',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Criar lei/norma',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const body = request.body as {
            nome?: string;
            descricao?: string;
            referencia?: string;
            url?: string;
            ordem?: number;
          };
          if (!body.nome?.trim() || !body.descricao?.trim()) {
            return reply.status(400).send({ error: 'Nome e descrição são obrigatórios' });
          }
          const result = await server.database.query<{ id: string }>(
            `INSERT INTO kb_leis_normas (nome, descricao, referencia, url, ordem, criado_por)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (LOWER(nome)) DO UPDATE SET descricao = EXCLUDED.descricao, referencia = EXCLUDED.referencia, url = EXCLUDED.url, ordem = EXCLUDED.ordem, ativo = TRUE
           RETURNING id`,
            [
              body.nome.trim(),
              body.descricao.trim(),
              body.referencia?.trim() ?? '',
              body.url?.trim() ?? null,
              body.ordem ?? 0,
              user.id,
            ]
          );
          return reply.status(201).send({ id: result.rows[0]?.id });
        } catch (error) {
          return reply
            .status(400)
            .send({ error: error instanceof Error ? error.message : 'Erro ao criar lei/norma' });
        }
      }
    );

    // PATCH /operacional/conhecimento/leis-normas/:id
    server.patch<{ Params: { id: string } }>(
      '/operacional/conhecimento/leis-normas/:id',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Atualizar lei/norma',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { id } = request.params;
          const body = request.body as {
            nome?: string;
            descricao?: string;
            referencia?: string;
            url?: string;
            ativo?: boolean;
            ordem?: number;
          };
          const result = await server.database.query(
            `UPDATE kb_leis_normas
           SET nome = COALESCE($2, nome),
               descricao = COALESCE($3, descricao),
               referencia = COALESCE($4, referencia),
               url = COALESCE($5, url),
               ativo = COALESCE($6, ativo),
               ordem = COALESCE($7, ordem)
           WHERE id = $1
           RETURNING *`,
            [
              id,
              body.nome?.trim() ?? null,
              body.descricao?.trim() ?? null,
              body.referencia?.trim() ?? null,
              body.url?.trim() ?? null,
              body.ativo ?? null,
              body.ordem ?? null,
            ]
          );
          if (result.rows.length === 0)
            return reply.status(404).send({ error: 'Lei/norma não encontrada' });
          return reply.send(result.rows[0]);
        } catch (error) {
          return reply.status(400).send({
            error: error instanceof Error ? error.message : 'Erro ao atualizar lei/norma',
          });
        }
      }
    );

    // DELETE /operacional/conhecimento/leis-normas/:id
    server.delete<{ Params: { id: string } }>(
      '/operacional/conhecimento/leis-normas/:id',
      {
        schema: {
          tags: ['conhecimento'],
          summary: 'Excluir lei/norma',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { id } = request.params;
          const result = await server.database.query(
            'DELETE FROM kb_leis_normas WHERE id = $1 RETURNING id',
            [id]
          );
          if (result.rows.length === 0)
            return reply.status(404).send({ error: 'Lei/norma não encontrada' });
          return reply.send({ message: 'Lei/norma excluída' });
        } catch (error) {
          return reply
            .status(500)
            .send({ error: error instanceof Error ? error.message : 'Erro ao excluir lei/norma' });
        }
      }
    );
  };
}
