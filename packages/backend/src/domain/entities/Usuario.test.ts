/**
 * Domain Tests - Testes das entidades de domínio
 */

import { describe, it, expect } from 'vitest';
import { Usuario } from '../entities/Usuario.js';
import { Email, Nome, Quantidade, Etapa, Perfil } from '../value-objects/index.js';

describe('Usuario', () => {
  const validProps = {
    id: 'user-123',
    nome: 'João Silva',
    email: 'joao@example.com',
    perfil: 'operador' as const,
    ativo: true,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  };

  describe('criação', () => {
    it('deve criar um usuário válido', () => {
      const usuario = new Usuario(validProps);
      expect(usuario.id).toBe(validProps.id);
      expect(usuario.nome).toBe(validProps.nome);
      expect(usuario.email).toBe(validProps.email);
      expect(usuario.perfil).toBe(validProps.perfil);
      expect(usuario.ativo).toBe(validProps.ativo);
    });

    it('deve lançar erro com ID inválido', () => {
      expect(() => new Usuario({ ...validProps, id: '' })).toThrow('ID do usuário é obrigatório');
    });

    it('deve lançar erro com nome inválido', () => {
      expect(() => new Usuario({ ...validProps, nome: '' })).toThrow(
        'Nome do usuário é obrigatório'
      );
    });

    it('deve lançar erro com email inválido', () => {
      expect(() => new Usuario({ ...validProps, email: 'invalid-email' })).toThrow(
        'Email inválido'
      );
    });

    it('deve lançar erro com perfil inválido', () => {
      expect(() => new Usuario({ ...validProps, perfil: 'invalid' as any })).toThrow(
        'Perfil deve ser "operador" ou "administrador"'
      );
    });
  });

  describe('regras de negócio', () => {
    it('deve verificar permissões corretamente', () => {
      const operador = new Usuario({ ...validProps, perfil: 'operador' });
      const administrador = new Usuario({ ...validProps, perfil: 'administrador' });

      expect(operador.temPermissao('visualizar_dashboard')).toBe(true);
      expect(operador.temPermissao('gerenciar_usuarios')).toBe(false);
      expect(administrador.temPermissao('gerenciar_usuarios')).toBe(true);
    });

    it('deve verificar se pode gerenciar usuários', () => {
      const operador = new Usuario({ ...validProps, perfil: 'operador' });
      const administrador = new Usuario({ ...validProps, perfil: 'administrador' });

      expect(operador.podeGerenciarUsuarios()).toBe(false);
      expect(administrador.podeGerenciarUsuarios()).toBe(true);
    });

    it('deve verificar se está ativo', () => {
      const usuarioAtivo = new Usuario({ ...validProps, ativo: true });
      const usuarioInativo = new Usuario({ ...validProps, ativo: false });

      expect(usuarioAtivo.estaAtivo()).toBe(true);
      expect(usuarioInativo.estaAtivo()).toBe(false);
    });
  });

  describe('métodos de atualização', () => {
    it('deve desativar usuário ativo', () => {
      const usuario = new Usuario(validProps);
      const dataAntes = usuario.atualizadoEm;

      usuario.desativar();

      expect(usuario.ativo).toBe(false);
      expect(usuario.atualizadoEm.getTime()).toBeGreaterThan(dataAntes.getTime());
    });

    it('deve lançar erro ao desativar usuário já desativado', () => {
      const usuario = new Usuario({ ...validProps, ativo: false });
      expect(() => usuario.desativar()).toThrow('Usuário já está desativado');
    });

    it('deve reativar usuário inativo', () => {
      const usuario = new Usuario({ ...validProps, ativo: false });
      const dataAntes = usuario.atualizadoEm;

      usuario.ativar();

      expect(usuario.ativo).toBe(true);
      expect(usuario.atualizadoEm.getTime()).toBeGreaterThan(dataAntes.getTime());
    });

    it('deve atualizar nome', () => {
      const usuario = new Usuario(validProps);
      const dataAntes = usuario.atualizadoEm;

      usuario.atualizarNome('Novo Nome');

      expect(usuario.nome).toBe('Novo Nome');
      expect(usuario.atualizadoEm.getTime()).toBeGreaterThan(dataAntes.getTime());
    });

    it('deve atualizar email', () => {
      const usuario = new Usuario(validProps);
      const dataAntes = usuario.atualizadoEm;

      usuario.atualizarEmail('novo@example.com');

      expect(usuario.email).toBe('novo@example.com');
      expect(usuario.atualizadoEm.getTime()).toBeGreaterThan(dataAntes.getTime());
    });
  });

  describe('factory method', () => {
    it('deve criar usuário com dados mínimos', () => {
      const usuario = Usuario.criar({
        nome: 'Test User',
        email: 'test@example.com',
        perfil: 'operador',
        ativo: true,
      });

      expect(usuario.id).toBeDefined();
      expect(usuario.nome).toBe('Test User');
      expect(usuario.email).toBe('test@example.com');
      expect(usuario.perfil).toBe('operador');
      expect(usuario.ativo).toBe(true);
      expect(usuario.criadoEm).toBeInstanceOf(Date);
      expect(usuario.atualizadoEm).toBeInstanceOf(Date);
    });
  });
});

describe('Value Objects', () => {
  describe('Email', () => {
    it('deve criar email válido', () => {
      const email = Email.criar('test@example.com');
      expect(email.value).toBe('test@example.com');
    });

    it('deve normalizar email', () => {
      const email = Email.criar('TEST@EXAMPLE.COM');
      expect(email.value).toBe('test@example.com');
    });

    it('deve lançar erro com email inválido', () => {
      expect(() => Email.criar('invalid-email')).toThrow('Email inválido');
    });
  });

  describe('Nome', () => {
    it('deve criar nome válido', () => {
      const nome = Nome.criar('João Silva');
      expect(nome.value).toBe('João Silva');
    });

    it('deve lançar erro com nome muito curto', () => {
      expect(() => Nome.criar('a')).toThrow('Nome deve ter pelo menos 2 caracteres');
    });

    it('deve lançar erro com nome muito longo', () => {
      expect(() => Nome.criar('a'.repeat(101))).toThrow('Nome não pode ter mais de 100 caracteres');
    });
  });

  describe('Quantidade', () => {
    it('deve criar quantidade válida', () => {
      const quantidade = Quantidade.criar(100);
      expect(quantidade.value).toBe(100);
    });

    it('deve arredondar para inteiro', () => {
      const quantidade = Quantidade.criar(100.7);
      expect(quantidade.value).toBe(100);
    });

    it('deve lançar erro com quantidade zero', () => {
      expect(() => Quantidade.criar(0)).toThrow('Quantidade deve ser maior que zero');
    });

    it('deve somar quantidades', () => {
      const q1 = Quantidade.criar(100);
      const q2 = Quantidade.criar(50);
      const resultado = q1.somar(q2);
      expect(resultado.value).toBe(150);
    });
  });

  describe('Etapa', () => {
    it('deve criar etapa válida', () => {
      const etapa = Etapa.criar('recebimento');
      expect(etapa.value).toBe('RECEBIMENTO');
    });

    it('deve normalizar etapa', () => {
      const etapa = Etapa.criar('digitalizacao');
      expect(etapa.value).toBe('DIGITALIZACAO');
    });

    it('deve verificar tipo de etapa', () => {
      const etapa = Etapa.criar('RECEBIMENTO');
      expect(etapa.isRecebimento()).toBe(true);
      expect(etapa.isDigitalizacao()).toBe(false);
    });

    it('deve verificar se pode avançar', () => {
      const recebimento = Etapa.criar('RECEBIMENTO');
      const digitalizacao = Etapa.criar('DIGITALIZACAO');

      expect(recebimento.podeAvancarPara(digitalizacao)).toBe(true);
      expect(digitalizacao.podeAvancarPara(recebimento)).toBe(false);
    });
  });

  describe('Perfil', () => {
    it('deve criar perfil válido', () => {
      const perfil = Perfil.criar('operador');
      expect(perfil.value).toBe('operador');
    });

    it('deve normalizar perfil', () => {
      const perfil = Perfil.criar('ADMINISTRADOR');
      expect(perfil.value).toBe('administrador');
    });

    it('deve verificar tipo de perfil', () => {
      const operador = Perfil.criar('operador');
      const administrador = Perfil.criar('administrador');

      expect(operador.isOperador()).toBe(true);
      expect(operador.isAdministrador()).toBe(false);
      expect(administrador.isAdministrador()).toBe(true);
    });

    it('deve verificar permissões do perfil', () => {
      const operador = Perfil.criar('operador');
      const administrador = Perfil.criar('administrador');

      expect(operador.temPermissao('visualizar_dashboard')).toBe(true);
      expect(operador.temPermissao('gerenciar_usuarios')).toBe(false);
      expect(administrador.temPermissao('gerenciar_usuarios')).toBe(true);
    });
  });
});
