# PWA MOBILE UPDATE - RECORDA

## Objetivo

Garantir que o PWA/mobile do Recorda carregue o build mais recente ao abrir o app instalado, reduzindo o risco de ficar preso em assets antigos.

## Diagnostico resumido

- A tela do colaborador usa a mesma rota e o mesmo componente: `packages/frontend/src/pages/colaborador/CapturaMapaPage.tsx`.
- O deploy publicado em `https://recorda.company` ja contem os sinais de C1, C2 e C2-FIX nos chunks servidos pela Vercel.
- O problema mais provavel nao e falta de codigo nem branch errada, e sim PWA instalado com service worker antigo aguardando atualizacao.

## Ajuste aplicado

- Em `packages/frontend/vite.config.ts`, o `vite-plugin-pwa` passou de `registerType: 'prompt'` para `registerType: 'autoUpdate'`.
- Com isso, o app passa a buscar e aplicar a nova versao com menos dependencia de acao manual do usuario ao reabrir/recarregar o PWA.

## Como validar no celular

1. Abrir `https://recorda.company`.
2. Fazer login com perfil colaborador.
3. Ir para `Minha Producao > Captura de Mapas`.
4. Confirmar:
   - fila temporaria;
   - revisao em serie;
   - deteccao automatica de bordas;
   - aviso discreto de bordas amplas;
   - ausencia de toast bloqueante.
5. Fechar o app/PWA completamente.
6. Abrir novamente o PWA instalado.
7. Confirmar que a mesma tela e os mesmos comportamentos continuam presentes.

## Como forcar atualizacao em aparelhos ja instalados

### Android / Chrome

1. Fechar o PWA.
2. Abrir `https://recorda.company` no Chrome.
3. Aguardar alguns segundos com a pagina aberta.
4. Recarregar a pagina.
5. Abrir novamente o app instalado.

Se ainda estiver antigo:

1. Remover o app instalado.
2. Limpar dados do site em `Config. do site > Armazenamento`.
3. Abrir `https://recorda.company` novamente.
4. Instalar o PWA de novo.

### iPhone / Safari

1. Fechar o app adicionado a tela inicial.
2. Abrir `https://recorda.company` no Safari.
3. Recarregar a pagina.
4. Abrir novamente o app da tela inicial.

Se ainda estiver antigo:

1. Remover o atalho/app da tela inicial.
2. Limpar dados do Safari, se necessario.
3. Abrir o site de novo e adicionar novamente a tela inicial.

## Observacoes

- O service worker ja usa `cleanupOutdatedCaches()` e assets com hash.
- A API nao e cacheada no service worker; somente assets estaticos e imagens same-origin usam cache controlado.
- Nao houve alteracao de backend, regra de negocio, auth, dominio ou migration neste lote.
