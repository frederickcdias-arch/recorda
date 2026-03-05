# Backlog Executavel 2026

Data de referência: 2026-03-05

## P0 (Imediato)

| ID | Seção | Item | Esforço | Critério de pronto |
|----|-------|------|---------|--------------------|
| P0-01 | Auth/Security | Tornar `APP_URL` obrigatório em produção para links de reset e remover fallback hardcoded | 0.5 dia | Fluxo `forgot-password` não usa URL fixa e falha de forma explícita se config crítica estiver ausente |
| P0-02 | Configuração | Criar cadastro persistente de Unidade (hoje rápido é local no frontend) | 1.5-2 dias | Unidade criada via API aparece no selector de recebimento para qualquer sessão |
| P0-03 | Documentação/API | Automatizar verificação de divergência entre docs e rotas | 1 dia | CI falha quando endpoint documentado não existe (ou vice-versa em escopo definido) |
| P0-04 | Operacional | Extrair regras de transição de etapa/status para serviço único | 1.5 dias | Rotas de avanço/devolução usam mesma regra central com testes de integração |

## P1 (Curto prazo)

| ID | Seção | Item | Esforço | Critério de pronto |
|----|-------|------|---------|--------------------|
| P1-01 | Recebimento | Componente reutilizável `CreatableSelect` (Unidade/Projeto/Setor) | 1 dia | Fluxos de criação rápida com mesmo comportamento e validações |
| P1-02 | CQ | Consolidar lógica de CQ em serviço de domínio | 2 dias | Rotas CQ mais enxutas e cobertura de regressão |
| P1-03 | Importação | Idempotência por hash + fonte | 2 dias | Reimportação não duplica dados em cenários repetidos |
| P1-04 | Observabilidade | Correlation ID por request + logs estruturados por rota | 1 dia | Logs permitem rastrear ponta a ponta por requisição |
| P1-05 | Mobile | Padronizar listas em cards nas telas operacionais restantes | 1.5 dias | Navegação e ações sem tabela horizontal em telas pequenas |

## P2 (Médio prazo)

| ID | Seção | Item | Esforço | Critério de pronto |
|----|-------|------|---------|--------------------|
| P2-01 | Conhecimento | Busca full-text com relevância e paginação | 2 dias | Busca retorna ranking consistente com filtros |
| P2-02 | Relatórios | Cache curto para relatórios repetidos | 1 dia | Redução de latência para filtros idênticos |
| P2-03 | Segurança | CSP mais estrita e revisão de headers por ambiente | 1 dia | Políticas aplicadas e validadas em produção |
| P2-04 | Testes | Contratos de API para endpoints críticos | 2 dias | Quebra de contrato detectada automaticamente no CI |
| P2-05 | Docs/Runbook | Runbook operacional de incidentes comuns | 1 dia | Procedimentos de resposta documentados por tipo de falha |

## Ordem de execução sugerida

1. P0-01
2. P0-02
3. P0-04
4. P0-03
5. P1-01

## Status atual

- Iniciado: `P0-01`
