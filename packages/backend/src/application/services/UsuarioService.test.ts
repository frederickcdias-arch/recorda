/**
 * Service Tests - Testes dos serviços de aplicação
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsuarioService } from '../services/UsuarioService.js';
import { Usuario } from '../../domain/entities/Usuario.js';
import { EntityNotFoundError, BusinessRuleViolationError } from '../../domain/index.js';

// Mock do banco de dados
const mockDatabase = {
  query: vi.fn(),
} as any;

describe('UsuarioService', () => {
  let usuarioService: UsuarioService;

  beforeEach(() => {
    usuarioService = new UsuarioService(mockDatabase);
    vi.clearAllMocks();
  });

  describe('criar', () => {
    it('deve criar usuário com sucesso', async () => {
      const usuarioProps = {
        nome: 'João Silva',
        email: 'joao@example.com',
        perfil: 'operador' as const,
        ativo: true,
      };

      // Mock para verificar que email não existe
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });
      // Mock para inserção no banco
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const result = await usuarioService.criar(usuarioProps);

      expect(result).toBeInstanceOf(Usuario);
      expect(result.nome).toBe(usuarioProps.nome);
      expect(result.email).toBe(usuarioProps.email);
      expect(result.perfil).toBe(usuarioProps.perfil);
      expect(mockDatabase.query).toHaveBeenCalledTimes(2);
    });

    it('deve lançar erro se email já existe', async () => {
      const usuarioProps = {
        nome: 'João Silva',
        email: 'joao@example.com',
        perfil: 'operador' as const,
        ativo: true,
      };

      // Mock para verificar que email já existe
      const usuarioExistente = new Usuario({
        id: 'existing-id',
        ...usuarioProps,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });

      mockDatabase.query.mockResolvedValueOnce({ rows: [usuarioExistente] });

      await expect(usuarioService.criar(usuarioProps)).rejects.toThrow(BusinessRuleViolationError);
    });
  });

  describe('atualizar', () => {
    it('deve atualizar usuário com sucesso', async () => {
      const usuarioProps = {
        nome: 'Nome Atualizado',
      };

      const usuarioExistente = new Usuario({
        id: 'user-123',
        nome: 'Nome Original',
        email: 'test@example.com',
        perfil: 'operador' as const,
        ativo: true,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });

      mockDatabase.query.mockResolvedValueOnce({ rows: [usuarioExistente] });
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const result = await usuarioService.atualizar('user-123', usuarioProps);

      expect(result.nome).toBe(usuarioProps.nome);
      expect(mockDatabase.query).toHaveBeenCalledTimes(2);
    });

    it('deve lançar erro se usuário não existe', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(usuarioService.atualizar('invalid-id', { nome: 'Test' })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('deve lançar erro se email já está em uso por outro usuário', async () => {
      const usuarioExistente = new Usuario({
        id: 'user-123',
        nome: 'Nome Original',
        email: 'original@example.com',
        perfil: 'operador' as const,
        ativo: true,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });

      const outroUsuario = new Usuario({
        id: 'other-user',
        nome: 'Outro Usuário',
        email: 'other@example.com',
        perfil: 'operador' as const,
        ativo: true,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });

      // Mock para encontrar usuário existente
      mockDatabase.query.mockResolvedValueOnce({ rows: [usuarioExistente] });
      // Mock para verificar que novo email já existe
      mockDatabase.query.mockResolvedValueOnce({ rows: [outroUsuario] });

      await expect(
        usuarioService.atualizar('user-123', { email: 'other@example.com' })
      ).rejects.toThrow(BusinessRuleViolationError);
    });
  });

  describe('buscarPorEmail', () => {
    it('deve retornar usuário se encontrado', async () => {
      const usuarioProps = {
        id: 'user-123',
        nome: 'João Silva',
        email: 'joao@example.com',
        perfil: 'operador' as const,
        coordenadoriaId: null,
        ativo: true,
        ultimoAcesso: null,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [usuarioProps] });

      const result = await usuarioService.buscarPorEmail('joao@example.com');

      expect(result).toBeInstanceOf(Usuario);
      expect(result?.email).toBe('joao@example.com');
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'SELECT id, nome, email, perfil, coordenadoriaId, ativo, ultimoAcesso, criadoEm, atualizadoEm FROM usuarios WHERE email = $1'
        ),
        ['joao@example.com']
      );
    });

    it('deve retornar null se não encontrado', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const result = await usuarioService.buscarPorEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('listarAtivos', () => {
    it('deve retornar usuários ativos', async () => {
      const usuariosProps = [
        {
          id: 'user-1',
          nome: 'Usuário 1',
          email: 'user1@example.com',
          perfil: 'operador' as const,
          coordenadoriaId: null,
          ativo: true,
          ultimoAcesso: null,
          criadoEm: new Date(),
          atualizadoEm: new Date(),
        },
        {
          id: 'user-2',
          nome: 'Usuário 2',
          email: 'user2@example.com',
          perfil: 'administrador' as const,
          coordenadoriaId: null,
          ativo: true,
          ultimoAcesso: null,
          criadoEm: new Date(),
          atualizadoEm: new Date(),
        },
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: usuariosProps });

      const result = await usuarioService.listarAtivos();

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Usuario);
      expect(result[1]).toBeInstanceOf(Usuario);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ativo = true ORDER BY nome'),
        []
      );
    });
  });

  describe('findById', () => {
    it('deve retornar usuário se encontrado', async () => {
      const usuarioProps = {
        id: 'user-123',
        nome: 'João Silva',
        email: 'joao@example.com',
        perfil: 'operador' as const,
        coordenadoriaId: null,
        ativo: true,
        ultimoAcesso: null,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [usuarioProps] });

      const result = await usuarioService.findById('user-123');

      expect(result).toBeInstanceOf(Usuario);
      expect(result?.id).toBe('user-123');
    });

    it('deve retornar null se não encontrado', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const result = await usuarioService.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('desativar', () => {
    it('deve desativar usuário com sucesso', async () => {
      const usuarioExistente = new Usuario({
        id: 'user-123',
        nome: 'João Silva',
        email: 'joao@example.com',
        perfil: 'operador' as const,
        ativo: true,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });

      mockDatabase.query.mockResolvedValueOnce({ rows: [usuarioExistente] });
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await usuarioService.desativar('user-123');

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'UPDATE usuarios SET ativo = false, atualizado_em = $1 WHERE id = $2'
        ),
        expect.any(Array)
      );
    });

    it('deve lançar erro se usuário não existe', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(usuarioService.desativar('invalid-id')).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('atualizarUltimoAcesso', () => {
    it('deve atualizar último acesso com sucesso', async () => {
      const usuarioExistente = new Usuario({
        id: 'user-123',
        nome: 'João Silva',
        email: 'joao@example.com',
        perfil: 'operador' as const,
        ativo: true,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });

      mockDatabase.query.mockResolvedValueOnce({ rows: [usuarioExistente] });
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await usuarioService.atualizarUltimoAcesso('user-123');

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'UPDATE usuarios SET ultimoAcesso = $1, atualizadoEm = $2 WHERE id = $3'
        ),
        expect.any(Array)
      );
    });
  });
});
