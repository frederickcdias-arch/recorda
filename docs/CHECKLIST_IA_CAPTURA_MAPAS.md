# Checklist — Validação real da IA na Captura de Mapas

Use este roteiro com imagens reais (não versionadas no repositório). Ative:

```env
OPENAI_IMAGE_ENABLED=true
OPENAI_IMAGE_AUTO_CROP_ENABLED=true
OPENAI_API_KEY=...
```

## Pré-requisitos

- Feature flags ligadas
- Modelo padrão (`OPENAI_IMAGE_MODEL`) — não alterar no código para este teste
- Captura de Mapas no frontend (colaborador)

## Cenários

Para cada linha, capture/processar e registre observações.

| Cenário                | IA detectou bordas? | Cantos no documento? | Recorte cortou texto? | Margem limpa? | Corrigida melhor? | Precisou ajuste manual? | Tempo (ms) | Bytes enviados | Custo OK? | Aprovado? |
| ---------------------- | ------------------- | -------------------- | --------------------- | ------------- | ----------------- | ----------------------- | ---------- | -------------- | --------- | --------- |
| Imagem boa             |                     |                      |                       |               |                   |                         |            |                |           |           |
| Imagem escura          |                     |                      |                       |               |                   |                         |            |                |           |           |
| Imagem inclinada       |                     |                      |                       |               |                   |                         |            |                |           |           |
| Documento cortado      |                     |                      |                       |               |                   |                         |            |                |           |           |
| Sombra                 |                     |                      |                       |               |                   |                         |            |                |           |           |
| Fundo poluído          |                     |                      |                       |               |                   |                         |            |                |           |           |
| Dobra                  |                     |                      |                       |               |                   |                         |            |                |           |           |
| Baixa resolução        |                     |                      |                       |               |                   |                         |            |                |           |           |
| Mapa com texto pequeno |                     |                      |                       |               |                   |                         |            |                |           |           |

## O que verificar em cada caso

1. **Fluxo automático de produção**
   - Após captura, sistema processa sem abrir editor manual
   - Estados: "Processando automaticamente", "Pronto para revisar", "Foto precisa ser refeita", "Aprovado"

2. **Detecção de bordas IA**
   - Badge: "Bordas detectadas automaticamente" ou "Foto precisa ser refeita"
   - Metadados `aiCorners.applied`, `processingDecision.status`
   - `processing.origin = openai-corners` quando aplicado

3. **Qualidade do recorte**
   - Cantos ficaram no documento?
   - Recorte cortou texto?
   - Margem branca limpa?

4. **Cache e reprocessamento**
   - Segunda tentativa na mesma imagem: `cacheHit: true`
   - "Reprocessar com IA" em opções avançadas força nova chamada

5. **Fallback**
   - Flag OFF ou sem API key: fluxo local
   - Falha/timeout: resultado local ou pedido de refoto
   - Ajuste manual apenas em opções avançadas ou perfil operador/admin

6. **Decisão do usuário**
   - Aprovar / Usar original / Refazer foto
   - Ajuste manual não é fluxo principal do colaborador

## Métricas a anotar

- `metadata.openai.durationMs`
- `metadata.openai.sentImageWidth` / `sentImageHeight` / `compressedBytes`
- `metadata.openai.cacheHit`
- `metadata.aiCorners.confidence` / `rejectionReason`
- `metadata.openai.recommendedAction`, `quality`, `problems`
- `metadata.openai.usage` (se a API retornar tokens)

## Critério de aceite

- Usuário não é obrigado a selecionar bordas manualmente no fluxo principal
- IA detecta cantos quando confiança >= threshold
- Original nunca sobrescrito
- Editor manual permanece como exceção técnica (opções avançadas/admin)
- Ausências, Recebimento OCR, logo, PDFs e etiquetas não alterados
