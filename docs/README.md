# Documentacao do Sistema Recorda

## Visao geral

Esta pasta concentra a documentacao oficial, historica e operacional do sistema.

Organizacao:

- `arquitetura/`: visao tecnica do sistema e referencia de API.
- `regras-de-negocio/`: regras oficiais que afetam comportamento funcional.
- `operacao/`: setup local, testes, deploy, dominio e limitacoes conhecidas.
- `visual/`: diretrizes visuais e documentacao de interface ainda ativa.
- `seguranca/`: documentos ativos de seguranca e hardening.
- `auditorias/`: registros historicos de seguranca, homologacao, diagnostico e validacao.
- `padroes/`: convencoes tecnicas obrigatorias para evolucoes futuras.
- `arquivo/`: materiais historicos preservados por rastreabilidade.

Para navegacao rapida, consulte [INDICE.md](./INDICE.md).

## Indice mestre

| Documento                                   | Finalidade                                     | Status           |
| ------------------------------------------- | ---------------------------------------------- | ---------------- |
| `INDICE.md`                                 | Navegacao rapida por tema                      | Atual            |
| `regras-de-negocio/DOMINIO.md`              | Conceitos centrais de dominio                  | Atual            |
| `regras-de-negocio/NUMEROS_E_METRICAS.md`   | Regras oficiais de numeros e metricas          | Atual            |
| `regras-de-negocio/TIMEZONE.md`             | Timezone oficial do sistema                    | Atual            |
| `regras-de-negocio/IMPORTACAO_LEGADO.md`    | Regras da importacao legada                    | Atual            |
| `regras-de-negocio/AUSENCIAS.md`            | Regra de ausencias                             | Atual            |
| `padroes/PADRAO_NUMEROS_RECORDA.md`         | Padrao obrigatorio para evolucao de numeros    | Atual            |
| `arquitetura/VISAO_GERAL.md`                | Arquitetura geral do sistema                   | Atual            |
| `arquitetura/API.md`                        | Referencia tecnica de rotas                    | Atual            |
| `visual/DESIGN_SYSTEM.md`                   | Guia visual e padroes de interface             | Atual            |
| `operacao/COMO_RODAR_LOCAL.md`              | Setup e execucao local                         | Atual            |
| `operacao/TESTES.md`                        | Estrategia e comandos de teste                 | Atual            |
| `operacao/TESTES_MANUAIS.md`                | Procedimentos manuais e guard-rails            | Atual            |
| `operacao/DEPLOY.md`                        | Deploy e publicacao                            | Atual            |
| `operacao/PROCESSAMENTO_DOCUMENTO.md`       | Fluxo e operacao do processamento fotografado  | Atual            |
| `operacao/LIMITACOES.md`                    | Limitacoes conhecidas                          | Atual            |
| `regras-de-negocio/PERFIL_COLABORADOR.md`   | Fluxo funcional do colaborador                 | Atual            |
| `seguranca/SEGURANCA_VIBECODING_RECORDA.md` | Baseline de seguranca para manutencao          | Atual            |
| `CHANGELOG.md`                              | Historico de mudancas relevantes               | Atual            |
| `auditorias/README.md`                      | Sumario das auditorias e relatorios historicos | Historico valido |

## Ordem recomendada de leitura

Se o objetivo for entender o sistema:

1. `regras-de-negocio/DOMINIO.md`
2. `regras-de-negocio/NUMEROS_E_METRICAS.md`
3. `regras-de-negocio/TIMEZONE.md`
4. `arquitetura/VISAO_GERAL.md`
5. `arquitetura/API.md`
6. `visual/DESIGN_SYSTEM.md`

Se o objetivo for rodar ou operar localmente:

1. `operacao/COMO_RODAR_LOCAL.md`
2. `operacao/TESTES.md`
3. `operacao/LIMITACOES.md`
4. `operacao/DEPLOY.md`
5. `operacao/PROCESSAMENTO_DOCUMENTO.md`

Se o objetivo for revisar historico de decisoes:

1. `auditorias/README.md`
2. `arquivo/`

## Importante sobre documentos antigos

Arquivos em `arquivo/` e parte de `auditorias/` podem descrever estados anteriores do sistema. Eles devem ser lidos como referencia historica, nao como fonte primaria para novas alteracoes.
