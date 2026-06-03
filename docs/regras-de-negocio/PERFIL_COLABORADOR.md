# Perfil Colaborador - Documentação

## 📋 Visão Geral

Implementação do perfil **colaborador** no sistema Recorda, permitindo que colaboradores operacionais lancem suas próprias produções e visualizem seu histórico individual.

Data de implementação: 15/04/2026

## 🎯 Objetivos

1. Permitir que colaboradores lancem suas produções sem precisar de perfil operador
2. Visualização individual de histórico de produção
3. Vinculação administrativa de registros importados a usuários específicos

## 🔧 Implementações Realizadas

### 1. Migration de Banco de Dados

**Arquivo:** `db/migrations/066_add_perfil_colaborador.sql`

```sql
ALTER TYPE perfil_usuario ADD VALUE IF NOT EXISTS 'colaborador';
```

Adiciona o valor 'colaborador' ao enum existente `perfil_usuario`.

**Executar migration:**

```bash
# Aplicar em desenvolvimento
psql -U postgres -d recorda < db/migrations/066_add_perfil_colaborador.sql

# Ou via aplicação (se houver sistema de migrations automático)
npm run migrate
```

### 2. Tipo TypeScript Atualizado

**Arquivo:** `packages/backend/src/infrastructure/http/middleware/auth.ts`

```typescript
export type PerfilUsuario = 'colaborador' | 'operador' | 'administrador';
```

### 3. Novas APIs Implementadas

#### 3.1. GET /producao/meu-historico

**Descrição:** Permite colaborador visualizar seu próprio histórico de produção

**Autenticação:** Requerida (colaborador, operador ou administrador)

**Query Parameters:**

- `dataInicio` (opcional): Data início no formato YYYY-MM-DD
- `dataFim` (opcional): Data fim no formato YYYY-MM-DD
- `etapa` (opcional): Filtrar por etapa específica
- `limite` (opcional, padrão: 50): Itens por página
- `pagina` (opcional, padrão: 1): Número da página

**Resposta:**

```json
{
  "producoes": [
    {
      "id": "uuid",
      "etapa": "DIGITALIZACAO",
      "quantidade": 1,
      "data_producao": "2025-08-05T00:00:00Z",
      "marcadores": {},
      "id_repositorio_ged": "000179/2025",
      "orgao": "SGPA",
      "projeto": "IMPORTACAO_PRODUCAO"
    }
  ],
  "total": 150,
  "pagina": 1,
  "totalPaginas": 3
}
```

**Exemplo de uso:**

```bash
curl -X GET "http://localhost:3000/producao/meu-historico?dataInicio=2025-08-01&limite=20" \
  -H "Authorization: Bearer {token}"
```

#### 3.2. PATCH /producao/:id/vincular-usuario

**Descrição:** Permite admin vincular/reatribuir registro de produção a outro usuário

**Autenticação:** Requerida (apenas administrador)

**Body:**

```json
{
  "usuarioId": "uuid-do-usuario"
}
```

**Resposta:**

```json
{
  "message": "Produção vinculada com sucesso",
  "producao": { ... }
}
```

**Exemplo de uso:**

```bash
curl -X PATCH "http://localhost:3000/producao/{id}/vincular-usuario" \
  -H "Authorization: Bearer {admin-token}" \
  -H "Content-Type: application/json" \
  -d '{"usuarioId": "uuid-do-colaborador"}'
```

### 4. Rotas Atualizadas

As seguintes rotas agora aceitam perfil **colaborador**:

#### Produção e Histórico

- ✅ `GET /producao/metas` - Visualizar metas de produção
- ✅ `GET /producao/desempenho` - Visualizar indicadores (todos os usuários)
- ✅ `GET /producao/mapeamentos` - Listar templates
- ✅ `POST /operacional/repositorios/:id/producao` - **Registrar produção**
- ✅ `GET /producao/meu-historico` - **NOVO** - Ver próprio histórico

#### Apenas Admin

- 🔒 `PATCH /producao/:id/vincular-usuario` - **NOVO** - Vincular produção a usuário

## 👥 Hierarquia de Perfis

```
┌─────────────────┐
│  Administrador  │ ← Acesso total
└────────┬────────┘
         │
┌────────▼────────┐
│    Operador     │ ← Operações completas do sistema
└────────┬────────┘
         │
┌────────▼────────┐
│  Colaborador    │ ← Apenas lançamento de produção + histórico próprio
└─────────────────┘
```

### Permissões por Perfil

| Funcionalidade          | Colaborador | Operador | Admin |
| ----------------------- | :---------: | :------: | :---: |
| Lançar produção própria |     ✅      |    ✅    |  ✅   |
| Ver próprio histórico   |     ✅      |    ✅    |  ✅   |
| Ver histórico de outros |     ❌      |    ✅    |  ✅   |
| Importar planilhas      |     ❌      |    ✅    |  ✅   |
| Gerenciar repositórios  |     ❌      |    ✅    |  ✅   |
| Vincular produções      |     ❌      |    ❌    |  ✅   |
| Gerenciar usuários      |     ❌      |    ❌    |  ✅   |

## 📝 Fluxo de Uso

### 1. Criar Colaborador como Usuário

**Opção A - Interface Admin:**

```
1. Admin acessa Gerenciar Usuários
2. Clica em "Novo Usuário"
3. Preenche:
   - Nome: Yasmin Melo
   - Email: yasmin.melo@empresa.com
   - Senha: [senha inicial]
   - Perfil: Colaborador ← NOVO PERFIL
   - Coordenadoria: SGPA
4. Salvar
```

**Opção B - API:**

```bash
POST /usuarios
{
  "nome": "Yasmin Melo",
  "email": "yasmin.melo@empresa.com",
  "senha": "senha123",
  "perfil": "colaborador",
  "coordenadoriaId": "uuid-sgpa"
}
```

### 2. Colaborador Lança Produção

```
1. Colaborador faz login
2. Acessa interface de produção
3. Seleciona repositório (ex: 000179/2025)
4. Informa:
   - Etapa: Recebimento
   - Quantidade: 1
   - Tipo: Caixas
5. Sistema registra automaticamente com seu usuario_id
```

### 3. Colaborador Visualiza Histórico

```
1. Colaborador acessa "Meu Histórico"
2. Vê apenas suas próprias produções
3. Pode filtrar por:
   - Data
   - Etapa
   - Repositório
```

### 4. Admin Vincula Histórico Importado

Quando histórico foi importado e precisa ser reatribuído:

```bash
# 1. Admin identifica ID da produção a reatribuir
GET /producao/desempenho

# 2. Admin vincula ao usuário correto
PATCH /producao/{id-producao}/vincular-usuario
{
  "usuarioId": "uuid-do-colaborador-correto"
}
```

## 🔄 Compatibilidade com Sistema de Importação

O sistema de importação existente (`POST /operacional/importacoes-legado/producao`) **continua funcionando** e agora:

1. Busca usuários por nome do colaborador (fuzzy matching)
2. Se não encontrar, usa usuário padrão (fallback)
3. Admin pode **reatribuir** depois usando nova API

## ⚠️ Considerações Importantes

### Migração de Dados Existentes

**Colaboradores antigos na tabela `colaboradores`:**

- Continuam existindo normalmente
- **NÃO têm login automaticamente**
- Admin precisa criar usuário correspondente manualmente

**Para migrar em lote:**

```sql
-- Exemplo: criar usuários para colaboradores existentes
INSERT INTO usuarios (nome, email, senha_hash, perfil, coordenadoria_id, ativo)
SELECT
  c.nome,
  COALESCE(c.email, LOWER(REPLACE(c.nome, ' ', '.')) || '@empresa.com'),
  '$2b$10$defaulthash...', -- Hash padrão temporário
  'colaborador',
  c.coordenadoria_id,
  c.ativo
FROM colaboradores c
WHERE c.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.email = c.email);
```

### Segurança

- Colaboradores **só veem próprio histórico**
- Não podem modificar ou deletar registros
- Não podem acessar dados de outros usuários
- Token JWT identifica automaticamente o usuário logado

## 🧪 Testes Sugeridos

### 1. Criar Usuário Colaborador

```bash
POST /usuarios
{
  "nome": "Teste Colaborador",
  "email": "teste.colab@empresa.com",
  "senha": "senha123",
  "perfil": "colaborador"
}
```

### 2. Login e Obter Token

```bash
POST /auth/login
{
  "email": "teste.colab@empresa.com",
  "senha": "senha123"
}
```

### 3. Registrar Produção

```bash
POST /operacional/repositorios/{id}/producao
Authorization: Bearer {token-colaborador}
{
  "etapa": "RECEBIMENTO",
  "checklistId": "uuid-checklist",
  "quantidade": 1
}
```

### 4. Ver Próprio Histórico

```bash
GET /producao/meu-historico
Authorization: Bearer {token-colaborador}
```

### 5. Tentar Vincular (deve falhar)

```bash
PATCH /producao/{id}/vincular-usuario
Authorization: Bearer {token-colaborador}
# Resposta esperada: 403 Forbidden
```

## 📚 Próximos Passos Recomendados

1. **Frontend**: Criar interface específica para colaboradores
2. **Onboarding**: Automatizar criação de usuário ao cadastrar colaborador
3. **Notificações**: Avisar colaborador quando produção for vinculada a ele
4. **Relatórios**: Adicionar relatório individual de produtividade
5. **Mobile**: Criar app mobile para colaboradores lançarem produção

## 🐛 Troubleshooting

### Erro: "Perfil colaborador não existe"

**Solução:** Executar migration `066_add_perfil_colaborador.sql`

### Erro: TypeScript não reconhece tipo 'colaborador'

**Solução:** Reiniciar servidor TypeScript após atualizar `auth.ts`

### Colaborador não consegue lançar produção

**Verificar:**

1. Token JWT válido
2. Perfil = 'colaborador' no banco
3. Usuário ativo = true
4. Checklist existe e está aberto

### Histórico vazio para colaborador

**Verificar:**

1. Produções têm `usuario_id` do colaborador
2. Não há filtro de data muito restritivo
3. Usuário está ativo no sistema

## 📞 Suporte

Para dúvidas ou problemas, consulte:

- Documentação completa: `/docs`
- Logs do sistema: `/logs`
- API Swagger: `http://localhost:3000/documentation`

---

## Perfil Visualizador

Uso:

- acesso temporario e controlado para validacao externa
- suporte, auditoria tecnica ou infraestrutura

Permissoes:

- autenticar no sistema
- acessar dashboard
- acessar comunicados em modo leitura

Restricoes:

- nao cria, edita, exclui, importa, exporta, aprova, cancela ou reprocessa
- nao acessa configuracoes administrativas
- nao altera usuarios, perfis ou permissoes
- nao marca comunicado como lido

Indicacao operacional:

- criar usuario temporario com `ADMIN_ROLE=visualizador`
- usar email tecnico como `infra.visualizacao@recorda.local`
- definir senha forte por variavel de ambiente
- remover ou desativar o usuario apos a validacao
