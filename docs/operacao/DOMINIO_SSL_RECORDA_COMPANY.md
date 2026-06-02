# DOMINIO, SSL E API - RECORDA

## 1. Dominio oficial

- Frontend oficial: `https://recorda.company`
- Dominio tecnico/fallback Vercel: `https://recorda-six.vercel.app`
- API planejada: `https://api.recorda.company`

## 2. Estado atual esperado

- `recorda.company` deve ser o unico endereco divulgado para usuarios.
- `recorda-six.vercel.app` deve ficar apenas como fallback tecnico da Vercel.
- Enquanto `api.recorda.company` nao estiver validado no Railway com SSL ativo, o frontend pode usar temporariamente a URL publica atual do backend Railway em `VITE_API_BASE`.

## 3. Variaveis de ambiente

### Vercel / Frontend

- `VITE_API_BASE=https://api.recorda.company`
- Temporario, se a API ainda estiver no Railway: `VITE_API_BASE=https://<backend-atual>.up.railway.app`

### Railway / Backend

- `CORS_ORIGIN=https://recorda.company`
- Migracao temporaria suportada pelo backend atual: `CORS_ORIGIN=https://recorda.company,https://recorda-six.vercel.app`
- `APP_URL=https://recorda.company`

## 4. CORS no backend

- O backend le `CORS_ORIGIN` em producao.
- Hoje ele suporta:
  - um origin unico; ou
  - multiplos origins separados por virgula.
- Nao usar `*` em producao.
- Nao usar `http://` em producao.

## 5. Checklist Vercel

1. Confirmar `recorda.company` como dominio Production.
2. Definir `VITE_API_BASE` com HTTPS.
3. Fazer redeploy do frontend.
4. Validar `https://recorda.company/login`.
5. Confirmar ausencia de chamadas para `http://` e ausencia de chamadas operacionais para `recorda-six.vercel.app`.

## 6. Checklist Railway

1. Definir `CORS_ORIGIN=https://recorda.company`.
2. Se necessario na transicao, incluir tambem `https://recorda-six.vercel.app`.
3. Definir `APP_URL=https://recorda.company`.
4. Configurar custom domain `api.recorda.company` no servico backend.
5. Apontar o DNS conforme a instrucao do Railway.
6. Aguardar validacao SSL.
7. Testar `https://api.recorda.company/health`.

## 7. Fluxo para ativar `api.recorda.company`

1. Criar o custom domain `api.recorda.company` no Railway.
2. Configurar DNS/CNAME do subdominio conforme o Railway informar.
3. Esperar o certificado SSL ficar valido.
4. Testar `https://api.recorda.company/health`.
5. Atualizar a Vercel para `VITE_API_BASE=https://api.recorda.company`.
6. Manter `CORS_ORIGIN=https://recorda.company`.

## 8. Checklist pos-deploy

1. Abrir `https://recorda.company/login`.
2. Confirmar certificado valido e sem alerta de privacidade.
3. Testar login, dashboard, uma chamada de API e logout.
4. No DevTools > Network, confirmar:
   - API em HTTPS;
   - sem erro de CORS;
   - sem mixed content;
   - sem chamadas HTTP;
   - sem uso operacional de `recorda-six.vercel.app`.
5. Repetir o teste na rede/computador onde houve `NET::ERR_CERT_AUTHORITY_INVALID`.

## 9. Redes com erro de certificado

Se o erro persistir mesmo com `recorda.company`:

1. Verificar data e hora do computador.
2. Atualizar o Chrome.
3. Testar em outra rede, idealmente 4G.
4. Verificar o emissor do certificado apresentado.
5. Suspeitar de proxy, firewall ou antivirus com inspecao SSL.

## 10. O que nao fazer

- Nao orientar usuario a ignorar aviso de certificado.
- Nao usar `http://` em producao.
- Nao operar com dominio preview como endereco principal.
- Nao commitar segredo real.
