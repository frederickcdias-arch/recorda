# Ausências — Regra de produto

## Regra oficial

- A **administração** lança e controla ausências (`POST /admin/ausencias`).
- A administração **aprova**, **rejeita** e **cancela** conforme o fluxo em `/configuracoes/ausencias`.
- O **colaborador** apenas **consulta e acompanha** suas ausências em `/minha-producao/ausencias`.
- O colaborador **não cria** solicitação de ausência. `POST /ausencias` permanece bloqueado (403).

## O que o colaborador pode fazer

| Ação                      | Endpoint                       | Observação                |
| ------------------------- | ------------------------------ | ------------------------- |
| Listar próprias ausências | `GET /ausencias/minhas`        | Consulta e filtros        |
| Ver anexo                 | `GET /ausencias/:id/anexo`     | Apenas registros próprios |
| Cancelar pendente         | `POST /ausencias/:id/cancelar` | Somente status `pendente` |

## O que o colaborador não pode fazer

- Registrar nova ausência (`POST /ausencias` → 403).
- Aprovar, rejeitar ou lançar ausência para outros usuários.

## Orientação na interface

Texto de referência para a tela do colaborador:

> Suas ausências registradas pela administração.

Em caso de divergência, o colaborador deve procurar o responsável administrativo — não há fluxo de solicitação self-service.
