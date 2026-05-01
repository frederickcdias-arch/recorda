# Limitações Conhecidas - Recorda

## OCR

### OCR Service Default

- **Limitação**: A implementação `OCRServiceDefault` é um placeholder que não realiza extração de texto real
- **Impacto**: Documentos enviados retornam texto vazio
- **Solução**: Implementar integração com serviço OCR real (Tesseract, Google Vision, AWS Textract)

### Tamanho de Imagem

- **Limitação**: Limite de 10MB por imagem
- **Impacto**: Imagens de alta resolução podem ser rejeitadas
- **Solução**: Implementar compressão no frontend antes do envio

## Autenticação e Autorização

### Sem Autenticação

- **Limitação**: Não há sistema de login/autenticação implementado
- **Impacto**: Todos os endpoints são públicos
- **Solução**: Implementar JWT ou sessões com Fastify

### Sem Controle de Acesso

- **Limitação**: Não há RBAC (Role-Based Access Control)
- **Impacto**: Qualquer usuário pode acessar qualquer funcionalidade
- **Solução**: Implementar middleware de autorização

## Performance

### Paginação de Relatórios

- **Limitação**: Relatórios carregam todos os dados em memória
- **Impacto**: Pode haver lentidão com grandes volumes de dados
- **Solução**: Implementar streaming ou paginação server-side

### Cache

- **Limitação**: Não há cache implementado
- **Impacto**: Consultas repetidas vão sempre ao banco
- **Solução**: Implementar Redis ou cache em memória

### Índices de Busca

- **Limitação**: Busca full-text apenas em português
- **Impacto**: Termos em outros idiomas podem não ser encontrados
- **Solução**: Configurar dicionários adicionais no PostgreSQL

## Frontend

### Roteamento

- **Limitação**: Navegação por estado React, sem rotas reais
- **Impacto**: Não é possível compartilhar URLs diretas
- **Solução**: Implementar React Router

### Offline

- **Limitação**: PWA não funciona offline
- **Impacto**: Requer conexão para todas as operações
- **Solução**: Implementar cache de dados e sincronização

### Internacionalização

- **Limitação**: Interface apenas em português
- **Impacto**: Não suporta outros idiomas
- **Solução**: Implementar i18n com react-intl ou similar

## Banco de Dados

### Soft Delete

- **Limitação**: Apenas `registros_producao` tem proteção contra DELETE
- **Impacto**: Outras tabelas permitem exclusão física
- **Solução**: Implementar soft delete global com campo `deletado_em`

### Backup

- **Limitação**: Não há estratégia de backup automatizado
- **Impacto**: Risco de perda de dados
- **Solução**: Configurar pg_dump agendado ou backup contínuo

### Conexões

- **Limitação**: Pool de conexões com configuração padrão
- **Impacto**: Pode haver esgotamento sob carga alta
- **Solução**: Ajustar pool size baseado em carga esperada

## Integração

### APIs Externas

- **Limitação**: Não há integração com sistemas externos
- **Impacto**: Dados precisam ser importados manualmente
- **Solução**: Implementar conectores específicos

### Webhooks

- **Limitação**: Não há sistema de webhooks
- **Impacto**: Não é possível notificar sistemas externos
- **Solução**: Implementar fila de eventos com notificações

## Monitoramento

### Logs

- **Limitação**: Logs apenas no console (Fastify logger)
- **Impacto**: Difícil análise em produção
- **Solução**: Integrar com ELK Stack ou similar

### Métricas

- **Limitação**: Não há coleta de métricas
- **Impacto**: Sem visibilidade de performance
- **Solução**: Implementar Prometheus/Grafana

### Health Checks

- **Limitação**: Health check básico apenas para database
- **Impacto**: Não detecta problemas em outros componentes
- **Solução**: Expandir health checks para todos os serviços

## Segurança

### Rate Limiting

- **Limitação**: Não há rate limiting
- **Impacto**: Vulnerável a ataques de força bruta
- **Solução**: Implementar @fastify/rate-limit

### CORS

- **Limitação**: CORS configurado para aceitar qualquer origem
- **Impacto**: Potencial vulnerabilidade em produção
- **Solução**: Configurar origens permitidas explicitamente

### Validação de Input

- **Limitação**: Validação básica via JSON Schema
- **Impacto**: Pode haver edge cases não cobertos
- **Solução**: Adicionar validação com Zod ou similar

### SQL Injection

- **Limitação**: Queries parametrizadas, mas sem ORM
- **Impacto**: Risco se queries forem construídas incorretamente
- **Solução**: Considerar uso de Prisma ou Drizzle

## Testes

### Cobertura

- **Limitação**: Testes apenas para use cases principais
- **Impacto**: Código de infraestrutura não testado
- **Solução**: Adicionar testes de integração

### E2E

- **Limitação**: Não há testes end-to-end
- **Impacto**: Fluxos completos não validados automaticamente
- **Solução**: Implementar Playwright ou Cypress

### Testes de Carga

- **Limitação**: Não há testes de performance
- **Impacto**: Comportamento sob carga desconhecido
- **Solução**: Implementar k6 ou Artillery

## Deploy

### CI/CD

- **Limitação**: Não há pipeline de CI/CD configurado
- **Impacto**: Deploy manual
- **Solução**: Configurar GitHub Actions ou similar

### Containerização

- **Limitação**: Apenas PostgreSQL em Docker
- **Impacto**: Backend/frontend não containerizados
- **Solução**: Criar Dockerfiles para aplicação

### Ambiente de Produção

- **Limitação**: Configuração apenas para desenvolvimento
- **Impacto**: Não está pronto para produção
- **Solução**: Criar configurações de produção

---

## Priorização Sugerida

### Alta Prioridade

1. Autenticação e autorização
2. OCR real
3. Rate limiting
4. CORS restrito

### Média Prioridade

1. Cache
2. Logs estruturados
3. Testes de integração
4. CI/CD

### Baixa Prioridade

1. Internacionalização
2. Offline support
3. Webhooks
4. Métricas avançadas
