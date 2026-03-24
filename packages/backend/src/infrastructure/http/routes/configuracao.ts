import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { promises as fs } from 'fs';
import path from 'path';

interface ConfiguracaoEmpresaInput {
  nome: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  email: string;
  logoUrl: string;
  exibirLogoRelatorio: boolean;
  exibirEnderecoRelatorio: boolean;
  exibirContatoRelatorio: boolean;
  logoLarguraRelatorio: number;
  logoAlinhamentoRelatorio: 'ESQUERDA' | 'CENTRO' | 'DIREITA';
  logoDeslocamentoYRelatorio: number;
}

interface ConfiguracaoProjetoInput {
  nome: string;
  descricao?: string;
  ativo?: boolean;
}

function mapRowToConfig(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    nome: row.nome as string,
    cnpj: row.cnpj as string,
    endereco: row.endereco as string,
    telefone: row.telefone as string,
    email: row.email as string,
    logoUrl: row.logo_url as string,
    exibirLogoRelatorio: row.exibir_logo_relatorio as boolean,
    exibirEnderecoRelatorio: row.exibir_endereco_relatorio as boolean,
    exibirContatoRelatorio: row.exibir_contato_relatorio as boolean,
    logoLarguraRelatorio: Number(row.logo_largura_relatorio ?? 120),
    logoAlinhamentoRelatorio: (row.logo_alinhamento_relatorio as string) || 'CENTRO',
    logoDeslocamentoYRelatorio: Number(row.logo_deslocamento_y_relatorio ?? 0),
  };
}

export function createConfiguracaoRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    server.get('/configuracao/empresa', {
      schema: { tags: ['configuracao'], summary: 'Buscar configuração da empresa', security: [{ bearerAuth: [] }] },
      preHandler: [server.authenticate],
    }, async (_request, reply) => {
      try {
        const result = await server.database.query(
          `SELECT id, nome, cnpj, endereco, telefone, email, logo_url,
                  exibir_logo_relatorio, exibir_endereco_relatorio, exibir_contato_relatorio,
                  logo_largura_relatorio, logo_alinhamento_relatorio, logo_deslocamento_y_relatorio
           FROM configuracao_empresa LIMIT 1`
        );

        if (result.rows.length === 0) {
          return reply.status(200).send({
            id: null,
            nome: '',
            cnpj: '',
            endereco: '',
            telefone: '',
            email: '',
            logoUrl: '',
            exibirLogoRelatorio: true,
            exibirEnderecoRelatorio: true,
            exibirContatoRelatorio: true,
            logoLarguraRelatorio: 120,
            logoAlinhamentoRelatorio: 'CENTRO',
            logoDeslocamentoYRelatorio: 0,
          });
        }

        return reply.status(200).send(mapRowToConfig(result.rows[0] as Record<string, unknown>));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao buscar configuração';
        return reply.status(500).send({ error: message });
      }
    });

    server.put<{ Body: ConfiguracaoEmpresaInput }>('/configuracao/empresa', {
      schema: { tags: ['configuracao'], summary: 'Salvar configuração da empresa', security: [{ bearerAuth: [] }], response: { 201: { type: 'object', additionalProperties: true }, 500: { type: 'object', properties: { error: { type: 'string' } } } } },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const config = request.body;
        const existsResult = await server.database.query(`SELECT id FROM configuracao_empresa LIMIT 1`);

        if (existsResult.rows.length === 0) {
          const insertResult = await server.database.query(
            `INSERT INTO configuracao_empresa 
             (nome, cnpj, endereco, telefone, email, logo_url, exibir_logo_relatorio, exibir_endereco_relatorio, exibir_contato_relatorio,
              logo_largura_relatorio, logo_alinhamento_relatorio, logo_deslocamento_y_relatorio)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id, nome, cnpj, endereco, telefone, email, logo_url,
                       exibir_logo_relatorio, exibir_endereco_relatorio, exibir_contato_relatorio,
                       logo_largura_relatorio, logo_alinhamento_relatorio, logo_deslocamento_y_relatorio`,

            [
              config.nome,
              config.cnpj,
              config.endereco,
              config.telefone,
              config.email,
              config.logoUrl,
              config.exibirLogoRelatorio,
              config.exibirEnderecoRelatorio,
              config.exibirContatoRelatorio,
              Math.min(Math.max(Number(config.logoLarguraRelatorio ?? 120), 60), 260),
              (config.logoAlinhamentoRelatorio ?? 'CENTRO').toUpperCase(),
              Math.min(Math.max(Number(config.logoDeslocamentoYRelatorio ?? 0), -20), 40),
            ]
          );
          return reply.status(201).send(mapRowToConfig(insertResult.rows[0] as Record<string, unknown>));
        }

        const existingId = (existsResult.rows[0] as Record<string, unknown>).id;
        const updateResult = await server.database.query(
          `UPDATE configuracao_empresa SET nome = $1, cnpj = $2, endereco = $3, telefone = $4, email = $5,
           logo_url = $6, exibir_logo_relatorio = $7, exibir_endereco_relatorio = $8, exibir_contato_relatorio = $9,
           logo_largura_relatorio = $10, logo_alinhamento_relatorio = $11, logo_deslocamento_y_relatorio = $12
           WHERE id = $13
           RETURNING id, nome, cnpj, endereco, telefone, email, logo_url,
                     exibir_logo_relatorio, exibir_endereco_relatorio, exibir_contato_relatorio,
                     logo_largura_relatorio, logo_alinhamento_relatorio, logo_deslocamento_y_relatorio`,
          [
            config.nome,
            config.cnpj,
            config.endereco,
            config.telefone,
            config.email,
            config.logoUrl,
            config.exibirLogoRelatorio,
            config.exibirEnderecoRelatorio,
            config.exibirContatoRelatorio,
            Math.min(Math.max(Number(config.logoLarguraRelatorio ?? 120), 60), 260),
            (config.logoAlinhamentoRelatorio ?? 'CENTRO').toUpperCase(),
            Math.min(Math.max(Number(config.logoDeslocamentoYRelatorio ?? 0), -20), 40),
            existingId,
          ]
        );
        return reply.status(200).send(mapRowToConfig(updateResult.rows[0] as Record<string, unknown>));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao salvar configuração';
        return reply.status(500).send({ error: message });
      }
    });

    // POST /configuracao/empresa/logo - Upload de logo
    server.post('/configuracao/empresa/logo', {
      schema: { tags: ['configuracao'], summary: 'Upload de logo da empresa', security: [{ bearerAuth: [] }], response: { 200: { type: 'object', properties: { logoUrl: { type: 'string' } } }, 400: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } } },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const data = await request.file({ limits: { fileSize: 5 * 1024 * 1024 } });
        if (!data) {
          return reply.status(400).send({ error: 'Nenhum arquivo enviado' });
        }

        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
        if (!allowedTypes.includes(data.mimetype)) {
          return reply.status(400).send({ error: 'Tipo de arquivo não permitido. Use PNG, JPG, SVG ou WebP.' });
        }

        const buffer = await data.toBuffer();
        const uploadsDir = path.resolve('uploads', 'logos');
        await fs.mkdir(uploadsDir, { recursive: true });

        // Limpar logos anteriores
        try {
          const files = await fs.readdir(uploadsDir);
          for (const file of files) {
            await fs.unlink(path.join(uploadsDir, file));
          }
        } catch { /* ignore */ }

        const ext = path.extname(data.filename) || '.png';
        const filename = `logo_empresa${ext}`;
        const filePath = path.join(uploadsDir, filename);
        await fs.writeFile(filePath, buffer);

        const logoUrl = `/configuracao/empresa/logo/arquivo`;

        // Atualizar logo_url na configuração
        const existsResult = await server.database.query(`SELECT id FROM configuracao_empresa LIMIT 1`);
        if (existsResult.rows.length > 0) {
          const existingId = (existsResult.rows[0] as Record<string, unknown>).id;
          await server.database.query(
            `UPDATE configuracao_empresa SET logo_url = $1 WHERE id = $2`,
            [logoUrl, existingId]
          );
        } else {
          await server.database.query(
            `INSERT INTO configuracao_empresa (nome, logo_url) VALUES ('', $1)`,
            [logoUrl]
          );
        }

        return reply.status(200).send({ logoUrl });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao fazer upload da logo';
        return reply.status(500).send({ error: message });
      }
    });

    // GET /configuracao/empresa/logo/arquivo - Servir arquivo da logo
    server.get('/configuracao/empresa/logo/arquivo', {
      schema: { tags: ['configuracao'], summary: 'Servir arquivo da logo', response: { 404: { type: 'object', properties: { error: { type: 'string' } } } } },
    }, async (_request, reply) => {
      try {
        const uploadsDir = path.resolve('uploads', 'logos');
        const files = await fs.readdir(uploadsDir);
        const logoFile = files.find(f => f.startsWith('logo_empresa'));

        if (!logoFile) {
          return reply.status(404).send({ error: 'Logo não encontrada' });
        }

        const filePath = path.join(uploadsDir, logoFile);
        const buffer = await fs.readFile(filePath);
        const ext = path.extname(logoFile).toLowerCase();

        const mimeTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.webp': 'image/webp',
        };

        return reply
          .header('Content-Type', mimeTypes[ext] ?? 'image/png')
          .header('Cache-Control', 'public, max-age=3600')
          // Permite exibir a logo em frontend hospedado em outro domÃ­nio (ex.: Vercel).
          .header('Cross-Origin-Resource-Policy', 'cross-origin')
          .send(buffer);
      } catch {
        return reply.status(404).send({ error: 'Logo não encontrada' });
      }
    });

    // DELETE /configuracao/empresa/logo - Remover logo
    server.delete('/configuracao/empresa/logo', {
      schema: { tags: ['configuracao'], summary: 'Remover logo da empresa', security: [{ bearerAuth: [] }], response: { 200: { type: 'object', properties: { message: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } } },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (_request, reply) => {
      try {
        const uploadsDir = path.resolve('uploads', 'logos');
        try {
          const files = await fs.readdir(uploadsDir);
          for (const file of files) {
            await fs.unlink(path.join(uploadsDir, file));
          }
        } catch { /* ignore */ }

        const existsResult = await server.database.query(`SELECT id FROM configuracao_empresa LIMIT 1`);
        if (existsResult.rows.length > 0) {
          const existingId = (existsResult.rows[0] as Record<string, unknown>).id;
          await server.database.query(
            `UPDATE configuracao_empresa SET logo_url = '' WHERE id = $1`,
            [existingId]
          );
        }

        return reply.status(200).send({ message: 'Logo removida com sucesso' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao remover logo';
        return reply.status(500).send({ error: message });
      }
    });

    server.get('/configuracao/projetos', {
      schema: { tags: ['configuracao'], summary: 'Listar projetos', security: [{ bearerAuth: [] }], response: { 200: { type: 'object', additionalProperties: true }, 500: { type: 'object', properties: { error: { type: 'string' } } } } },
      preHandler: [server.authenticate],
    }, async (_request, reply) => {
      try {
        const result = await server.database.query(`
          SELECT id, nome, descricao, ativo, criado_em, atualizado_em
          FROM configuracao_projetos
          ORDER BY criado_em DESC
        `);

        const projetosRows = result.rows as Record<string, unknown>[];
        const uniqueMap = new Map<string, Record<string, unknown>>();
        for (const projeto of projetosRows) {
          const nome = String(projeto.nome ?? '').trim();
          if (!nome) continue;
          const key = nome.toLowerCase();
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, projeto);
          }
        }

        return reply.status(200).send({ projetos: Array.from(uniqueMap.values()).map((projeto) => ({
          id: String(projeto.id),
          nome: String(projeto.nome),
          descricao: (projeto.descricao as string) ?? '',
          ativo: Boolean(projeto.ativo),
          criado_em: projeto.criado_em,
          atualizado_em: projeto.atualizado_em,
        })) });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao buscar projetos';
        if (message.includes('configuracao_projetos')) {
          return reply.status(200).send({ projetos: [] });
        }
        return reply.status(500).send({ error: message });
      }
    });

    server.post<{ Body: ConfiguracaoProjetoInput }>('/configuracao/projetos', {
      schema: { tags: ['configuracao'], summary: 'Criar projeto', security: [{ bearerAuth: [] }], body: { type: 'object', required: ['nome'], properties: { nome: { type: 'string' }, descricao: { type: 'string' }, ativo: { type: 'boolean' } } }, response: { 201: { type: 'object', additionalProperties: true }, 400: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } } },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { nome, descricao = '', ativo = true } = request.body;
        if (!nome || nome.trim().length === 0) {
          return reply.status(400).send({ error: 'Nome do projeto é obrigatório' });
        }

        const result = await server.database.query(
          `INSERT INTO configuracao_projetos (nome, descricao, ativo)
           VALUES ($1, $2, $3)
           RETURNING id, nome, descricao, ativo, criado_em, atualizado_em`,
          [nome.trim(), descricao, ativo]
        );

        const projeto = result.rows[0] as Record<string, unknown> | undefined;
        if (!projeto) return reply.status(500).send({ error: 'Erro ao criar projeto' });
        return reply.status(201).send({
          id: String(projeto.id),
          nome: String(projeto.nome),
          descricao: (projeto.descricao as string) ?? '',
          ativo: Boolean(projeto.ativo),
          criado_em: projeto.criado_em,
          atualizado_em: projeto.atualizado_em,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao criar projeto';
        return reply.status(500).send({ error: message });
      }
    });

    server.put<{ Params: { id: string }; Body: ConfiguracaoProjetoInput }>('/configuracao/projetos/:id', {
      schema: { tags: ['configuracao'], summary: 'Atualizar projeto', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, response: { 400: { type: 'object', properties: { error: { type: 'string' } } }, 404: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } } },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params;
        const { nome, descricao = '' } = request.body;

        if (!nome || nome.trim().length === 0) {
          return reply.status(400).send({ error: 'Nome do projeto é obrigatório' });
        }

        const result = await server.database.query(
          `UPDATE configuracao_projetos
           SET nome = $1, descricao = $2, atualizado_em = NOW()
           WHERE id = $3
           RETURNING id, nome, descricao, ativo, criado_em, atualizado_em`,
          [nome.trim(), descricao, id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Projeto não encontrado' });
        }

        const projeto = result.rows[0] as Record<string, unknown>;
        return reply.status(200).send({
          id: String(projeto.id),
          nome: String(projeto.nome),
          descricao: (projeto.descricao as string) ?? '',
          ativo: Boolean(projeto.ativo),
          criado_em: projeto.criado_em,
          atualizado_em: projeto.atualizado_em,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao atualizar projeto';
        return reply.status(500).send({ error: message });
      }
    });

    server.patch<{ Params: { id: string } }>('/configuracao/projetos/:id/toggle-ativo', {
      schema: { tags: ['configuracao'], summary: 'Ativar/desativar projeto', security: [{ bearerAuth: [] }], params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, response: { 404: { type: 'object', properties: { error: { type: 'string' } } }, 500: { type: 'object', properties: { error: { type: 'string' } } } } },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params;

        const result = await server.database.query(
          `UPDATE configuracao_projetos
           SET ativo = NOT ativo, atualizado_em = NOW()
           WHERE id = $1
           RETURNING id, nome, descricao, ativo, criado_em, atualizado_em`,
          [id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Projeto não encontrado' });
        }

        const projeto = result.rows[0] as Record<string, unknown>;
        return reply.status(200).send({
          id: String(projeto.id),
          nome: String(projeto.nome),
          descricao: (projeto.descricao as string) ?? '',
          ativo: Boolean(projeto.ativo),
          criado_em: projeto.criado_em,
          atualizado_em: projeto.atualizado_em,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao alterar status do projeto';
        return reply.status(500).send({ error: message });
      }
    });
  };
}
