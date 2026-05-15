# Validacao da Correcao de Imagem

## Objetivo

Evitar ajuste por uma unica foto e validar o pipeline por categoria de captura.

## Categorias minimas

Separar amostras reais em pastas:

1. `texto-plano`
2. `texto-torto`
3. `mapa-colorido`
4. `mapa-com-sombra`
5. `folha-com-dobra`
6. `fundo-confuso`
7. `quase-full-frame`
8. `baixa-confianca`

## Script local

Executar a avaliacao em lote:

```powershell
cd c:\projects\recorda
$env:PATH = "C:\projects\recorda\tools\node-v20.19.5-win-x64;" + $env:PATH
.\tools\node-v20.19.5-win-x64\node.exe .\tools\node-v20.19.5-win-x64\node_modules\npm\bin\npm-cli.js run evaluate:documents --workspace=@recorda/backend -- --input-dir C:\imagens\mapa-colorido --output-dir C:\imagens\saida-mapa --mode map_document
```

## O que o resumo retorna

O arquivo `evaluation-summary.json` registra, para cada imagem:

- `engine`
- `confidence`
- `fallback`
- `documentClass`
- `decision`
- `warnings`

## Interpretacao

- `documentClass = map_document`: imagem colorida com perfil de mapa
- `documentClass = text_document`: documento textual
- `documentClass = low_confidence_capture`: captura ruim ou ambigua
- `decision = frontend_assisted`: resultado veio do ajuste/warp aprovado no frontend
- `decision = python_detected`: detector backend encontrou a folha com confianca suficiente
- `decision = safe_fallback`: processamento conservador, sem assumir recorte seguro
- `decision = manual_review_recommended`: o pipeline recomenda revisao humana

## Meta de consistencia

Antes de novo tuning visual, revisar:

1. taxa de `fallback`
2. taxa de `manual_review_recommended`
3. falsos positivos de deteccao
4. perda de conteudo
5. degradacao de cor em `map_document`
