import { createServer } from '../src/infrastructure/http/server.js';

async function main() {
  const mockDb = {
    query: async (text, params) => {
      if (text.includes("SELECT COALESCE(SUM(quantidade)")) return { rows: [{ total: '100' }] };
      if (text.includes("SELECT COUNT(*) as total FROM processos_principais WHERE status = 'ATIVO'")) return { rows: [{ total: '5' }] };
      if (text.includes("SELECT COUNT(*) as total FROM processos_principais WHERE criado_em >=")) return { rows: [{ total: '2' }] };
      if (text.includes("SELECT COUNT(*) as total FROM documentos_ocr WHERE status = 'PENDENTE'")) return { rows: [{ total: '3' }] };
      if (text.includes("SELECT COUNT(*) as total FROM colaboradores WHERE ativo = true")) return { rows: [{ total: '10' }] };
      if (text.includes('FROM etapas e')) return { rows: [{ etapa: 'Digitalização', valor: '42' }, { etapa: 'Qualidade', valor: '18' }] };
      if (text.includes("SELECT COUNT(*) as total FROM documentos_ocr WHERE status = 'CONCLUIDO'")) return { rows: [{ total: '1' }] };
      if (text.includes("SELECT COUNT(*) as total FROM documentos_ocr WHERE status = 'ERRO'")) return { rows: [{ total: '0' }] };
      if (text.includes("SELECT COUNT(*) as total FROM documentos_ocr WHERE criado_em >=")) return { rows: [{ total: '60' }] };
      if (text.includes("SELECT COUNT(*) as total FROM importacoes WHERE status = 'PENDENTE'")) return { rows: [{ total: '0' }] };
      return { rows: [{ total: '0' }] };
    }
  };

  const server = await createServer({ database: mockDb, config: { env: 'test', jwtSecret: 'x' } });
  const res = await server.inject({ method: 'GET', url: '/dashboard', headers: {} });
  console.log('status', res.statusCode);
  console.log('body', res.payload);
  await server.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
