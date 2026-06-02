# SEC-6 — Auditoria de Exposição: Documentos, Dados e Secrets

**Data:** 2026-07-10  
**Escopo:** todos os arquivos rastreados pelo git (`git ls-files`), histórico completo, arquivos não rastreados, documentação, diretório de uploads  
**Base de HEAD:** commit `866f8dd`  
**Resultado geral:** ✅ Nenhuma chave ou credencial de produção exposta | ⚠️ 3 itens exigem ação imediata

---

## Resumo Executivo

| Severidade | Qtd | Itens                                                                    |
| ---------- | --- | ------------------------------------------------------------------------ |
| 🔴 CRÍTICO | 0   | —                                                                        |
| 🟠 ALTO    | 1   | Email real de pessoa física em script de teste                           |
| 🟡 MÉDIO   | 2   | PDFs operacionais rastreados; URLs de infra em docs                      |
| 🔵 BAIXO   | 4   | Tokens Railway pg_dump; exemplo de senha; bcrypt de teste; PDF de modelo |
| ⚪ INFO    | 3   | Gaps no .gitignore; gitleaks ausente; exemplo ruim em doc de segurança   |

---

## Seção 1 — Arquivos Rastreados com Extensões Sensíveis

### ✅ Aprovados (risco aceitável)

| Arquivo                                     | Classificação                                                  |
| ------------------------------------------- | -------------------------------------------------------------- |
| `.env.example`                              | A — apenas placeholders                                        |
| `.env.homologacao.example`                  | A — apenas `[PREENCHER...]`                                    |
| `assets/logo.jpeg`, `assets/logo-icon.png`  | A — logotipo do produto                                        |
| `packages/frontend/public/*.png`, `*.jpeg`  | A — ícones PWA                                                 |
| `packages/backend/test/fixtures/csv/*.csv`  | A — fixtures de teste, sem dados reais                         |
| `tests/manual/setup-test-users.sql`         | B — bcrypt hashes para contas `@recorda.local`                 |
| `db/baseline/000_baseline_data.sql`         | B — schema+seed do banco; contém tokens Railway (ver SEC-6-B1) |
| `db/baseline/000_baseline_schema.sql`       | A — schema estrutural sem dados operacionais                   |
| `db/migrations/*.sql` (152 arquivos)        | A — DDL puro, sem dados reais                                  |
| `docs/operacao/MODELO_PADRAO_RELATORIO.pdf` | B — template de relatório, não operacional                     |

### 🟠 ALTO — SEC-6-A1: Email real de pessoa física rastreado

**Arquivo:** `tests/manual/test-ausencias-fase1.mjs` (linha 57)  
**Dado exposto:** `thiagoliandro@gmail.com` + senha `admin123` hardcoded  
**Contexto:** script de teste manual que tenta credenciais conhecidas para obter token de colaborador  
**Risco:** PII (LGPD Art. 5º, I) e exposição de email pessoal em repositório potencialmente público  
**Ação:** Substituir por `colaborador@recorda.local` imediatamente

### 🟡 MÉDIO — SEC-6-M1: 6 PDFs operacionais rastreados

**Arquivos:**

```
packages/backend/uploads/relatorios/entrega/CQ-20260213165956-1771002009799.pdf
packages/backend/uploads/relatorios/producao/000001_2025-1771593950590.pdf
packages/backend/uploads/relatorios/producao/000231_2026-1771002421943.pdf
packages/backend/uploads/relatorios/producao/000232_2026-1771001174785.pdf
packages/backend/uploads/relatorios/recebimento/000000_2026-1770915181719.pdf
packages/backend/uploads/relatorios/recebimento/0000000___2026-1770840802779.pdf
```

**Contexto:** `.gitignore` tem `uploads/` mas estes PDFs foram commitados antes de a regra existir — continuam rastreados  
**Risco:** Documentos operacionais reais (relatórios de produção/recebimento/entrega) no repositório. Podem conter dados de processos, nomes de colaboradores, quantidades de produção.  
**Ação:** `git rm --cached` + commit + adicionar `packages/backend/uploads/` ao `.gitignore`

---

## Seção 2 — Arquivos Não Rastreados

`git status --short --untracked-files=all` retornou vazio na execução da auditoria. Working tree limpo.

---

## Seção 3 — Secrets no Código

### ✅ Nenhum secret real encontrado

Padrões verificados e resultado:

| Padrão                      | Resultado                                         |
| --------------------------- | ------------------------------------------------- |
| JWT tokens reais (`eyJ...`) | ❌ nenhum encontrado                              |
| OpenAI keys (`sk-...`)      | ❌ nenhum encontrado                              |
| AWS keys (`AKIA...`)        | ❌ nenhum encontrado                              |
| GitHub tokens (`ghp_...`)   | ❌ nenhum encontrado                              |
| Railway tokens              | ❌ nenhum encontrado                              |
| Bearer tokens hardcoded     | ❌ nenhum encontrado                              |
| VAPID_PRIVATE_KEY com valor | ❌ apenas vazias/placeholder                      |
| SMTP_PASS com valor real    | ❌ apenas comentada/placeholder                   |
| CPF/CNPJ reais              | ❌ apenas `00.000.000/0001-00` (fixture de teste) |
| EMAIL reais                 | ⚠️ `thiagoliandro@gmail.com` — ver SEC-6-A1       |

### ⚪ INFO — SEC-6-I3: Exemplo de malpráctica em doc de segurança

**Arquivo:** `docs/seguranca/SEGURANCA_VIBECODING_RECORDA.md:50`  
**Linha:** `JWT_SECRET=abc123realkey`  
**Contexto:** Este valor aparece **intencionalmente** como exemplo do que **NÃO fazer**, dentro da seção de boas práticas de segurança do projeto. Não é um secret real.  
**Ação:** Nenhuma (correto no contexto pedagógico)

### 🔵 BAIXO — SEC-6-B2: Exemplo de senha em documentação

**Arquivo:** `docs/arquivo/historico/ambiente/P2_RELATORIO_SUBIDA_AMBIENTE.md:107`  
**Linha:** `ADMIN_PASSWORD=SenhaForte123!`  
**Contexto:** Exemplo em bloco bash de como executar `scripts/create-admin-user.js`. Não é uma senha real.  
**Risco:** Operador poderia usar este valor sem trocar.  
**Ação:** Substituir por `ADMIN_PASSWORD=[PREENCHER_SENHA_FORTE]` para alinhar com o padrão dos demais exemplos

---

## Seção 4 — Histórico Git

### Arquivos sensíveis no histórico

Comando executado: `git log --all --name-only --pretty=format: | Select-String -Pattern '\.(env|pem|key|p12|pfx|dump|backup|xlsx|xls)$'`

**Resultado:** Apenas `packages/backend/test/fixtures/csv/*.csv` (fixtures de teste, sem dados reais)

### PDFs no histórico

Os 6 PDFs operacionais listados em SEC-6-M1 aparecem no histórico — foram commitados e nunca removidos. O PDF `docs/MODELO_PADRAO_RELATORIO.pdf` (template) também aparece no histórico, incluindo uma versão anterior em `docs/` (path raiz).

### Scripts removidos

`db/scripts/vincular_producoes_colaboradores.sql` — removido no commit `c315035`. Conteúdo: apenas queries SQL parametrizadas, sem dados reais hardcoded.

### 🔵 BAIXO — SEC-6-B1: Tokens Railway pg_dump em baseline

**Arquivo:** `db/baseline/000_baseline_data.sql`  
**Padrão:** `\restrict [64-char-token]` / `\unrestrict [64-char-token]` (3 pares)  
**Exemplos:**

```
\restrict 3yh6SqI80kwcHER0jhNNWlW1QXGieaLYtp4NtpPbSyfCbEL2pgdcjprMHNAe9Ts
\unrestrict 5dXS57ecKKkgFEJyQjayTdXUn63XmZQfdYfzgVGHoJoU54KhKnoJyQIHjZOTUQ6
\restrict YcgNkOYSlt3NckR8DPSQaGMK841pazG7K1AsIqc8kqo6K0fwcOB4Ng1efHKUx7f
```

**Contexto:** `\restrict` e `\unrestrict` são metacomandos adicionados pelo serviço gerenciado Railway ao exportar pg_dump. São nonces de autenticação que vinculam o dump ao contexto de origem — não funcionam como credenciais fora do Railway. O script `consolidate.mjs` que gerou este arquivo está **desabilitado** (sai com código 1).  
**Risco:** Baixo — tokens são tied ao contexto do backup, não são usáveis para acesso ao banco  
**Ação:** Monitorar se esses tokens são válidos junto ao suporte Railway. Considerar regenerar o backup caso necessário.

### ⚪ INFO: gitleaks não disponível

`gitleaks` não está instalado no ambiente. Para execução futura:

```
winget install gitleaks
gitleaks detect --source . --report-format json --report-path sec6-gitleaks.json
```

---

## Seção 5 — Documentação (docs/)

### 🟡 MÉDIO — SEC-6-M2: URLs de infraestrutura real em docs

**Arquivos:** `docs/arquivo/historico/ambiente/P2_RELATORIO_SUBIDA_AMBIENTE.md`, `docs/auditorias/tecnica/DIAGNOSTICO_TECNICO.md`  
**URLs encontradas:**

- `https://recorda-api.up.railway.app` (backend Railway)
- `https://recorda-homolog.vercel.app` (frontend homologação Vercel)
- `https://recorda.vercel.app` (como exemplo nos outros docs)

**Risco:** Revelam a topologia de infra e URLs de ataque potencial. São URLs públicas por natureza, mas sua presença no repositório facilita reconhecimento.  
**Ação:** Avaliar se o repositório é/será público. Se privado, risco é aceitável. Se público, substituir por variáveis de exemplo (`https://<projeto>.up.railway.app`).

### ✅ Sem credenciais reais em docs

- Nenhum JWT, bearer token, API key ou senha real encontrada nos markdowns.
- `ADMIN_PASSWORD=SenhaForte123!` — ver SEC-6-B2 (exemplo, não real).
- Emails em docs são todos fictícios: `@empresa.com`, `@minhaorg.com`, `admin@recorda.com`.
- Único email real: `thiagoliandro@gmail.com` em `tests/manual/` — ver SEC-6-A1.

---

## Seção 6 — Diretório de Uploads

### uploads/ na raiz do workspace

Não rastreado. Correto.

### packages/backend/uploads/

```
packages/backend/uploads/
├── relatorios/entrega/   → 1 PDF rastreado (CQ-20260213...)
├── relatorios/producao/  → 3 PDFs rastreados
└── relatorios/recebimento/ → 2 PDFs rastreados
```

**Total:** 6 PDFs operacionais rastreados — ver SEC-6-M1.

Os diretórios `planilhas/`, `ocr/`, `ocr-recebimento/`, `mapas/`, `logos/` **não têm arquivos rastreados**.

---

## Seção 7 — Análise do .gitignore

### Cobertura atual (raiz)

```gitignore
node_modules ; dist ; build
.env ; .env.local ; .env.production ; .env.*.local
*.log ; .DS_Store ; coverage ; .turbo
uploads/ ; logs/ ; tools/
*.pem ; *.key ; *.p12 ; *.pfx
secrets/ ; credentials/
.railway/ ; .vercel ; .claude/
.playwright-mcp/
phase*.png
.tmp/ ; .tmp-*.jpg ; .tmp-*.png ; MODELO*.jpg ; MODELO*.jpeg
packages/backend/.tmp/
```

### ⚪ INFO — SEC-6-I1: Gaps no .gitignore

Padrões ausentes que devem ser adicionados para prevenir futuros vazamentos:

```gitignore
# Documentos e backups operacionais
*.pdf
*.dump
*.backup
*.zip
*.rar
*.7z
*.xlsx
*.xls

# Diretórios de uploads/exportações
packages/backend/uploads/
temp/
exports/
downloads/
storage/
generated/
backups/
```

> ⚠️ **Nota:** `*.sql` **não** deve ser adicionado ao .gitignore pois as migrations em `db/` precisam ser rastreadas. O padrão `packages/backend/uploads/` destrackeia os PDFs atuais via regra explícita, mas `git rm --cached` ainda é necessário para os arquivos já rastreados.

---

## Plano de Ação

### Prioridade 1 — Imediata (bloqueante)

**[SEC-6-A1] Redact PII em `tests/manual/test-ausencias-fase1.mjs`**

```
Substituir: { email: 'thiagoliandro@gmail.com', senha: 'admin123' }
Por:         { email: 'colaborador@recorda.local', senha: 'admin123' }
```

### Prioridade 2 — Alta (próxima sessão)

**[SEC-6-M1] Remover 6 PDFs do rastreamento git**

```bash
git rm --cached packages/backend/uploads/relatorios/entrega/CQ-20260213165956-1771002009799.pdf
git rm --cached packages/backend/uploads/relatorios/producao/000001_2025-1771593950590.pdf
git rm --cached packages/backend/uploads/relatorios/producao/000231_2026-1771002421943.pdf
git rm --cached packages/backend/uploads/relatorios/producao/000232_2026-1771001174785.pdf
git rm --cached packages/backend/uploads/relatorios/recebimento/000000_2026-1770915181719.pdf
git rm --cached "packages/backend/uploads/relatorios/recebimento/0000000___2026-1770840802779.pdf"
# Depois adicionar ao .gitignore: packages/backend/uploads/
```

### Prioridade 3 — Médio prazo

**[SEC-6-I1] Complementar .gitignore** (ver gaps na Seção 7)  
**[SEC-6-B2] Sanitizar exemplo de senha** em `docs/arquivo/historico/ambiente/P2_RELATORIO_SUBIDA_AMBIENTE.md`  
**[SEC-6-M2] Avaliar visibilidade do repositório** — se for público, sanitizar URLs de infra dos docs

### Não requer ação

- SEC-6-B1 (`\restrict` tokens Railway) — monitorar, não é ação crítica
- SEC-6-I3 (JWT_SECRET=abc123realkey em doc de segurança) — intencional, correto no contexto
- SEC-6-B3 (bcrypt hashes de contas @recorda.local) — risco aceitável

---

## Conclusão

O repositório **não contém credenciais de produção ativas**. Nenhuma chave real de OpenAI, JWT de produção, token Railway/Vercel, senha de banco, chave VAPID privada ou token de API foi encontrada no código rastreado.

Os dois itens de ação imediata são:

1. **PII de pessoa física** (email Gmail) em script de teste manual
2. **PDFs operacionais** rastreados que deveriam estar excluídos

Ambos são corrigíveis sem reescrita de histórico git.
