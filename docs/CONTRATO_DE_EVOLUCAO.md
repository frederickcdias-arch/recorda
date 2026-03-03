# Contrato de Evolução - Recorda

> Documento de governança técnica para evolução controlada do sistema.
> Baseado em: [ESTADO_ATUAL_DA_RECORDA.md](ESTADO_ATUAL_DA_RECORDA.md)

---

## 1. MUDANÇAS ACEITÁVEIS

### ✅ Pode Fazer Livremente

| Tipo de Mudança | Condição |
|-----------------|----------|
| **Novos endpoints de consulta** | Desde que não alterem dados de produção |
| **Melhorias de UI/UX** | Sem alterar fluxos de entrada de dados |
| **Novos relatórios** | Usando dados existentes, sem criar novas fontes |
| **Expansão da base de conhecimento** | Artigos, categorias, tags |
| **Correção de bugs** | Sem alterar invariantes de domínio |
| **Melhorias de performance** | Cache, índices, otimizações de query |
| **Adição de logs e métricas** | Observabilidade |
| **Testes adicionais** | Unitários, integração, E2E |
| **Documentação** | README, comentários, ADRs |

### ✅ Pode Fazer com Cuidado

| Tipo de Mudança | Requisito |
|-----------------|-----------|
| **Novos campos em entidades** | Não quebrar imutabilidade de RegistroProducao |
| **Novas migrations** | Nunca alterar migrations existentes |
| **Novos use cases** | Seguir padrão Result<T, E> |
| **Novos componentes frontend** | Manter limite de 20 fotos no OCR |
| **Refatoração de código** | Manter comportamento idêntico |

---

## 2. MUDANÇAS QUE EXIGEM REVISÃO ARQUITETURAL

### 🟡 Requer Análise Prévia

Antes de implementar, documente a proposta e valide com a equipe:

| Mudança | Motivo da Revisão |
|---------|-------------------|
| **Autenticação/Autorização** | Afeta todos os endpoints e fluxos |
| **Integração com OCR real** | Substitui serviço placeholder |
| **Novo tipo de entrada de produção** | Pode quebrar regra "apenas planilha/OCR" |
| **Alteração em agregados** | Pode afetar consistência transacional |
| **Mudança em estrutura de relatórios** | Deve manter compatibilidade Fabrivo |
| **Alteração de limites** | Ex: mudar de 20 para N fotos |
| **Nova fonte de dados** | Deve ser auditável |
| **Integração com sistemas externos** | Webhooks, APIs terceiras |

### 📋 Template de Proposta

```markdown
## Proposta de Mudança Arquitetural

**Título:** [Nome da mudança]
**Data:** [Data]
**Autor:** [Nome]

### Descrição
[O que será alterado]

### Motivação
[Por que é necessário]

### Impacto
- [ ] Afeta entrada de produção?
- [ ] Afeta imutabilidade de registros?
- [ ] Afeta agregados de domínio?
- [ ] Afeta relatórios?
- [ ] Requer nova migration?

### Riscos
[O que pode dar errado]

### Plano de Rollback
[Como reverter se necessário]
```

---

## 3. MUDANÇAS PROIBIDAS

### 🔴 NUNCA FAZER

| Proibição | Justificativa |
|-----------|---------------|
| **Criar endpoint HTTP para inserir RegistroProducao diretamente** | Produção entra APENAS via planilha ou OCR |
| **Remover ou desabilitar RULE de imutabilidade** | Registros de produção são imutáveis |
| **Remover ou desabilitar triggers de auditoria** | Rastreabilidade é obrigatória |
| **Permitir UPDATE em registros_producao** | Correções são via cancelamento + novo registro |
| **Permitir DELETE físico em registros_producao** | Apenas soft delete (cancelamento) |
| **Criar Volume sem Processo** | Volume SEMPRE pertence a um Processo |
| **Criar Apenso sem Processo Principal** | Apenso SEMPRE referencia um Principal |
| **Alterar migrations já aplicadas** | Criar nova migration para alterações |
| **Remover validações de domínio** | Invariantes garantem consistência |
| **Permitir datas futuras em produção** | DataPassada valida isso |

### 🔴 Código que Viola o Contrato

```typescript
// ❌ PROIBIDO: Endpoint direto para criar produção
server.post('/producao', async (req) => {
  const registro = RegistroProducao.create(req.body);
  await repository.save(registro);
});

// ❌ PROIBIDO: Alterar registro existente
registro.quantidade = novaQuantidade;

// ❌ PROIBIDO: Criar volume órfão
const volume = Volume.create({ numero: 1 }); // sem processoId

// ❌ PROIBIDO: Criar apenso órfão
const apenso = Apenso.create({ tipo: 'APENSO' }); // sem processoPrincipalId
```

---

## 4. COMO VALIDAR SE UMA MUDANÇA QUEBROU O DOMÍNIO

### Validação Automatizada

Execute TODOS os comandos abaixo. Todos devem passar:

```bash
# 1. Verificação de tipos
npm run typecheck

# 2. Testes unitários
npm run test --workspace=@recorda/backend

# 3. Lint
npm run lint
```

### Validação Manual de Invariantes

| Invariante | Como Testar |
|------------|-------------|
| **Imutabilidade de produção** | Tentar UPDATE via SQL - deve falhar |
| **Proteção contra DELETE** | Tentar DELETE via SQL - deve falhar |
| **Volume pertence a Processo** | Verificar FK no banco |
| **Apenso referencia Principal** | Verificar FK no banco |
| **Auditoria funcionando** | Inserir registro e verificar tabela `auditoria` |

### Comandos de Verificação no Banco

```sql
-- Verificar RULE de imutabilidade
SELECT rulename FROM pg_rules 
WHERE tablename = 'registros_producao';
-- Esperado: prevent_delete_registros_producao

-- Verificar triggers
SELECT tgname FROM pg_trigger 
WHERE tgrelid = 'registros_producao'::regclass 
AND tgname LIKE '%immutable%' OR tgname LIKE '%audit%';
-- Esperado: trigger_registros_producao_immutable, audit_registros_producao

-- Testar imutabilidade (deve falhar)
UPDATE registros_producao SET quantidade = 999 WHERE id = '...';
-- Esperado: ERROR

-- Testar proteção DELETE (deve falhar)
DELETE FROM registros_producao WHERE id = '...';
-- Esperado: ERROR ou registro não deletado
```

### Sinais de Quebra de Domínio

| Sinal | Ação |
|-------|------|
| Typecheck falha | Corrigir tipos antes de continuar |
| Testes falham | Investigar causa, não ignorar |
| Produção sendo alterada | REVERTER IMEDIATAMENTE |
| Registros órfãos no banco | Investigar integridade referencial |
| Auditoria vazia após operações | Verificar triggers |

---

## 5. CHECKLIST OBRIGATÓRIO ANTES DE QUALQUER FEATURE NOVA

### Fase 1: Antes de Começar

- [ ] Li o documento [ESTADO_ATUAL_DA_RECORDA.md](ESTADO_ATUAL_DA_RECORDA.md)
- [ ] Li o documento [DOMINIO.md](DOMINIO.md)
- [ ] Verifiquei se a feature está na lista de "Mudanças Aceitáveis"
- [ ] Se não está, criei proposta de revisão arquitetural
- [ ] A feature NÃO viola nenhum item da lista "Mudanças Proibidas"

### Fase 2: Durante Desenvolvimento

- [ ] Não criei endpoint HTTP para inserir produção diretamente
- [ ] Não alterei imutabilidade de RegistroProducao
- [ ] Não alterei migrations existentes (criei nova se necessário)
- [ ] Mantive invariantes de domínio (Volume→Processo, Apenso→Principal)
- [ ] Segui padrão Result<T, E> para novos use cases
- [ ] Adicionei testes para nova funcionalidade

### Fase 3: Antes de Commit

- [ ] `npm run typecheck` passa
- [ ] `npm run test` passa (todos os testes)
- [ ] `npm run lint` sem erros críticos
- [ ] Código revisado (self-review ou pair)

### Fase 4: Antes de Merge/Deploy

- [ ] Testes manuais realizados
- [ ] Documentação atualizada (se aplicável)
- [ ] Não há regressões em funcionalidades existentes
- [ ] Relatórios continuam somando corretamente
- [ ] OCR continua funcionando em mobile

### Fase 5: Após Deploy

- [ ] Verificar logs de erro
- [ ] Verificar auditoria funcionando
- [ ] Teste de sanidade em produção
- [ ] Monitorar por 24h

---

## RESUMO VISUAL

```
┌─────────────────────────────────────────────────────────────┐
│                    SEMÁFORO DE MUDANÇAS                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🟢 VERDE - Pode fazer livremente                           │
│     • Novos relatórios                                       │
│     • Melhorias de UI                                        │
│     • Testes e documentação                                  │
│     • Correção de bugs                                       │
│                                                              │
│  🟡 AMARELO - Requer revisão arquitetural                   │
│     • Autenticação                                           │
│     • Integração OCR real                                    │
│     • Novos tipos de entrada                                 │
│     • Alteração de limites                                   │
│                                                              │
│  🔴 VERMELHO - Proibido                                     │
│     • Endpoint direto para produção                          │
│     • Alterar registros existentes                           │
│     • Remover auditoria                                      │
│     • Criar entidades órfãs                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## HISTÓRICO DE REVISÕES

| Data | Versão | Descrição |
|------|--------|-----------|
| Jan 2026 | 1.0 | Documento inicial |

---

## DOCUMENTAÇÃO RELACIONADA

| Documento | Descrição |
|-----------|-----------|
| [ESTADO_ATUAL_DA_RECORDA.md](ESTADO_ATUAL_DA_RECORDA.md) | Estado atual do sistema |
| [DOMINIO.md](DOMINIO.md) | Modelo de domínio |
| [LIMITACOES.md](LIMITACOES.md) | Limitações conhecidas |
| [CHECKLIST_FINAL.md](CHECKLIST_FINAL.md) | Validação completa |
