# 📚 Documentação do Sistema Recorda

Bem-vindo à documentação completa do Sistema Recorda - uma solução abrangente para gestão de processos de digitalização documental.

---

## 📖 Índice da Documentação

### 🚀 Guias de Início Rápido
- [**Instalação e Configuração**](INSTALACAO.md) - Como configurar o ambiente
- [**Guia de Desenvolvimento**](DESENVOLVIMENTO.md) - Para desenvolvedores
- [**Deploy e Produção**](DEPLOY.md) - Deploy em Railway/Vercel

### 🏗️ Arquitetura e Design
- [**Arquitetura do Sistema**](ARQUITETURA.md) - Visão geral da arquitetura
- [**Modelo de Domínio**](DOMINIO.md) - Entidades e regras de negócio
- [**Fluxo de Dados**](FLUXO_DADOS.md) - Como os dados trafegam

### 👥 Funcionalidades por Perfil
- [**Perfil Colaborador**](../SISTEMA_COLABORADOR_COMPLETO.md) - Lançamento de produção
- [**Perfil Operador**](OPERADOR.md) - Fluxo operacional
- [**Perfil Administrador**](ADMINISTRADOR.md) - Gestão e relatórios

### 🔒 Segurança e Qualidade
- [**Auditoria de Segurança**](../AUDITORIA_SEGURANCA_PRODUCAO.md) - Análise de segurança
- [**Validação de Fluxo**](../VALIDACAO_FLUXO_ETAPAS.md) - Regras de sequenciamento
- [**Testes**](TESTES.md) - Estratégia de testes

### 📚 Referência Técnica
- [**API Reference**](API.md) - Documentação de endpoints
- [**Database Schema**](DATABASE.md) - Esquema do banco de dados
- [**Migrações**](MIGRACOES.md) - Histórico de migrações

### 🔄 Manutenção e Operação
- [**CHANGELOG**](../CHANGELOG.md) - Histórico de versões
- [**Troubleshooting**](TROUBLESHOOTING.md) - Solução de problemas
- [**Backup e Recuperação**](BACKUP.md) - Procedimentos de backup

---

## 🎯 Visão Geral do Sistema

### O Que é o Recorda?

Recorda é um sistema completo de gestão de processos de digitalização documental que oferece:

- ✅ **Controle de Fluxo Operacional** - Rastreamento de repositórios através de etapas
- ✅ **Gestão de Produção** - Registro e controle de produtividade
- ✅ **Controle de Qualidade** - Checklists e validações
- ✅ **Metas e Indicadores** - Acompanhamento de performance
- ✅ **Relatórios Gerenciais** - Dashboards e exportações
- ✅ **Importação de Dados** - Integração com sistemas legados
- ✅ **Auditoria Completa** - Rastreabilidade total

### Tecnologias Principais

**Backend:**
- Node.js 20.x + TypeScript
- Fastify (API REST)
- PostgreSQL (Banco de dados)
- Zod (Validação)
- JWT (Autenticação)

**Frontend:**
- React 18 + TypeScript
- Vite (Build tool)
- TailwindCSS (Estilização)
- React Query (State management)
- Playwright (Testes E2E)

**Infraestrutura:**
- Docker (Desenvolvimento)
- Railway (Backend em produção)
- Vercel (Frontend em produção)
- GitHub Actions (CI/CD)

---

## 🏢 Perfis de Usuário

### 👤 Colaborador
**Acesso:** Limitado  
**Funcionalidades:**
- Lançar produção diária
- Visualizar histórico próprio
- Dashboard simplificado

### 👨‍💼 Operador
**Acesso:** Médio  
**Funcionalidades:**
- Todas do colaborador +
- Gerenciar fluxo operacional
- Importar dados legados
- Controle de repositórios

### 👑 Administrador
**Acesso:** Completo  
**Funcionalidades:**
- Todas do operador +
- Gerenciar usuários
- Visualizar todos os relatórios
- Configurar sistema
- Definir metas

---

## 📊 Módulos Principais

### 1. Fluxo Operacional
Controle de repositórios através de 7 etapas:
1. Recebimento
2. Preparação
3. Digitalização
4. Conferência
5. Reconferência
6. Montagem
7. Atendimento

### 2. Produção
- Lançamento direto por colaboradores
- Importação de planilhas legadas
- Diferenciação por origem (SISTEMA vs LEGADO)
- Validação de duplicatas
- Sequenciamento obrigatório de etapas

### 3. Controle de Qualidade
- Checklists por etapa
- Validações automáticas
- Rastreamento de problemas

### 4. Metas e Indicadores
- Metas individuais e por equipe
- Acompanhamento em tempo real
- Dashboards interativos

### 5. Relatórios
- Exportação Excel/CSV
- Filtros avançados
- Visualizações gráficas

---

## 🚀 Início Rápido

### Pré-requisitos
```bash
Node.js 20.x
Docker
npm 10.x
```

### Instalação em 5 Passos

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/recorda.git
cd recorda

# 2. Instale dependências
npm install

# 3. Configure ambiente
cp .env.example .env
# Edite .env com suas configurações

# 4. Inicie PostgreSQL
docker-compose up -d

# 5. Bootstrap do banco e iniciar
npm run db:bootstrap
npm run dev
```

**Acesse:** http://localhost:5173

**Login padrão:**
- Email: `admin@recorda.com`
- Senha: `admin123`

---

## 📚 Documentação por Tópico

### Para Começar
1. Leia [Instalação e Configuração](INSTALACAO.md)
2. Entenda a [Arquitetura](ARQUITETURA.md)
3. Explore o [Modelo de Domínio](DOMINIO.md)

### Para Desenvolver
1. Siga o [Guia de Desenvolvimento](DESENVOLVIMENTO.md)
2. Consulte a [API Reference](API.md)
3. Execute os [Testes](TESTES.md)

### Para Deploy
1. Leia o [Guia de Deploy](DEPLOY.md)
2. Configure [Backup e Recuperação](BACKUP.md)
3. Consulte [Troubleshooting](TROUBLESHOOTING.md)

---

## 🔍 Recursos Adicionais

### Documentos Específicos

- [Sistema de Colaborador Completo](../SISTEMA_COLABORADOR_COMPLETO.md)
- [Auditoria de Segurança](../AUDITORIA_SEGURANCA_PRODUCAO.md)
- [Validação de Fluxo de Etapas](../VALIDACAO_FLUXO_ETAPAS.md)
- [Testes Implementados](../TESTES_COLABORADOR_PENDENTES.md)

### Links Úteis

- [Repositório GitHub](https://github.com/seu-usuario/recorda)
- [Issues e Bugs](https://github.com/seu-usuario/recorda/issues)
- [Roadmap](../docs/BACKLOG_EXECUTAVEL_2026.md)

---

## 📞 Suporte

**Encontrou um problema?**
1. Consulte o [Troubleshooting](TROUBLESHOOTING.md)
2. Procure em [Issues](https://github.com/seu-usuario/recorda/issues)
3. Abra uma nova issue se necessário

**Quer contribuir?**
1. Leia o [Guia de Desenvolvimento](DESENVOLVIMENTO.md)
2. Fork o projeto
3. Crie uma branch para sua feature
4. Envie um Pull Request

---

## 📄 Licença

Copyright © 2026 Recorda. Todos os direitos reservados.

---

**Última Atualização:** Abril 2026  
**Versão da Documentação:** 1.0.0
