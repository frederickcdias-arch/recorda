# Checklist de Homologação Visual — Recorda

> Documento final de homologação visual após as Fases 1 a 6.
> Objetivo: validar a experiência real do sistema com dados reais ou o mais próximos do real, sem abrir nova frente de redesign.

---

## 1. Como usar

Preencher uma linha por tela avaliada.

Classificação:

- `Aprovado`
- `Ajuste leve`
- `Ajuste médio`
- `Crítico`

Prioridade:

- `Baixa`
- `Média`
- `Alta`

Status:

- `Não iniciado`
- `Em validação`
- `Ajustar`
- `Validado`

Responsável:

- Nome da pessoa ou equipe que validou

---

## 2. Critérios gerais

Validar em cada tela:

- Tema claro
- Tema escuro
- Desktop
- Tablet
- Mobile/PWA
- Textos longos
- Densidade visual
- Contraste
- Scroll horizontal
- Filtros
- Botões
- Badges
- Estados vazios
- Modais
- Ações destrutivas

Checagens transversais:

- `#444ce7` preservado como identidade
- Journey mantido como conceito, não paleta
- Ausência de estética areia/âmbar/terracota/deserto
- Cards com separação suficiente
- Inputs e selects sem foco agressivo
- Tabelas legíveis
- Sidebar e bottom nav sem peso excessivo
- Mobile sem conteúdo coberto por navegação fixa

---

## 3. Modelo de registro

| Tela    | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação  | Arquivo provável                          | Prioridade | Responsável | Status       |
| ------- | ----- | ------ | ------- | ------ | ------ | ------------- | ----------- | ----------------------------------------- | ---------- | ----------- | ------------ |
| Exemplo | ☐     | ☐      | ☐       | ☐      | ☐      | Aprovado      | Sem ajustes | `packages/frontend/src/pages/Exemplo.tsx` | Baixa      |             | Não iniciado |

Legenda de marcação:

- `☐` = não validado
- `☑` = validado

---

## 4. Login e Autenticação

| Tela           | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                 | Prioridade | Responsável | Status       |
| -------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | ------------------------------------------------ | ---------- | ----------- | ------------ |
| Login          | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/Login.tsx`          |            |             | Não iniciado |
| ForgotPassword | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/ForgotPassword.tsx` |            |             | Não iniciado |
| ResetPassword  | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/ResetPassword.tsx`  |            |             | Não iniciado |

Checks específicos:

- Mensagens de erro curtas e claras
- Card central sem aparência apertada
- Estado de sucesso discreto
- Links de retorno visíveis nos dois temas

---

## 5. Dashboard

| Tela      | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                            | Prioridade | Responsável | Status       |
| --------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | ------------------------------------------- | ---------- | ----------- | ------------ |
| Dashboard | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/Dashboard.tsx` |            |             | Não iniciado |

Checks específicos:

- Cards estatísticos com separação suficiente
- Gráficos e barras legíveis no dark mode
- Bottom nav não cobrindo conteúdo no mobile

---

## 6. Comunicados

| Tela                   | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                                | Prioridade | Responsável | Status       |
| ---------------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | --------------------------------------------------------------- | ---------- | ----------- | ------------ |
| Comunicados do usuário | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/ComunicadosPage.tsx`               |            |             | Não iniciado |
| Gestão de Comunicados  | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/configuracoes/ComunicadosPage.tsx` |            |             | Não iniciado |

Checks específicos:

- Badges e prioridades sem saturação excessiva
- Leitura confortável de títulos maiores
- Modais e ações destrutivas bem diferenciados

---

## 7. Ausências

| Tela                   | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                                    | Prioridade | Responsável | Status       |
| ---------------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | ------------------------------------------------------------------- | ---------- | ----------- | ------------ |
| Ausências Admin        | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/configuracoes/AusenciasPage.tsx`       |            |             | Não iniciado |
| Minhas Ausências       | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/colaborador/MinhasAusenciasPage.tsx`   |            |             | Não iniciado |
| Relatório de Ausências | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/relatorios/RelatorioAusenciasPage.tsx` |            |             | Não iniciado |

Checks específicos:

- Tabelas e filtros sem dominar a primeira dobra
- Anexos, modais e estados vazios legíveis
- Ações de aprovação/rejeição bem diferenciadas

---

## 8. Relatórios

| Tela                  | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                                      | Prioridade | Responsável | Status       |
| --------------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | --------------------------------------------------------------------- | ---------- | ----------- | ------------ |
| Relatórios Gerenciais | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/relatorios/RelatoriosGerenciaisPage.tsx` |            |             | Não iniciado |
| Exportações / apoio   | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/relatorios/ExportacoesPage.tsx`          |            |             | Não iniciado |

Checks específicos:

- Grids e cards sem ficarem esticados no desktop amplo
- Cabeçalhos e totais com hierarquia calma

---

## 9. Usuários e Configurações

| Tela            | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                             | Prioridade | Responsável | Status       |
| --------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | ------------------------------------------------------------ | ---------- | ----------- | ------------ |
| Usuários        | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/configuracoes/UsuariosPage.tsx` |            |             | Não iniciado |
| Empresa         | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/configuracoes/EmpresaPage.tsx`  |            |             | Não iniciado |
| Projetos        | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/configuracoes/ProjetosPage.tsx` |            |             | Não iniciado |
| Admin / Sistema | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/configuracoes/AdminPage.tsx`    |            |             | Não iniciado |

Checks específicos:

- Formulários longos com boa leitura
- Tabelas administrativas sem contraste baixo
- Modais de confirmação claros

---

## 10. Auditoria

| Tela      | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                          | Prioridade | Responsável | Status       |
| --------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | --------------------------------------------------------- | ---------- | ----------- | ------------ |
| Auditoria | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/auditoria/AuditoriaPage.tsx` |            |             | Não iniciado |

Checks específicos:

- Filtros legíveis
- Linhas e cards sem ruído excessivo
- Mensagens de erro e vazio objetivas

---

## 11. Produção

| Tela                 | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                                | Prioridade | Responsável | Status       |
| -------------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | --------------------------------------------------------------- | ---------- | ----------- | ------------ |
| Produção             | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/operacao/ProducaoPage.tsx`         |            |             | Não iniciado |
| Importação Histórica | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/producao/ImportarProducaoPage.tsx` |            |             | Não iniciado |

Checks específicos:

- Cards de origem e preview sem estouro em mobile
- Ação destrutiva `Excluir dados importados` continua grave e segura

---

## 12. Operação

| Tela                        | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                         | Prioridade | Responsável | Status       |
| --------------------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | ---------------------------------------- | ---------- | ----------- | ------------ |
| Painéis operacionais gerais | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/operacao/*` |            |             | Não iniciado |

Checks específicos:

- Containers com borda suficiente
- Badges operacionais sem neon
- Desktop amplo sem alongar demais o conteúdo

---

## 13. Etapa Operacional

| Tela              | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                                | Prioridade | Responsável | Status       |
| ----------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | --------------------------------------------------------------- | ---------- | ----------- | ------------ |
| Etapa Operacional | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/operacao/EtapaOperacionalPage.tsx` |            |             | Não iniciado |

Checks específicos:

- Tabs, subtabs e badges legíveis
- Tabelas e painéis sem densidade excessiva

---

## 14. Controle de Qualidade

| Tela                  | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                                  | Prioridade | Responsável | Status       |
| --------------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | ----------------------------------------------------------------- | ---------- | ----------- | ------------ |
| Controle de Qualidade | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/operacao/ControleQualidadePanel.tsx` |            |             | Não iniciado |

Checks específicos:

- Badges aprovado/reprovado claros sem agressividade
- Preview, filtros e modal com contraste suficiente

---

## 15. Recebimento

| Tela                | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                                   | Prioridade | Responsável | Status       |
| ------------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | ------------------------------------------------------------------ | ---------- | ----------- | ------------ |
| Recebimento Avulsos | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/operacao/RecebimentoAvulsosPanel.tsx` |            |             | Não iniciado |
| Recebimento em Lote | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/operacao/RecebimentoLoteModal.tsx`    |            |             | Não iniciado |

Checks específicos:

- Modais e checklists sem peso excessivo
- Upload e preview sem scroll horizontal

---

## 16. Devoluções

| Tela       | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                          | Prioridade | Responsável | Status       |
| ---------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | --------------------------------------------------------- | ---------- | ----------- | ------------ |
| Devoluções | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/operacao/DevolucoesPage.tsx` |            |             | Não iniciado |

Checks específicos:

- Painéis e modais legíveis
- Ações destrutivas claramente diferenciadas

---

## 17. Base de Conhecimento

| Tela                 | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                                       | Prioridade | Responsável | Status       |
| -------------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | ---------------------------------------------------------------------- | ---------- | ----------- | ------------ |
| Base de Conhecimento | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/operacao/ConhecimentoOperacionalPage.tsx` |            |             | Não iniciado |

Checks específicos:

- Leitura de listas e tabs
- Textos longos e links com contraste suficiente

---

## 18. Captura de Mapas

| Tela             | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                              | Prioridade | Responsável | Status       |
| ---------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | ------------------------------------------------------------- | ---------- | ----------- | ------------ |
| Captura de Mapas | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/colaborador/CapturaMapaPage.tsx` |            |             | Não iniciado |

Checks específicos:

- Preview de imagem contido
- Fila sem estouro
- Modais leves em tela pequena

---

## 19. Importação Histórica

| Tela                 | Claro | Escuro | Desktop | Tablet | Mobile | Classificação | Observação | Arquivo provável                                                | Prioridade | Responsável | Status       |
| -------------------- | ----- | ------ | ------- | ------ | ------ | ------------- | ---------- | --------------------------------------------------------------- | ---------- | ----------- | ------------ |
| Importação Histórica | ☐     | ☐      | ☐       | ☐      | ☐      |               |            | `packages/frontend/src/pages/producao/ImportarProducaoPage.tsx` |            |             | Não iniciado |

Checks específicos:

- Filtros e tabs não dominam a primeira dobra
- Preview/tabela sem ficar ilegível
- Ações destrutivas continuam seguras

---

## 20. Resumo final

| Bloco                | Resultado final | Observação |
| -------------------- | --------------- | ---------- |
| Autenticação         |                 |            |
| Dashboard            |                 |            |
| Comunicados          |                 |            |
| Ausências            |                 |            |
| Relatórios           |                 |            |
| Configurações        |                 |            |
| Auditoria            |                 |            |
| Produção             |                 |            |
| Operação             |                 |            |
| Captura / Importação |                 |            |

## 21. Aprovação de homologação

| Item                  | Preenchimento |
| --------------------- | ------------- |
| Data da homologação   |               |
| Ambiente validado     |               |
| Responsável principal |               |
| Situação final        |               |
| Observações finais    |               |
