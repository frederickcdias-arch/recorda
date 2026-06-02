# Headers de Seguranca HTTP — Recorda

## Origem

Ajuste realizado com base no relatório **PentestTools Light Scanner** executado em `https://recorda.company/login`.

O relatório indicou risco geral **baixo**, sem achados críticos, altos ou médios. Os headers ausentes identificados foram:

- `Referrer-Policy`
- `Content-Security-Policy`
- `X-Content-Type-Options`

## Headers Aplicados

| Header                    | Valor                                                      | Justificativa                                                              |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Referrer-Policy`         | `no-referrer`                                              | Não vazar URL de origem em requisições externas                            |
| `X-Content-Type-Options`  | `nosniff`                                                  | Impede MIME-sniffing pelo browser                                          |
| `Content-Security-Policy` | ver abaixo                                                 | Restringe origens permitidas de recursos                                   |
| `Permissions-Policy`      | `camera=(self), microphone=(), geolocation=(), payment=()` | Limita acesso a APIs de dispositivo; câmera liberada para Captura de Mapas |

### CSP Completa

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob:;
connect-src 'self' https://api.recorda.company;
manifest-src 'self';
worker-src 'self' blob:;
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
form-action 'self';
```

## Arquivos Alterados

| Arquivo       | Ambiente               |
| ------------- | ---------------------- |
| `vercel.json` | Produção (Vercel)      |
| `nginx.conf`  | Docker local / staging |

## Compatibilidade PWA e Câmera

- **Manifest**: `manifest-src 'self'` — compatível
- **Service Worker**: `worker-src 'self' blob:` — compatível
- **Assets Vite**: `script-src 'self'`, `style-src 'self' 'unsafe-inline'` — compatível (Vite injeta estilos inline)
- **Fontes Google**: `style-src https://fonts.googleapis.com`, `font-src https://fonts.gstatic.com` — compatível
- **Imagens blob/data**: `img-src 'self' data: blob:` — compatível
- **API**: `connect-src 'self' https://api.recorda.company` — compatível
- **Câmera / Captura de Mapas**: `Permissions-Policy: camera=(self)` — câmera permitida para a própria origem; não bloqueada

> Se houver domínio de API em homologação diferente de `https://api.recorda.company`, incluir também no `connect-src` e atualizar este documento.

## Como Validar após o Deploy

1. Acessar `https://recorda.company/login` no navegador
2. Abrir DevTools (`F12`) > aba **Network**
3. Recarregar a página e selecionar o documento `login` (tipo `document`)
4. Clicar em **Response Headers** e confirmar presença de:
   - `Referrer-Policy: no-referrer`
   - `X-Content-Type-Options: nosniff`
   - `Content-Security-Policy: default-src 'self'; ...`
   - `Permissions-Policy: camera=(self), ...`
5. Testar funcionalmente:
   - Login e navegação principal
   - PWA (instalar ou recarregar)
   - Captura de Mapas / acesso à câmera
   - Chamadas para a API (sem erros CORS ou CSP no console)

Também pode ser validado com [securityheaders.com](https://securityheaders.com) ou re-executando o PentestTools Light Scanner.
