# SEC-7 — Auditoria de IDOR, Autorização por Perfil e Exposição de Dados

**Data:** 2026-07-17  
**Escopo:** Backend — todas as rotas HTTP (`packages/backend/src/infrastructure/http/routes/`)  
**Objetivo:** Identificar falhas de IDOR (Insecure Direct Object Reference), acesso indevido por troca de ID, exposição excessiva de dados e ausência de controle de autorização por perfil.  
**Status:** ✅ CONCLUÍDA — 1 categoria de achado corrigida, todos os testes passando

---

## 1. Metodologia

Para cada arquivo de rota, foram verificados:

1. **Authenticate**: toda rota não-pública tem `preHandler: [server.authenticate]` ou equivalente?
2. **Authorize**: rotas que expõem dados sensíveis ou executam operações de escrita têm `authorize(perfil)` adequado?
3. **IDOR**: queries de leitura/escrita com parâmetros de URL (`:id`) incluem filtro por `usuario_id` do token JWT para impedir acesso a recursos de outros usuários?
4. **Exposição de dados**: resposta da API retorna apenas campos necessários para o perfil do solicitante?

---

## 2. Infraestrutura de Autorização (revisada e verificada)

### `packages/backend/src/infrastructure/http/middleware/auth.ts`

```typescript
// authenticate — verifica JWT e propaga user.id para Postgres
export async function authenticate(request, reply) {
  try {
    await request.jwtVerify();
    const user = request.user as { id?: string };
    if (user?.id) {
      await server.database?.query(
        `SELECT set_config('app.current_user_id', $1, true)`,
        [user.id]
      );
    }
  } catch { reply.status(401).send(...) }
}

// authorize — factory de middleware por perfil
export function authorize(...perfisPermitidos: PerfilUsuario[]) {
  return async (request, reply) => {
    const user = request.user as { perfil: PerfilUsuario };
    if (!user) return reply.status(401).send(...);
    if (!perfisPermitidos.includes(user.perfil)) return reply.status(403).send(...);
  };
}
```

**Avaliação:** SEGURO. JWT verificado criptograficamente; perfil propagado do token, não do banco.

### Hierarquia de Perfis

| Perfil          | Permissões                                                                             |
| --------------- | -------------------------------------------------------------------------------------- |
| `colaborador`   | `visualizar_dashboard`                                                                 |
| `operador`      | `visualizar_dashboard`, `gerar_relatorios`, `importar_producao`, `capturar_documentos` |
| `administrador` | todos os acima + `gerenciar_configuracoes`, `gerenciar_usuarios`                       |

---

## 3. Achados

### SEC-7-C1 — Severidade MÉDIO — `GET /colaboradores` sem restrição de perfil

| Campo              | Valor                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Arquivo**        | `packages/backend/src/infrastructure/http/routes/colaboradores.ts` linha 83                                                   |
| **Rota**           | `GET /colaboradores`                                                                                                          |
| **Condição**       | Qualquer usuário autenticado (inclusive `colaborador`) podia listar todos os colaboradores                                    |
| **Dados expostos** | `id`, `nome`, `matricula`, **`email`**, `ativo`, `coordenadoria_id`, `criado_em`, `coordenadoria_nome`, `coordenadoria_sigla` |
| **Impacto**        | PII (email, matrícula) de todos os colaboradores acessível a qualquer autenticado                                             |
| **CVSS estimado**  | 4.3 (Medium) — AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N                                                                            |

**Correção aplicada:**

```typescript
// Antes
preHandler: [server.authenticate, validateQuery(listarColaboradoresQuerySchema)],

// Depois
preHandler: [server.authenticate, authorize('operador', 'administrador'), validateQuery(listarColaboradoresQuerySchema)],
```

### SEC-7-C2 — Severidade MÉDIO — `GET /colaboradores/:id` sem restrição de perfil

| Campo              | Valor                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| **Arquivo**        | `packages/backend/src/infrastructure/http/routes/colaboradores.ts` linha 285                    |
| **Rota**           | `GET /colaboradores/:id`                                                                        |
| **Condição**       | Qualquer usuário autenticado (inclusive `colaborador`) podia buscar qualquer colaborador por ID |
| **Dados expostos** | `c.*` — **todos os campos** da tabela `colaboradores` + coordenadoria                           |
| **Impacto**        | Exposição de todos os campos de qualquer colaborador; enumeration possível                      |
| **CVSS estimado**  | 4.3 (Medium) — AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N                                              |

**Correção aplicada:**

```typescript
// Antes
preHandler: [server.authenticate],

// Depois
preHandler: [server.authenticate, authorize('operador', 'administrador')],
```

**Verificação de impacto no frontend:** O frontend não utiliza `GET /colaboradores` nem `GET /colaboradores/:id` diretamente em nenhum hook ou componente com perfil `colaborador`. As funções `useUsuariosColaboradores()` e `useCoordenadorias()` apontam para `/admin/usuarios-colaboradores` e `/coordenadorias` respectivamente — não afetadas pela correção.

---

## 4. Rotas Auditadas — Resultado por Arquivo

### 4.1 `auth.ts` ✅ SEGURO

| Rota                         | Proteção                           | Obs.                                    |
| ---------------------------- | ---------------------------------- | --------------------------------------- |
| `POST /auth/login`           | Público (intencional)              | Rate-limited                            |
| `POST /auth/refresh`         | Verifica refresh token bcrypt hash | Sem IDOR                                |
| `POST /auth/logout`          | `server.authenticate`              | DELETE usa `usuario_id = user.id`       |
| `POST /auth/forgot-password` | Público (intencional)              | Rate-limited; não vaza existência       |
| `POST /auth/reset-password`  | Token temporário                   | Token invalidado após uso               |
| `GET /auth/me`               | `server.authenticate`              | Retorna apenas dados do próprio usuário |

### 4.2 `ausencias.ts` ✅ SEGURO

| Rota                           | Proteção                                    | Anti-IDOR                                |
| ------------------------------ | ------------------------------------------- | ---------------------------------------- |
| `GET /tipos-ausencia`          | `server.authenticate`                       | Dados públicos (tipos, sem PII)          |
| `GET /ausencias/minhas`        | `authenticate` + `authorize('colaborador')` | `WHERE usuario_id = user.id`             |
| `POST /ausencias`              | `authenticate` + `authorize('colaborador')` | Bloqueado (feature desabilitada)         |
| `GET /ausencias/:id/anexo`     | `authenticate` + `authorize('colaborador')` | `WHERE id = $1 AND usuario_id = user.id` |
| `POST /ausencias/:id/cancelar` | `authenticate` + `authorize('colaborador')` | `WHERE id = $2 AND usuario_id = $3`      |

### 4.3 `comunicados.ts` ✅ SEGURO (1415 linhas)

| Rota                                | Proteção                     | Anti-IDOR                       |
| ----------------------------------- | ---------------------------- | ------------------------------- |
| `GET /admin/comunicados/*` (todos)  | `authorize('administrador')` | ✅                              |
| `GET /comunicados`                  | `server.authenticate`        | `WHERE cd.usuario_id = user.id` |
| `GET /comunicados/nao-lidos`        | `server.authenticate`        | `WHERE cd.usuario_id = user.id` |
| `POST /comunicados/:id/marcar-lido` | `server.authenticate`        | `AND cd.usuario_id = user.id`   |

### 4.4 `capturas-mapa.ts` ✅ SEGURO

Todos os endpoints usam `authorize('colaborador')` e filtragem por `usuario_id = user.id` nas queries.

### 4.5 `relatorios.ts` ✅ SEGURO

Todos os endpoints usam `authorize('operador', 'administrador')`.

### 4.6 `colaboradores.ts` ⚠️ CORRIGIDO (achados SEC-7-C1, SEC-7-C2)

Ver seção 3 para detalhes. Após correção:

| Rota                                    | Proteção                                                  | Status                             |
| --------------------------------------- | --------------------------------------------------------- | ---------------------------------- |
| `GET /coordenadorias`                   | `server.authenticate`                                     | ✅ Dados não-PII (id, nome, sigla) |
| `GET /colaboradores`                    | `authenticate` + `authorize('operador', 'administrador')` | ✅ CORRIGIDO                       |
| `POST /colaboradores`                   | `authenticate` + `authorize('administrador')`             | ✅                                 |
| `PUT /colaboradores/:id`                | `authenticate` + `authorize('administrador')`             | ✅                                 |
| `PATCH /colaboradores/:id/toggle-ativo` | `authenticate` + `authorize('administrador')`             | ✅                                 |
| `GET /colaboradores/:id`                | `authenticate` + `authorize('operador', 'administrador')` | ✅ CORRIGIDO                       |

### 4.7 `admin.ts` ✅ SEGURO

Todos os endpoints verificados usam `authorize('administrador')`.

### 4.8 `health.ts` ✅ SEGURO

| Rota           | Proteção                                 | Obs.                            |
| -------------- | ---------------------------------------- | ------------------------------- |
| `GET /health`  | Público (intencional)                    | Necessário para liveness probes |
| `GET /metrics` | `authorize('operador', 'administrador')` | ✅                              |

### 4.9 `configuracao.ts` ✅ SEGURO

| Rota                         | Proteção                     | Obs.                                  |
| ---------------------------- | ---------------------------- | ------------------------------------- |
| `GET /configuracao/empresa`  | `server.authenticate`        | Dados da empresa (não PII individual) |
| `GET /configuracao/projetos` | `server.authenticate`        | Lista de projetos (não sensível)      |
| `PUT /configuracao/empresa`  | `authorize('administrador')` | ✅                                    |
| Demais endpoints de escrita  | `authorize('administrador')` | ✅                                    |

### 4.10 `auditoria.ts` ✅ SEGURO

Todos os endpoints usam `authorize('operador', 'administrador')`.

### 4.11 `etapas.ts` ✅ SEGURO

- `GET /etapas` — `authorize('operador', 'administrador')`
- Escritas — `authorize('administrador')`

### 4.12 `metas.ts` ✅ SEGURO

- `GET /producao/metas` — `authorize('colaborador', 'operador', 'administrador')` — retorna metas globais (sem dados de outros usuários)
- Lançamentos de produção — filtrados por `WHERE pr.usuario_id = user.id`
- Escritas administrativas — `authorize('administrador')`

### 4.13 `push.ts` ✅ SEGURO

- Registro e remoção de subscriptions — `server.authenticate` — todas as queries usam `WHERE usuario_id = user.id`

### 4.14 `dashboard.ts` ✅ SEGURO

Usa `authorize('operador', 'administrador')`.

### 4.15 `conhecimento-operacional.ts` ✅ SEGURO

- Leituras — `authorize('operador', 'administrador')`
- Escritas — `authorize('administrador')`

### 4.16 `operacional-avulsos.ts` ✅ SEGURO

Todos os endpoints usam `authorize('operador', 'administrador')`.

### 4.17 `operacional-checklists.ts` ✅ SEGURO

Todos os endpoints usam `authorize` com perfil adequado.

### 4.18 `operacional-cq.ts` ✅ SEGURO

- Leituras — `authorize('operador', 'administrador')`
- Escritas críticas — `authorize('administrador')`

### 4.19 `operacional-cq-sugestoes.ts` ✅ SEGURO

`authorize('colaborador', 'operador', 'administrador')` — dados não-PII (sugestões de repositório).

### 4.20 `operacional-devolucoes.ts` ✅ SEGURO

Todos os endpoints usam `authorize('operador', 'administrador')`.

### 4.21 `operacional-etiquetas.ts` ✅ SEGURO

`authorize('operador', 'administrador')`.

### 4.22 `operacional-importacao-legado.ts` ✅ SEGURO

- Operações de importação — `authorize('operador', 'administrador')`
- Operações destrutivas/admin — `authorize('administrador')`

### 4.23 `operacional-painel.ts` ✅ SEGURO

`authorize('operador', 'administrador')`.

### 4.24 `operacional-recebimento.ts` ✅ SEGURO

Todos os endpoints usam `authorize('operador', 'administrador')`.

### 4.25 `operacional-repositorios.ts` ✅ SEGURO

- Leituras acessíveis a `colaborador` — dados de repositório, não PII
- Escritas operacionais — `authorize('operador', 'administrador')`
- Operações administrativas — `authorize('administrador')`

---

## 5. Resumo dos Achados

| #        | Severidade | Arquivo            | Rota                     | Problema                                                            | Status       |
| -------- | ---------- | ------------------ | ------------------------ | ------------------------------------------------------------------- | ------------ |
| SEC-7-C1 | 🟡 MÉDIO   | `colaboradores.ts` | `GET /colaboradores`     | Sem `authorize()` — colaborador listava todos com email + matrícula | ✅ CORRIGIDO |
| SEC-7-C2 | 🟡 MÉDIO   | `colaboradores.ts` | `GET /colaboradores/:id` | Sem `authorize()` — colaborador via `c.*` de qualquer colaborador   | ✅ CORRIGIDO |

**Achados de IDOR (acesso a dados de outro usuário via ID):** NENHUM encontrado.  
Todas as queries que aceitam `:id` de parâmetro e retornam dados do próprio usuário incluem `AND usuario_id = user.id` ou equivalente.

**Rotas sem autenticação (intencionais):**

- `GET /health` — necessário para probes de infraestrutura
- `POST /auth/login` — pré-autenticação
- `POST /auth/refresh` — usa refresh token próprio
- `POST /auth/forgot-password` / `POST /auth/reset-password` — fluxo de recuperação

---

## 6. Validação

```
npm run typecheck --workspace=@recorda/backend  → ✅ sem erros
npm run test --workspace=@recorda/backend       → ✅ 414/414 testes passando
```

---

## 7. Recomendações Adicionais (não críticas)

1. **Paginação padrão em listagens**: `GET /colaboradores` aceita `limite` máximo configurável via query — considerar impor um teto (ex.: 200) para evitar extração massiva mesmo por operadores.
2. **Campos retornados em `GET /colaboradores/:id`**: `SELECT c.*` retorna todos os campos da tabela. Considerar projeção explícita para evitar expor campos adicionados futuramente sem revisão.
3. **`GET /configuracao/empresa`**: retorna CNPJ da empresa — não é PII individual, mas é dado corporativo sensível. Avaliar se `colaborador` precisa desta informação; se não, adicionar `authorize('operador', 'administrador')`.
