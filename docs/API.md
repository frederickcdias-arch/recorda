# Recorda API — Route Reference

> Auto-generated from source code audit. Last updated: 2026-02-11.

## Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | No | Login (email + senha) → JWT + refresh token |
| POST | `/auth/refresh` | No | Refresh access token |
| POST | `/auth/logout` | Yes | Revoke refresh token |
| POST | `/auth/forgot-password` | No | Request password reset email |
| POST | `/auth/reset-password` | No | Reset password with token |
| GET | `/auth/usuarios` | Yes (admin) | List users |
| POST | `/auth/usuarios` | Yes (admin) | Create user |
| PATCH | `/auth/usuarios/:id/toggle` | Yes (admin) | Toggle user active status |

## Health & Monitoring

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check (DB status, uptime, version) |
| GET | `/metrics` | No | System metrics (memory, uptime, node version) |

## Dashboard

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/dashboard` | Yes | Dashboard statistics |

## Relatórios Gerenciais

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/relatorios` | Yes | Generate report (json/pdf/excel). Query: `dataInicio`, `dataFim`, `formato`, `tipo`, `coordenadoriaId` |
| GET | `/relatorios/resumo` | Yes | Report summary |
| GET | `/relatorios/coordenadorias` | Yes | List coordenadorias for report filter |

## Configuração

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/configuracao/empresa` | Yes | Get company config |
| PUT | `/configuracao/empresa` | Yes | Update company config |
| GET | `/configuracao/projetos` | Yes | List projects |
| POST | `/configuracao/projetos` | Yes | Create project |
| PUT | `/configuracao/projetos/:id` | Yes | Update project |
| PATCH | `/configuracao/projetos/:id/toggle` | Yes | Toggle project active status |

## Colaboradores

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/colaboradores` | Yes | List collaborators |
| POST | `/colaboradores` | Yes | Create collaborator |
| PATCH | `/colaboradores/:id/toggle` | Yes | Toggle collaborator active status |

## Etapas

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/etapas` | Yes | List stages |
| POST | `/etapas` | Yes | Create/update stage |
| PATCH | `/etapas/:id/toggle` | Yes | Toggle stage active status |
| PUT | `/etapas/reorder` | Yes | Reorder stages |

## Metas de Produção

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/producao/desempenho` | Yes | Production performance with dynamic meta |
| GET | `/metas` | Yes | List production metas |
| POST | `/metas` | Yes | Create/update meta |
| GET | `/producao/registros` | Yes | List production records |
| POST | `/producao/registros` | Yes | Create production record |

## Auditoria

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/auditoria` | Yes | List audit logs. Query: `tabela` (comma-separated), `operacao`, `dataInicio`, `dataFim`, `pagina`, `limite` |

## Operacional — Armários & Repositórios

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/operacional/armarios` | Yes | List active cabinets |
| POST | `/operacional/repositorios` | Yes | Create repository |
| GET | `/operacional/repositorios` | Yes | List repositories (paginated, filterable) |
| POST | `/operacional/repositorios/:id/ocr-preview` | Yes | OCR-assisted document preview |
| GET | `/operacional/repositorios/:id/documentos-recebimento` | Yes | List receiving documents |
| POST | `/operacional/repositorios/:id/documentos-recebimento` | Yes | Save receiving documents |
| POST | `/operacional/repositorios/:id/retirar` | Yes | Register cabinet withdrawal |
| POST | `/operacional/repositorios/:id/devolver` | Yes | Register cabinet return |

## Operacional — Importação Legado

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/operacional/importacoes-legado/recebimento` | Yes | Import legacy receiving data |
| GET | `/operacional/importacoes-legado` | Yes | List legacy import history |

## Operacional — Checklists & Produção

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/operacional/repositorios/:id/checklists` | Yes | Open stage checklist |
| GET | `/operacional/repositorios/:id/checklists` | Yes | List checklists by repository |
| GET | `/operacional/checklists/:id` | Yes | Get checklist with items |
| POST | `/operacional/checklists/:id/itens` | Yes | Register checklist item result |
| POST | `/operacional/checklists/:id/concluir` | Yes | Complete checklist (auto-generates report for RECEBIMENTO) |
| POST | `/operacional/repositorios/:id/producao` | Yes | Register production (auto-generates report) |
| POST | `/operacional/repositorios/:id/relatorio-recebimento` | Yes | Generate receiving report PDF |
| POST | `/operacional/repositorios/:id/relatorio-producao` | Yes | Generate production report PDF |
| GET | `/operacional/repositorios/:id/relatorios` | Yes | List reports by repository |
| POST | `/operacional/repositorios/:id/excecoes` | Yes | Register operational exception |
| PATCH | `/operacional/repositorios/:id/avancar` | Yes | Advance repository stage/status |

## Operacional — Controle de Qualidade

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/operacional/lotes-cq` | Yes | Create QC batch (exactly 10 repositories) |
| GET | `/operacional/lotes-cq` | Yes | List QC batches |
| GET | `/operacional/lotes-cq/:id` | Yes | Get QC batch details + items |
| PATCH | `/operacional/lotes-cq/:id/itens/:itemId` | Yes | Register QC item result |
| POST | `/operacional/lotes-cq/:id/fechar` | Yes | Close QC batch |
| POST | `/operacional/lotes-cq/:id/relatorio-entrega` | Yes | Generate delivery report PDF |
| GET | `/operacional/relatorios/:id/download` | Yes | Download operational report PDF |

## Conhecimento Operacional

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/operacional/conhecimento/documentos` | Yes | List knowledge base documents |
| GET | `/operacional/conhecimento/documentos/:id` | Yes | Get document by ID |
| POST | `/operacional/conhecimento/documentos` | Yes (admin) | Create document |
| POST | `/operacional/conhecimento/documentos/:id/versoes` | Yes (admin) | Create new document version |
| PATCH | `/operacional/conhecimento/documentos/:id` | Yes (admin) | Update document metadata/status |
| GET | `/operacional/conhecimento/glossario` | Yes | List glossary terms |
| POST | `/operacional/conhecimento/glossario` | Yes (admin) | Create glossary term |
| PATCH | `/operacional/conhecimento/glossario/:id` | Yes (admin) | Update glossary term |
| DELETE | `/operacional/conhecimento/glossario/:id` | Yes (admin) | Delete glossary term |
| GET | `/operacional/conhecimento/leis-normas` | Yes | List laws/norms |
| POST | `/operacional/conhecimento/leis-normas` | Yes (admin) | Create law/norm |
| PATCH | `/operacional/conhecimento/leis-normas/:id` | Yes (admin) | Update law/norm |
| DELETE | `/operacional/conhecimento/leis-normas/:id` | Yes (admin) | Delete law/norm |

## Endpoints Legados

| Path Pattern | Status |
|--------------|--------|
| `/recebimento/*` | `410 LEGACY_ENDPOINT_GONE` |
| `/conhecimento/*` | `410 LEGACY_ENDPOINT_GONE` |

---

## Rate Limits (Production)

| Endpoint | Limit |
|----------|-------|
| Global | 100 req/min |
| `POST /auth/login` | 5 req/min |
| `POST /auth/forgot-password` | 3 req/min |
| `POST /auth/reset-password` | 5 req/min |

## Environment Variables

See `packages/backend/.env.example` for the full list.
