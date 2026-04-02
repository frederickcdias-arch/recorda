/**
 * Repository Pattern - Abstração de acesso a dados
 * Implementa o padrão Repository para separar a lógica de negócio do acesso a dados
 */

import type { FastifyInstance } from 'fastify';
import { Usuario, UsuarioProps } from '../../domain/index.js';

export interface IUsuarioRepository {
  findById(id: string): Promise<Usuario | null>;
  findByEmail(email: string): Promise<Usuario | null>;
  findAll(filter?: { ativo?: boolean }): Promise<Usuario[]>;
  save(usuario: Usuario): Promise<Usuario>;
  update(id: string, props: Partial<UsuarioProps>): Promise<Usuario>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
  existsByEmail(email: string): Promise<boolean>;
}

export class UsuarioRepository implements IUsuarioRepository {
  constructor(private readonly database: FastifyInstance['database']) {}

  async findById(id: string): Promise<Usuario | null> {
    const result = await this.database.query<UsuarioProps>(
      'SELECT id, nome, email, perfil, coordenadoriaId, ativo, ultimoAcesso, criadoEm, atualizadoEm FROM usuarios WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return this.mapRowToUsuario(row);
  }

  async findByEmail(email: string): Promise<Usuario | null> {
    const result = await this.database.query<UsuarioProps>(
      'SELECT id, nome, email, perfil, coordenadoriaId, ativo, ultimoAcesso, criadoEm, atualizadoEm FROM usuarios WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return this.mapRowToUsuario(row);
  }

  async findAll(filter?: { ativo?: boolean }): Promise<Usuario[]> {
    let query =
      'SELECT id, nome, email, perfil, coordenadoriaId, ativo, ultimoAcesso, criadoEm, atualizadoEm FROM usuarios';
    const params: unknown[] = [];

    if (filter?.ativo !== undefined) {
      query += ' WHERE ativo = $1';
      params.push(filter.ativo);
    }

    query += ' ORDER BY nome';

    const result = await this.database.query<UsuarioProps>(query, params);
    return result.rows.map((row) => this.mapRowToUsuario(row));
  }

  async save(usuario: Usuario): Promise<Usuario> {
    await this.database.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, perfil, coordenadoriaId, ativo, ultimoAcesso, criadoEm, atualizadoEm)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         nome = EXCLUDED.nome,
         email = EXCLUDED.email,
         perfil = EXCLUDED.perfil,
         coordenadoriaId = EXCLUDED.coordenadoriaId,
         ativo = EXCLUDED.ativo,
         ultimoAcesso = EXCLUDED.ultimoAcesso,
         atualizadoEm = EXCLUDED.atualizadoEm`,
      [
        usuario.id,
        usuario.nome,
        usuario.email,
        '', // senha_hash será definido externamente
        usuario.perfil,
        usuario.coordenadoriaId || null,
        usuario.ativo,
        usuario.ultimoAcesso || null,
        usuario.criadoEm,
        usuario.atualizadoEm,
      ]
    );

    return usuario;
  }

  async update(id: string, props: Partial<UsuarioProps>): Promise<Usuario> {
    const usuarioExistente = await this.findById(id);
    if (!usuarioExistente) {
      throw new Error(`Usuário com ID "${id}" não encontrado`);
    }

    // Criar usuário atualizado
    const usuarioAtualizado = usuarioExistente.atualizar(props);

    // Construir query dinâmica
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (props.nome !== undefined) {
      updates.push(`nome = $${paramIndex++}`);
      params.push(props.nome);
    }
    if (props.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      params.push(props.email);
    }
    if (props.perfil !== undefined) {
      updates.push(`perfil = $${paramIndex++}`);
      params.push(props.perfil);
    }
    if (props.coordenadoriaId !== undefined) {
      updates.push(`coordenadoriaId = $${paramIndex++}`);
      params.push(props.coordenadoriaId);
    }
    if (props.ativo !== undefined) {
      updates.push(`ativo = $${paramIndex++}`);
      params.push(props.ativo);
    }
    if (props.ultimoAcesso !== undefined) {
      updates.push(`ultimoAcesso = $${paramIndex++}`);
      params.push(props.ultimoAcesso);
    }

    updates.push(`atualizadoEm = $${paramIndex++}`);
    params.push(usuarioAtualizado.atualizadoEm);

    params.push(id);

    if (updates.length > 0) {
      await this.database.query(
        `UPDATE usuarios SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        params
      );
    }

    return usuarioAtualizado;
  }

  async delete(id: string): Promise<void> {
    const result = await this.database.query('DELETE FROM usuarios WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      throw new Error(`Usuário com ID "${id}" não encontrado`);
    }
  }

  async exists(id: string): Promise<boolean> {
    const result = await this.database.query('SELECT 1 FROM usuarios WHERE id = $1', [id]);

    return result.rows.length > 0;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const result = await this.database.query('SELECT 1 FROM usuarios WHERE email = $1', [
      email.trim().toLowerCase(),
    ]);

    return result.rows.length > 0;
  }

  private mapRowToUsuario(row: UsuarioProps): Usuario {
    return new Usuario({
      id: row.id,
      nome: row.nome,
      email: row.email,
      perfil: row.perfil,
      coordenadoriaId: row.coordenadoriaId,
      ativo: row.ativo,
      ultimoAcesso: row.ultimoAcesso ? new Date(row.ultimoAcesso) : undefined,
      criadoEm: new Date(row.criadoEm),
      atualizadoEm: new Date(row.atualizadoEm),
    });
  }
}
