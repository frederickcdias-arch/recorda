# Importação Legada do Sistema Recorda

## Objetivo

Definir o comportamento obrigatório da importação legada para impedir que entradas inválidas sejam persistidas como números aparentemente corretos.

## Regra de Validação de Quantidade

Quantidade deve ser:

- inteira;
- maior que zero;
- explícita;
- válida já no preview.

Casos que devem ser rejeitados:

- vazia;
- textual;
- decimal;
- negativa;
- zero;
- `NaN`.

Mensagem padrão:

- `Quantidade inválida. Informe um número inteiro maior que zero.`

## Regra de Validação de Data

Data deve ser:

- válida;
- completa;
- consistente com o formato esperado;
- igual no preview e na importação final.

Casos que devem ser rejeitados:

- vazia;
- incompleta;
- impossível;
- ambígua;
- inválida.

Mensagem padrão:

- `Data de produção inválida. Corrija a data na planilha antes de importar.`

## Comportamento do Preview

O preview deve:

- usar a mesma validação da importação final;
- marcar a linha inválida antes da confirmação;
- informar claramente o motivo da rejeição;
- impedir que a linha inválida seja tratada como válida.

## Comportamento da Importação Final

A importação final deve:

- reutilizar exatamente a mesma validação do preview;
- bloquear inserção de linha inválida;
- bloquear atualização de linha inválida;
- não normalizar dado inválido para valor padrão silencioso.

## Proibições Obrigatórias

É proibido:

- fallback de quantidade inválida para `1`;
- fallback de data inválida para data atual;
- usar validação diferente entre preview e importação final;
- inserir linha com erro apenas para “não perder dado”.

## Fonte Central

- `packages/backend/src/domain/producao/importacao-legado.ts`
