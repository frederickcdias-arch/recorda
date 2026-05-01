# Organização da Raiz e Documentação do Sistema Recorda

## 1. Resumo

Foi realizada uma reorganização completa e segura da pasta raiz e da documentação do projeto Recorda. A raiz foi limpa para manter apenas arquivos essenciais do sistema e todos os `.md` não essenciais foram movidos para `docs/`, `docs/auditorias/` ou `docs/archive/`.

Nenhum documento foi apagado definitivamente. Arquivos antigos, diagnósticos superados e artefatos sem uso atual foram arquivados.

## 2. Objetivo da organização

- reduzir ruído na raiz do repositório;
- separar documentação oficial de documentação histórica;
- preservar auditorias recentes válidas;
- arquivar material antigo que poderia confundir futuras manutenções;
- consolidar regras atuais em documentos oficiais.

## 3. Estrutura anterior encontrada

Antes da organização, a raiz continha:

- documentação técnica solta;
- auditorias recentes misturadas com documentos antigos;
- changelog na raiz;
- relatórios intermediários e diagnósticos de tarefas específicas;
- scripts utilitários soltos;
- artefatos de log soltos;
- um relatório JSON temporário solto.

Em `docs/`, havia mistura de:

- documentação arquitetural;
- documentação operacional;
- auditorias antigas;
- análises superadas;
- material ainda útil, mas sem hierarquia clara.

## 4. Estrutura nova aplicada

Estrutura principal aplicada:

- `docs/arquitetura/`
- `docs/regras-de-negocio/`
- `docs/operacao/`
- `docs/auditorias/numeros/`
- `docs/auditorias/seguranca/`
- `docs/auditorias/organizacao/`
- `docs/padroes/`
- `docs/archive/antigos/`
- `docs/archive/diagnosticos-superados/`
- `docs/archive/nao-utilizados/`

Também foram usados:

- `scripts/maintenance/`
- `tests/manual/`
- `logs/archive/`

## 5. Arquivos mantidos na raiz

Classificação `A — Essencial do sistema`:

- `.env.example`
- `.eslintrc.json`
- `.gitignore`
- `.nvmrc`
- `.prettierignore`
- `.prettierrc`
- `docker-compose.yml`
- `Dockerfile.backend`
- `Dockerfile.frontend`
- `healthcheck.sh`
- `nginx.conf`
- `nixpacks.toml`
- `package.json`
- `package-lock.json`
- `railway.json`
- `README.md`
- `tsconfig.base.json`
- `vercel.json`

Pastas essenciais preservadas:

- `db/`
- `docs/`
- `packages/`
- `scripts/`
- `tests/`
- `logs/`

## 6. Arquivos movidos para docs/

Classificação `B — Documentação atual oficial`:

- `docs/arquitetura/VISAO_GERAL.md`
- `docs/arquitetura/API.md`
- `docs/arquitetura/DESIGN_SYSTEM.md`
- `docs/regras-de-negocio/DOMINIO.md`
- `docs/regras-de-negocio/NUMEROS_E_METRICAS.md`
- `docs/regras-de-negocio/TIMEZONE.md`
- `docs/regras-de-negocio/IMPORTACAO_LEGADO.md`
- `docs/operacao/COMO_RODAR_LOCAL.md`
- `docs/operacao/DEPLOY.md`
- `docs/operacao/TESTES.md`
- `docs/operacao/PRE_PRODUCAO.md`
- `docs/operacao/LIMITACOES.md`
- `docs/operacao/PERFIL_COLABORADOR.md`
- `docs/operacao/CONHECIMENTO_OPERACIONAL_PLANO_CONTEUDO.md`
- `docs/CHANGELOG.md`
- `docs/README.md`

## 7. Arquivos movidos para docs/auditorias/

Classificação `C — Relatório válido de auditoria/correção`:

- `docs/auditorias/numeros/AUDITORIA_NUMEROS_RECORDA.md`
- `docs/auditorias/numeros/CORRECAO_NUMEROS_RECORDA.md`
- `docs/auditorias/numeros/VALIDACAO_NUMEROS_RECORDA.md`
- `docs/auditorias/numeros/FECHAMENTO_RESSALVAS_NUMEROS_RECORDA.md`
- `docs/auditorias/seguranca/AUDITORIA_SEGURANCA_PRODUCAO.md`
- `docs/auditorias/seguranca/SECURITY_REVIEW.md`

## 8. Arquivos movidos para docs/archive/

Classificação `D — Documento antigo ou superado`:

- `docs/archive/antigos/BACKLOG_EXECUTAVEL_2026.md`
- `docs/archive/antigos/CONTRATO_DE_EVOLUCAO.md`
- `docs/archive/antigos/ESTADO_ATUAL_DA_RECORDA.md`
- `docs/archive/antigos/EVOLUCAO_SISTEMA.md`
- `docs/archive/diagnosticos-superados/ANALISE_COMPLETA_SISTEMA.md`
- `docs/archive/diagnosticos-superados/ANALISE_QUALIDADE_CODIGO.md`
- `docs/archive/diagnosticos-superados/auditoria-mapa-sistema.md`
- `docs/archive/diagnosticos-superados/AUDITORIA_TECNICA_2026-02-11.md`
- `docs/archive/diagnosticos-superados/AUDITORIA_TECNICA_DA_RECORDA.md`
- `docs/archive/diagnosticos-superados/CHECKLIST_FINAL.md`
- `docs/archive/diagnosticos-superados/HOMOLOGACAO_TECNICA_FINAL_2026-02-10.md`
- `docs/archive/diagnosticos-superados/ANALISE_FLUXO_COLABORADOR.md`
- `docs/archive/diagnosticos-superados/SISTEMA_COLABORADOR_COMPLETO.md`
- `docs/archive/diagnosticos-superados/TESTES_COLABORADOR_PENDENTES.md`
- `docs/archive/diagnosticos-superados/VALIDACAO_FLUXO_ETAPAS.md`
- `docs/archive/diagnosticos-superados/INSTRUCOES_VINCULAR_COLABORADORES.md`

Classificação `F — Arquivo temporário ou descartável`:

- `docs/archive/nao-utilizados/pdf-encoding-report-active-final-stable.json`

## 9. Arquivos preservados por segurança

Preservados sem exclusão definitiva:

- todo o conteúdo movido para `docs/archive/`;
- logs movidos para `logs/archive/`;
- utilitários manuais movidos para `scripts/maintenance/` e `tests/manual/`.

## 10. Arquivos pendentes de confirmação humana

Classificação `G — Dúvida / precisa confirmação humana`:

- nenhum arquivo foi classificado como pendente nesta rodada.

## 11. Links internos atualizados

Foram atualizados ou recriados:

- `README.md` da raiz;
- `docs/README.md`;
- caminhos de deploy em `docs/operacao/DEPLOY.md`;
- referências ao padrão e às auditorias recentes em documentos oficiais.

## 12. Documentos oficiais criados ou atualizados

Criados ou reescritos:

- `docs/README.md`
- `docs/regras-de-negocio/NUMEROS_E_METRICAS.md`
- `docs/regras-de-negocio/TIMEZONE.md`
- `docs/regras-de-negocio/IMPORTACAO_LEGADO.md`
- `docs/operacao/COMO_RODAR_LOCAL.md`
- `docs/operacao/TESTES.md`
- `docs/auditorias/README.md`
- `docs/auditorias/organizacao/ORGANIZACAO_RAIZ_E_DOCS_RECORDA.md`

Preservado e reposicionado:

- `docs/padroes/PADRAO_NUMEROS_RECORDA.md`

## 13. Documentos antigos arquivados

Foram arquivados todos os documentos que:

- descreviam estados antigos do sistema;
- registravam diagnósticos já superados;
- serviam como análise intermediária de correções já consolidadas;
- poderiam competir com a documentação atual oficial.

## 14. Riscos evitados

- correção baseada em documento antigo;
- auditoria recente perdida na raiz;
- duplicidade entre documentação oficial e histórica;
- leitura equivocada de prompt/diagnóstico como regra vigente;
- crescimento descontrolado de `.md` soltos na raiz;
- quebra de navegação entre documentos principais.

## 15. Recomendações para manter organização futura

- manter apenas `README.md` como `.md` na raiz;
- toda nova auditoria deve nascer em `docs/auditorias/`;
- toda regra vigente deve ficar em `docs/regras-de-negocio/` ou `docs/padroes/`;
- todo diagnóstico superado deve ir para `docs/archive/diagnosticos-superados/`;
- antes de criar novo documento, verificar se o tema já possui documento oficial;
- revisar links internos sempre que houver mudança de caminho;
- não usar documentação arquivada como fonte principal de decisão técnica.
