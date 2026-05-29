# Documentacao do Sistema Recorda

## Visao geral

Esta pasta concentra a documentacao oficial, historica e operacional do sistema.

Organizacao:

- `arquitetura/`: visao tecnica do sistema, API e design system.
- `regras-de-negocio/`: regras oficiais que afetam comportamento funcional.
- `operacao/`: setup local, testes, deploy e limitacoes conhecidas.
- `auditorias/`: registros historicos de auditoria, revisao e validacao.
- `padroes/`: convencoes tecnicas obrigatorias para evolucoes futuras.
- `archive/`: materiais antigos preservados por rastreabilidade.

## Indice mestre

| Documento                                 | Finalidade                                             | Status           |
| ----------------------------------------- | ------------------------------------------------------ | ---------------- |
| `regras-de-negocio/DOMINIO.md`            | Conceitos centrais de dominio                          | Atual            |
| `regras-de-negocio/NUMEROS_E_METRICAS.md` | Regras oficiais de numeros e metricas                  | Atual            |
| `regras-de-negocio/TIMEZONE.md`           | Timezone oficial do sistema                            | Atual            |
| `regras-de-negocio/IMPORTACAO_LEGADO.md`  | Regras da importacao legada                            | Atual            |
| `regras-de-negocio/AUSENCIAS.md`          | Regra de ausencias (admin lança, colaborador consulta) | Atual            |
| `padroes/PADRAO_NUMEROS_RECORDA.md`       | Padrao obrigatorio para evolucao de numeros            | Atual            |
| `arquitetura/VISAO_GERAL.md`              | Arquitetura geral do sistema                           | Atual            |
| `arquitetura/API.md`                      | Referencia tecnica de rotas                            | Atual            |
| `arquitetura/DESIGN_SYSTEM.md`            | Guia visual e padroes de interface                     | Atual            |
| `operacao/COMO_RODAR_LOCAL.md`            | Setup e execucao local                                 | Atual            |
| `operacao/TESTES.md`                      | Estrategia e comandos de teste                         | Atual            |
| `operacao/DEPLOY.md`                      | Deploy e publicacao                                    | Atual            |
| `operacao/PRE_PRODUCAO.md`                | Checklist pre-producao                                 | Atual            |
| `operacao/LIMITACOES.md`                  | Limitacoes conhecidas                                  | Atual            |
| `operacao/PERFIL_COLABORADOR.md`          | Fluxo funcional do colaborador                         | Atual            |
| `auditorias/`                             | Registros historicos validos                           | Historico valido |

## Ordem recomendada de leitura

Se o objetivo for entender o sistema:

1. `regras-de-negocio/DOMINIO.md`
2. `regras-de-negocio/NUMEROS_E_METRICAS.md`
3. `regras-de-negocio/TIMEZONE.md`
4. `arquitetura/VISAO_GERAL.md`
5. `arquitetura/API.md`

Se o objetivo for rodar ou operar localmente:

1. `operacao/COMO_RODAR_LOCAL.md`
2. `operacao/TESTES.md`
3. `operacao/LIMITACOES.md`
4. `operacao/DEPLOY.md`

Se o objetivo for revisar historico de decisoes:

1. `auditorias/`
2. `archive/`

## Importante sobre documentos antigos

Arquivos em `archive/` e parte de `auditorias/` podem descrever estados anteriores do sistema. Eles devem ser lidos como referencia historica, nao como fonte primaria para novas alteracoes.
