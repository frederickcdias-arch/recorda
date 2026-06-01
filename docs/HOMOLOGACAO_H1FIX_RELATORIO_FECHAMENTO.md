# HOMOLOGAÇÃO H1-FIX — RELATÓRIO DE FECHAMENTO DAS RESSALVAS

**Data:** 2025-06-09  
**Base:** [HOMOLOGACAO_H1_RELATORIO_FINAL.md](./HOMOLOGACAO_H1_RELATORIO_FINAL.md)  
**Escopo:** Resolução das ressalvas abertas ao término da H1

---

## 1. O QUE FOI VERIFICADO

| Item  | O que foi verificado                                                                            |
| ----- | ----------------------------------------------------------------------------------------------- |
| H1-01 | Email `admin@recorda.com` — rastreado em todos os arquivos do repositório                       |
| H1-03 | Combobox "Responsável pela Retirada" na página Devoluções — análise do componente e do endpoint |
| H1-02 | Texto de ajuda na página Relatório de Ausências — comparado com label do botão                  |
| H1-04 | Texto de ajuda na página Relatórios Gerenciais — comparado com label do botão                   |
| H1-05 | Cabeçalho "Periodo da exportacao" na página Exportações                                         |
| H1-06 | Banner "Disponivel por" e texto "ate 10 MB" na página Captura de Mapas                          |
| H1-08 | Labels de filtro "Meio periodo" na página Minhas Ausências                                      |

---

## 2. O QUE FOI CORRIGIDO

### Correções de texto / acentuação (Severidade D)

| Ressalva  | Arquivo                                                               | Antes                                                      | Depois                                              |
| --------- | --------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| **H1-02** | `packages/frontend/src/pages/relatorios/RelatorioAusenciasPage.tsx`   | `…clique em **Gerar relatório** para visualizar os dados.` | `…clique em **Visualizar** para carregar os dados.` |
| **H1-04** | `packages/frontend/src/pages/relatorios/RelatoriosGerenciaisPage.tsx` | `…clique em **Gerar visualização**.`                       | `…clique em **Visualizar**.`                        |
| **H1-05** | `packages/frontend/src/pages/relatorios/ExportacoesPage.tsx`          | `Periodo da exportacao`                                    | `Período da exportação`                             |
| **H1-06** | `packages/frontend/src/pages/colaborador/CapturaMapaPage.tsx`         | `Disponivel por` / `ate 10 MB`                             | `Disponível por` / `até 10 MB`                      |
| **H1-08** | `packages/frontend/src/pages/colaborador/MinhasAusenciasPage.tsx`     | `Meio periodo (manha)` / `Meio periodo (tarde)`            | `Meio período (manhã)` / `Meio período (tarde)`     |

---

## 3. O QUE FOI APENAS DOCUMENTADO

### H1-01 — Email admin oficial

**Conclusão:** `admin@recorda.com` **nunca foi** uma conta de usuário real. Ocorrências no repositório:

| Local                                                                 | Contexto                                                                                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/backend/src/infrastructure/http/server.integration.test.ts` | Usado como **email de contato da empresa** no payload de `PUT /configuracao/empresa` — não é credencial de login |
| `packages/frontend/tests/e2e/support/auth.ts`                         | Fallback em testes E2E: tenta `admin@recorda.local` e depois `admin@recorda.com` (aceito pelo mock)              |
| `packages/frontend/tests/e2e/support/mockApi.ts`                      | Mock de autenticação aceita ambos via `isAdminLogin()`                                                           |
| `tests/manual/`                                                       | Scripts de teste manual legados                                                                                  |

**Email oficial do ambiente de desenvolvimento:** `admin@recorda.local / admin123`  
**Script de criação:** `scripts/create-admin-user.js` — usa `ADMIN_EMAIL` env var (padrão `admin@recorda.local`)  
**Seed:** `db/migrations/019_usuarios.sql` — insere apenas `admin@recorda.local`

> **Ação recomendada para produção:** definir `ADMIN_EMAIL` e `ADMIN_PASSWORD` via variáveis de ambiente ao executar `create-admin-user.js`. O email de produção pode ser qualquer endereço válido; não há dependência hardcoded.

---

### H1-03 — Combobox "Responsável pela Retirada" vazio

**Conclusão:** Comportamento esperado. O campo é um `<Input>` com `<datalist>` de autocomplete alimentado pelo endpoint `GET /operacional/responsaveis-retirada-opcoes`, que retorna nomes históricos de `responsavel_retirada` de devoluções anteriores. Em um banco de dados sem devoluções cadastradas (dev/staging zerado), o datalist fica vazio — mas o campo é totalmente funcional para digitação livre. Não é um bug.

---

## 4. ARQUIVOS ALTERADOS

```
packages/frontend/src/pages/relatorios/RelatorioAusenciasPage.tsx   (texto vazio estado)
packages/frontend/src/pages/relatorios/RelatoriosGerenciaisPage.tsx  (texto vazio estado)
packages/frontend/src/pages/relatorios/ExportacoesPage.tsx           (acento cabeçalho)
packages/frontend/src/pages/colaborador/CapturaMapaPage.tsx          (2 acentos)
packages/frontend/src/pages/colaborador/MinhasAusenciasPage.tsx      (2 labels de filtro)
```

---

## 5. RESULTADO DAS VALIDAÇÕES MANDATÓRIAS

| Validação                                         | Resultado                                       |
| ------------------------------------------------- | ----------------------------------------------- |
| `npm run typecheck --workspace=@recorda/backend`  | ✅ PASS — 0 erros                               |
| `npm run typecheck --workspace=@recorda/frontend` | ✅ PASS — 0 erros                               |
| `npm run test --workspace=@recorda/backend`       | ✅ PASS — 32 suites / **414 testes**            |
| `npm run test --workspace=@recorda/frontend`      | ✅ PASS — 8 suites / **72 testes**              |
| `npm run build`                                   | ✅ PASS — build limpo (frontend + PWA + shared) |

---

## 6. STATUS FINAL

| Ressalva                                          | Severidade | Status                                                                                             |
| ------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| H1-01 — Email admin `@recorda.com`                | B          | ✅ **ENCERRADA** — documentado: apenas teste/mock; dev usa `admin@recorda.local`; prod via env var |
| H1-02 — Texto de ajuda inconsistente (Ausências)  | D          | ✅ **CORRIGIDA**                                                                                   |
| H1-03 — Combobox Responsável vazio                | D          | ✅ **ENCERRADA** — comportamento esperado em DB sem histórico de devoluções                        |
| H1-04 — Texto de ajuda inconsistente (Gerenciais) | D          | ✅ **CORRIGIDA**                                                                                   |
| H1-05 — Acento "Período da exportação"            | D          | ✅ **CORRIGIDA**                                                                                   |
| H1-06 — Acentos "Disponível" e "até"              | D          | ✅ **CORRIGIDA**                                                                                   |
| H1-08 — Acentos "Meio período (manhã/tarde)"      | D          | ✅ **CORRIGIDA**                                                                                   |

### 🟢 HOMOLOGAÇÃO H1 FECHADA

Todas as ressalvas foram encerradas. Nenhum item de severidade A, B ou C permanece aberto.  
As correções são exclusivamente cosméticas (texto/acentuação) e não afetam lógica de negócio.  
O sistema está apto para promoção ao próximo ambiente.
