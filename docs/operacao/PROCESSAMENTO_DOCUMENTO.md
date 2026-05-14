# Processamento de Documento Fotografado

O Recorda agora tem duas camadas para captura de mapas e documentos fotografados:

1. `packages/frontend/src/utils/perspectiveCorrection.ts`
   - correcao no navegador;
   - deteccao automatica;
   - ajuste manual de cantos e bordas curvas;
   - preview antes do download/upload.
2. `packages/backend/python/document_processor.py`
   - pipeline em Python + OpenCV pronto para virar API;
   - executado pelo backend quando habilitado por configuracao;
   - fallback automatico para o fluxo atual em Sharp.

## Objetivo do pipeline Python

Entrada:

- foto de documento ou mapa sobre mesa;
- imagem com perspectiva, sombra, ruído e fundo visivel.

Saida:

- documento recortado e frontal quando a deteccao for confiavel;
- melhoria leve de iluminacao, contraste, ruido e nitidez;
- preservacao de cores, legendas, assinaturas, carimbos, mapas e linhas;
- fallback seguro quando a deteccao nao for suficiente.

## Funcao principal

Arquivo: [packages/backend/python/document_processor.py](../../packages/backend/python/document_processor.py)

Assinatura principal:

```python
process_document_image(input_path: str, output_path: str) -> dict
```

Retorno:

```python
{
  "success": True,
  "output_path": "caminho/do/arquivo-gerado.jpg",
  "confidence": 0.81,
  "final_dimensions": {"width": 2100, "height": 2970},
  "fallback_used": False,
}
```

## Pipeline

1. Reduz imagem para deteccao (`DETECT_MAX`).
2. Estima cor do fundo pela borda da foto.
3. Monta mascara combinando distancia de cor ao fundo e pixels de papel.
4. Fecha buracos da mascara e isola o maior documento.
5. Extrai quadrilatero por contorno convexo + `approxPolyDP`, com `minAreaRect` como reserva.
6. Calcula confianca de deteccao por area ocupada e equilibrio das bordas.
7. Se confianca suficiente, aplica `warpPerspective`.
8. Equaliza iluminacao em LAB, reduz sombra leve, aplica denoise suave e unsharp mask.
9. Exporta JPEG ou PNG em alta qualidade.

## Integracao no backend

O backend ja possui o adaptador:

- [packages/backend/src/infrastructure/services/document-image-python-processor.ts](../../packages/backend/src/infrastructure/services/document-image-python-processor.ts)
- [packages/backend/src/infrastructure/services/map-image-processor.ts](../../packages/backend/src/infrastructure/services/map-image-processor.ts)

Com `DOCUMENT_PROCESSOR_ENABLED=true`, a rota:

- `POST /colaborador/capturas-mapa`

passa a tentar o processador Python primeiro.

Resposta enriquecida:

- `confiancaDeteccao`
- `fallbackUsado`
- `dimensoesFinais`
- `processador`

## Variaveis de ambiente

Adicionar no `.env`:

```env
DOCUMENT_PROCESSOR_ENABLED=false
DOCUMENT_PROCESSOR_RUNTIME=python
DOCUMENT_PROCESSOR_PYTHON=python
DOCUMENT_PROCESSOR_SCRIPT=packages/backend/python/document_processor.py
DOCUMENT_PROCESSOR_TEMP_DIR=.tmp/document-processor
DOCUMENT_PROCESSOR_DOCKER_IMAGE=
DOCUMENT_PROCESSOR_DOCKER_BOOTSTRAP=
```

Valores de `DOCUMENT_PROCESSOR_RUNTIME`:

- `python`: usa o binario local configurado em `DOCUMENT_PROCESSOR_PYTHON`;
- `docker`: executa sempre em container;
- `auto`: tenta Python local e cai para Docker se o binario nao existir.

## Dependencias Python

Instalacao local:

```powershell
python -m pip install -r packages/backend/python/requirements.txt
```

## Execucao via Docker

Quando o host nao tiver Python, o backend pode chamar o mesmo script em um container.

Exemplo:

```env
DOCUMENT_PROCESSOR_ENABLED=true
DOCUMENT_PROCESSOR_RUNTIME=auto
DOCUMENT_PROCESSOR_DOCKER_IMAGE=python:3.11-slim
DOCUMENT_PROCESSOR_DOCKER_BOOTSTRAP=python -m pip install --no-cache-dir -r /workspace/packages/backend/python/requirements.txt
DOCUMENT_PROCESSOR_SCRIPT=packages/backend/python/document_processor.py
DOCUMENT_PROCESSOR_TEMP_DIR=.tmp/document-processor
```

Observacao:

- esse bootstrap instala dependencias a cada execucao e serve para desenvolvimento ou validacao;
- em ambiente estavel, o correto e usar uma imagem propria ja com `opencv-python-headless` e `numpy` instalados.

## Observacoes de produto

- A etapa Python nao substitui o ajuste manual do frontend.
- O comportamento esperado e:
  - confianca alta: corrigir automaticamente;
  - confianca baixa: frontend permite ajuste manual;
  - backend pode reaplicar o processamento final com os cantos aprovados pelo usuario em uma iteracao futura.
- Para suportar envio de cantos manuais na API, o proximo passo e aceitar `corners` e `edgeMidpoints` no payload do backend e adicionar um caminho explicito de warp manual no script Python.
