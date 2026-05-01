# Documentação do Sistema Recorda

## Visão Geral

Esta pasta concentra a documentação oficial, histórica e arquivada do sistema Recorda.

Organização atual:

- `arquitetura/`: visão técnica do sistema, API e design system.
- `regras-de-negocio/`: regras oficiais de domínio que afetam comportamento funcional.
- `operacao/`: execução local, deploy, limitações e materiais operacionais.
- `auditorias/`: auditorias, correções, validações e relatórios históricos relevantes.
- `padroes/`: padrões técnicos obrigatórios para futuras alterações.
- `archive/`: documentos antigos, diagnósticos superados e artefatos não ativos.

## Índice Mestre

| Documento | Finalidade | Status |
|---|---|---|
| `regras-de-negocio/NUMEROS_E_METRICAS.md` | Regra oficial dos números e métricas | Atual |
| `regras-de-negocio/TIMEZONE.md` | Timezone oficial do sistema | Atual |
| `regras-de-negocio/IMPORTACAO_LEGADO.md` | Regras da importação legada | Atual |
| `regras-de-negocio/DOMINIO.md` | Conceitos centrais de domínio | Atual |
| `padroes/PADRAO_NUMEROS_RECORDA.md` | Padrão obrigatório para evolução de números | Atual |
| `arquitetura/VISAO_GERAL.md` | Arquitetura geral do sistema | Atual |
| `arquitetura/API.md` | Referência técnica de rotas | Atual |
| `arquitetura/DESIGN_SYSTEM.md` | Guia visual e padrões de interface | Atual |
| `operacao/COMO_RODAR_LOCAL.md` | Setup e execução local | Atual |
| `operacao/DEPLOY.md` | Deploy e publicação | Atual |
| `operacao/TESTES.md` | Comandos e estratégia de testes | Atual |
| `operacao/PRE_PRODUCAO.md` | Checklist pré-produção | Atual |
| `operacao/LIMITACOES.md` | Limitações conhecidas | Atual |
| `operacao/PERFIL_COLABORADOR.md` | Fluxo funcional do colaborador | Atual |
| `auditorias/numeros/AUDITORIA_NUMEROS_RECORDA.md` | Auditoria original dos números | Histórico válido |
| `auditorias/numeros/CORRECAO_NUMEROS_RECORDA.md` | Correção aplicada nos números | Histórico válido |
| `auditorias/numeros/VALIDACAO_NUMEROS_RECORDA.md` | Validação pós-correção | Histórico válido |
| `auditorias/numeros/FECHAMENTO_RESSALVAS_NUMEROS_RECORDA.md` | Fechamento final das ressalvas | Histórico válido |
| `auditorias/seguranca/AUDITORIA_SEGURANCA_PRODUCAO.md` | Auditoria de segurança no fluxo de produção | Histórico válido |
| `auditorias/seguranca/SECURITY_REVIEW.md` | Revisão de segurança complementar | Histórico válido |
| `auditorias/organizacao/ORGANIZACAO_RAIZ_E_DOCS_RECORDA.md` | Relatório da reorganização da raiz e da documentação | Histórico válido |
| `archive/antigos/*` | Documentos antigos de referência histórica | Arquivado |
| `archive/diagnosticos-superados/*` | Auditorias e diagnósticos superados | Arquivado |
| `archive/nao-utilizados/*` | Artefatos preservados por segurança, sem uso atual | Arquivado |

## Navegação Recomendada

Se o objetivo for entender o sistema hoje:

1. Leia `regras-de-negocio/DOMINIO.md`.
2. Leia `regras-de-negocio/NUMEROS_E_METRICAS.md`.
3. Leia `regras-de-negocio/TIMEZONE.md`.
4. Leia `padroes/PADRAO_NUMEROS_RECORDA.md`.
5. Consulte `arquitetura/VISAO_GERAL.md`.

Se o objetivo for operar ou publicar:

1. Leia `operacao/COMO_RODAR_LOCAL.md`.
2. Leia `operacao/TESTES.md`.
3. Leia `operacao/DEPLOY.md`.
4. Use `operacao/PRE_PRODUCAO.md` antes de mudanças sensíveis.

Se o objetivo for entender decisões recentes:

1. Consulte `auditorias/numeros/`.
2. Consulte `auditorias/seguranca/`.
3. Consulte `auditorias/organizacao/`.

## Onde Ficam os Documentos Antigos

Documentos que descrevem estados anteriores do sistema, análises já superadas ou materiais que não representam mais a situação atual foram movidos para:

- `archive/antigos/`
- `archive/diagnosticos-superados/`
- `archive/nao-utilizados/`
- `archive/pendente-confirmacao/`

Esses arquivos foram preservados por segurança e rastreabilidade, mas não devem ser usados como fonte primária para novas alterações.
