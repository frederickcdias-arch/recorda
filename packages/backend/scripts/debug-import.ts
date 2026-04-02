import { createServer } from '../src/infrastructure/http/server.js';

async function run() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'debug-secret';
  const database = {
    query: async (text: string, params?: any[]) => {
      if (text.includes('SELECT * FROM fontes_dados WHERE id = $1 AND ativa = true')) {
        return {
          rows: [
            {
              id: 'fonte-1',
              nome: 'Fonte CSV',
              tipo: 'CSV',
              ativa: true,
              url_api: 'https://example.com/csv',
            },
          ],
        };
      }
      return { rows: [] };
    },
    healthCheck: async () => true,
    close: async () => {},
  } as any;

  const server = await createServer({
    database,
    config: { host: '127.0.0.1', port: 0 },
    ocrService: {
      validarImagem: async () => ({ valida: true }),
      extrairTexto: async () => ({
        texto: '',
        confianca: 1,
        idioma: 'pt-BR',
        tempoProcessamento: 0,
      }),
      extrairTextoLote: async () => [],
    },
  } as any);

  globalThis.fetch = async function (url: string, opts?: any) {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'colaborador,quantidade\nMaria,10',
      headers: { get: () => '' },
    } as any;
  } as any;

  // Generate a valid JWT token and use it for the request
  const token = (server as any).jwt.sign({
    id: 'user-1',
    email: 'user@test.com',
    nome: 'Usuário Debug',
    perfil: 'administrador',
  });

  const res = await server.inject({
    method: 'POST',
    url: '/producao/importar-csv',
    headers: { authorization: `Bearer ${token}` },
    payload: { fonteId: 'fonte-1' },
  });
  console.log('status', res.statusCode);
  try {
    console.log('body', res.json());
  } catch (err) {
    console.error('failed to parse body', err, await res.text());
  }

  await server.close();
}

run().catch((err) => {
  console.error('error', err);
  process.exit(1);
});
