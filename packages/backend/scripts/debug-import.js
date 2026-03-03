import { createServer } from '../src/infrastructure/http/server.js';

async function run() {
  // create a minimal mock DB similar to tests
  const database = {
    query: async (text, params) => {
      if (text.includes('SELECT * FROM fontes_dados WHERE id = $1 AND ativa = true')) {
        return { rows: [{ id: 'fonte-1', nome: 'Fonte CSV', tipo: 'CSV', ativa: true, url_api: 'https://example.com/csv' }] };
      }
      return { rows: [] };
    },
    healthCheck: async () => true,
    close: async () => {},
  };

  const server = await createServer({ database, config: { host: '127.0.0.1', port: 0 }, ocrService: { validarImagem: async () => ({ valida: true }), extrairTexto: async () => ({ texto: '', confianca: 1, idioma: 'pt-BR', tempoProcessamento: 0 }), extrairTextoLote: async () => ([]) } });

  // stub global.fetch
  globalThis.fetch = async function(url, opts) {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'colaborador,quantidade\nMaria,10',
      headers: { get: () => '' },
    };
  };

  // create a token by calling the login route? For simplicity, bypass auth by calling server.inject without auth
  const res = await server.inject({ method: 'POST', url: '/producao/importar-csv', payload: { fonteId: 'fonte-1' } });
  console.log('status', res.statusCode);
  console.log('body', res.json());

  await server.close();
}

run().catch(err => { console.error('error', err); process.exit(1); });
