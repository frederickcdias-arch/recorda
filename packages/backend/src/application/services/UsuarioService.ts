/**
 * Application Services - Service Layer
 * Implementa a lógica de negócio do sistema
 */

import type { FastifyInstance } from 'fastify';
import {
  Usuario,
  UsuarioProps,
  IUsuarioService,
  EntityNotFoundError,
  BusinessRuleViolationError,
} from '../../domain/index.js';

export class UsuarioService implements IUsuarioService {
  constructor(private readonly database: FastifyInstance['database']) {}

  async criar(props: Omit<UsuarioProps, 'id' | 'criadoEm' | 'atualizadoEm'>): Promise<Usuario> {
    // Verificar se email já existe
    const emailExistente = await this.buscarPorEmail(props.email);
    if (emailExistente) {
      throw new BusinessRuleViolationError('Email já está em uso');
    }

    // Criar usuário
    const usuario = Usuario.criar(props);

    // Salvar no banco
    await this.database.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, perfil, coordenadoria_id, ativo, criado_em, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        usuario.id,
        usuario.nome,
        usuario.email,
        '', // senha_hash será definida externamente
        usuario.perfil,
        usuario.coordenadoriaId || null,
        usuario.ativo,
        usuario.criadoEm,
        usuario.atualizadoEm,
      ]
    );

    return usuario;
  }

  async atualizar(id: string, props: Partial<UsuarioProps>): Promise<Usuario> {
    const usuarioExistente = await this.findById(id);
    if (!usuarioExistente) {
      throw new EntityNotFoundError(id, 'Usuário');
    }

    // Atualizar propriedades
    let usuarioAtualizado = usuarioExistente;

    if (props.nome) {
      usuarioAtualizado = usuarioAtualizado.atualizar({ nome: props.nome });
    }
    if (props.email) {
      // Verificar se email já existe (exceto para o mesmo usuário)
      const outroUsuario = await this.buscarPorEmail(props.email);
      if (outroUsuario && outroUsuario.id !== id) {
        throw new BusinessRuleViolationError('Email já está em uso por outro usuário');
      }
      usuarioAtualizado = usuarioAtualizado.atualizar({ email: props.email });
    }
    if (props.perfil) {
      usuarioAtualizado = usuarioAtualizado.atualizar({ perfil: props.perfil });
    }
    if (props.coordenadoriaId !== undefined) {
      usuarioAtualizado = usuarioAtualizado.atualizar({ coordenadoriaId: props.coordenadoriaId });
    }
    if (props.ativo !== undefined) {
      usuarioAtualizado = usuarioAtualizado.atualizar({ ativo: props.ativo });
    }

    // Atualizar no banco
    await this.database.query(
      `UPDATE usuarios 
       SET nome = $1, email = $2, perfil = $3, coordenadoria_id = $4, ativo = $5, atualizado_em = $6
       WHERE id = $7`,
      [
        usuarioAtualizado.nome,
        usuarioAtualizado.email,
        usuarioAtualizado.perfil,
        usuarioAtualizado.coordenadoriaId || null,
        usuarioAtualizado.ativo,
        usuarioAtualizado.atualizadoEm,
        id,
      ]
    );

    return usuarioAtualizado;
  }

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const result = await this.database.query<UsuarioProps>(
      'SELECT id, nome, email, perfil, coordenadoriaId, ativo, ultimoAcesso, criadoEm, atualizadoEm FROM usuarios WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
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

  async listarAtivos(): Promise<Usuario[]> {
    const result = await this.database.query<UsuarioProps>(
      'SELECT id, nome, email, perfil, coordenadoriaId, ativo, ultimoAcesso, criadoEm, atualizadoEm FROM usuarios WHERE ativo = true ORDER BY nome'
    );

    return result.rows.map(
      (row) =>
        new Usuario({
          id: row.id,
          nome: row.nome,
          email: row.email,
          perfil: row.perfil,
          coordenadoriaId: row.coordenadoriaId,
          ativo: row.ativo,
          ultimoAcesso: row.ultimoAcesso ? new Date(row.ultimoAcesso) : undefined,
          criadoEm: new Date(row.criadoEm),
          atualizadoEm: new Date(row.atualizadoEm),
        })
    );
  }

  async findById(id: string): Promise<Usuario | null> {
    const result = await this.database.query<UsuarioProps>(
      'SELECT id, nome, email, perfil, coordenadoriaId, ativo, ultimoAcesso, criadoEm, atualizadoEm FROM usuarios WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
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

  async desativar(id: string): Promise<void> {
    const usuario = await this.findById(id);
    if (!usuario) {
      throw new EntityNotFoundError(id, 'Usuário');
    }

    if (!usuario.estaAtivo()) {
      throw new BusinessRuleViolationError('Usuário já está desativado');
    }

    usuario.desativar();

    await this.database.query(
      'UPDATE usuarios SET ativo = false, atualizado_em = $1 WHERE id = $2',
      [usuario.atualizadoEm, id]
    );
  }

  async atualizarUltimoAcesso(id: string): Promise<void> {
    const usuario = await this.findById(id);
    if (!usuario) {
      throw new EntityNotFoundError(id, 'Usuário');
    }

    usuario.atualizarUltimoAcesso();

    await this.database.query(
      'UPDATE usuarios SET ultimoAcesso = $1, atualizadoEm = $2 WHERE id = $3',
      [usuario.ultimoAcesso, usuario.atualizadoEm, id]
    );
  }

  async alterarSenha(id: string, novaSenhaHash: string): Promise<void> {
    const usuario = await this.findById(id);
    if (!usuario) {
      throw new EntityNotFoundError(id, 'Usuário');
    }

    await this.database.query(
      'UPDATE usuarios SET senha_hash = $1, atualizadoEm = $2 WHERE id = $3',
      [novaSenhaHash, new Date(), id]
    );
  }
}
