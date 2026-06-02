/**
 * Teste manual - Fase 1 Justificativas de Ausencia
 *
 * Uso:
 *   node tests/manual/test-ausencias-fase1.mjs
 *
 * Variaveis:
 *   RECORDA_MANUAL_BASE_URL=http://localhost:3000
 *   RECORDA_MANUAL_ADMIN_EMAIL=admin@recorda.local
 *   RECORDA_MANUAL_ADMIN_PASSWORD=...
 *   RECORDA_MANUAL_COLABORADOR_EMAIL=teste@recorda.local
 *   RECORDA_MANUAL_COLABORADOR_PASSWORD=...
 *   RECORDA_MANUAL_OPERADOR_EMAIL=operador.teste@recorda.local
 *   RECORDA_MANUAL_OPERADOR_PASSWORD=...
 *   RECORDA_MANUAL_COLABORADOR_ID=...
 *   RECORDA_MANUAL_ADMIN_USUARIO_ID=...
 *   RECORDA_MANUAL_ALLOW_REMOTE=true
 */

const BASE = getEnv('RECORDA_MANUAL_BASE_URL', 'http://localhost:3000');
const ADMIN_EMAIL = getEnv('RECORDA_MANUAL_ADMIN_EMAIL', 'admin@recorda.local');
const ADMIN_PASSWORD = requireEnv('RECORDA_MANUAL_ADMIN_PASSWORD');
const COLABORADOR_EMAIL = getEnv('RECORDA_MANUAL_COLABORADOR_EMAIL', 'teste@recorda.local');
const COLABORADOR_PASSWORD = requireEnv('RECORDA_MANUAL_COLABORADOR_PASSWORD');
const OPERADOR_EMAIL = getEnv('RECORDA_MANUAL_OPERADOR_EMAIL', 'operador.teste@recorda.local');
const OPERADOR_PASSWORD = requireEnv('RECORDA_MANUAL_OPERADOR_PASSWORD');
const COLABORADOR_ID = requireEnv('RECORDA_MANUAL_COLABORADOR_ID');
const ADMIN_USUARIO_ID = requireEnv('RECORDA_MANUAL_ADMIN_USUARIO_ID');

const log = (tag, obj) => console.log(`\n[${tag}]`, JSON.stringify(obj, null, 2));
const sep = (label) => console.log(`\n${'-'.repeat(60)}\n${label}\n${'-'.repeat(60)}`);

ensureSafeBaseUrl(BASE);

function getEnv(name, fallback = '') {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function requireEnv(name) {
  const value = getEnv(name);
  if (value) return value;
  throw new Error(`Defina ${name} antes de executar este teste manual.`);
}

function ensureSafeBaseUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`RECORDA_MANUAL_BASE_URL invalida: ${baseUrl}`);
  }

  const host = parsed.hostname.toLowerCase();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const allowRemote = getEnv('RECORDA_MANUAL_ALLOW_REMOTE', '').toLowerCase() === 'true';
  if (!isLocalHost && !allowRemote) {
    throw new Error(
      'Este teste manual parece apontar para ambiente remoto. Defina RECORDA_MANUAL_ALLOW_REMOTE=true se tiver certeza.'
    );
  }
}

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function get(path, token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function login(email, senha) {
  const r = await post('/auth/login', { email, senha });
  if (r.status === 200 && r.body.accessToken) return r.body.accessToken;
  throw new Error(`Login failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
}

async function main() {
  sep('SETUP - Obter tokens');

  let tokenAdmin;
  let tokenColaborador;
  let tokenOperador;

  tokenAdmin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`OK Admin logado (${ADMIN_EMAIL})`);

  tokenColaborador = await login(COLABORADOR_EMAIL, COLABORADOR_PASSWORD);
  console.log(`OK Colaborador logado (${COLABORADOR_EMAIL})`);

  sep('1. GET /tipos-ausencia - sem token -> 401');
  const r1 = await get('/tipos-ausencia');
  console.log(`Status: ${r1.status} (esperado 401) -> ${r1.status === 401 ? 'OK' : 'ERRO'}`);

  sep('2. GET /tipos-ausencia - admin -> 200');
  const r2 = await get('/tipos-ausencia', tokenAdmin);
  console.log(`Status: ${r2.status} (esperado 200) -> ${r2.status === 200 ? 'OK' : 'ERRO'}`);
  if (r2.status === 200) {
    const tipos = r2.body.tipos ?? [];
    const temOutro = tipos.some((t) => t.nome === 'Outro');
    console.log(`Total tipos: ${tipos.length}, tem "Outro": ${temOutro ? 'OK' : 'ERRO'}`);
    console.log('Tipos:', tipos.map((t) => t.nome).join(', '));
  }

  sep('3. GET /ausencias/minhas - sem token -> 401');
  const r3 = await get('/ausencias/minhas');
  console.log(`Status: ${r3.status} (esperado 401) -> ${r3.status === 401 ? 'OK' : 'ERRO'}`);

  sep('4. GET /ausencias/minhas - admin -> 403');
  const r4 = await get('/ausencias/minhas', tokenAdmin);
  console.log(`Status: ${r4.status} (esperado 403) -> ${r4.status === 403 ? 'OK' : 'ERRO'}`);

  sep('5. GET /ausencias/minhas - colaborador -> 200');
  const r5 = await get('/ausencias/minhas', tokenColaborador);
  console.log(`Status: ${r5.status} (esperado 200) -> ${r5.status === 200 ? 'OK' : 'ERRO'}`);
  if (r5.status === 200) {
    console.log(`Paginacao: total=${r5.body.total}, items=${r5.body.items?.length}`);
  }

  const tiposRes = await get('/tipos-ausencia', tokenColaborador);
  const tipoFaltaJust = tiposRes.body.tipos?.find((t) => t.nome === 'Falta Justificada');
  const tipoOutro = tiposRes.body.tipos?.find((t) => t.nome === 'Outro');
  const tipoSemJust = tiposRes.body.tipos?.find((t) => !t.requerJustificativa && !t.requerDocumento);

  sep('6. POST /ausencias - colaborador cria propria ausencia');
  const hoje = new Date().toISOString().split('T')[0];
  const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  if (tipoFaltaJust || tipoOutro) {
    const tipo = tipoFaltaJust ?? tipoOutro;
    const r6a = await post(
      '/ausencias',
      {
        tipoAusenciaId: tipo.id,
        dataInicio: hoje,
        dataFim: hoje,
        periodo: 'dia_completo',
        justificativa: 'Precisei ir ao medico urgentemente',
      },
      tokenColaborador
    );
    console.log(`6a. Criar com justificativa: ${r6a.status} (esperado 201) -> ${r6a.status === 201 ? 'OK' : 'ERRO'}`);
    if (r6a.status === 201) log('ausencia criada', r6a.body.ausencia);

    if (r6a.status === 201) {
      const ausenciaId = r6a.body.ausencia?.id;
      sep('7. POST /ausencias/:id/cancelar - colaborador cancela propria pendente');
      const r7 = await post(
        `/ausencias/${ausenciaId}/cancelar`,
        { motivo: 'Motivo teste - cancelamento de ausencia pendente' },
        tokenColaborador
      );
      console.log(`Status: ${r7.status} (esperado 200) -> ${r7.status === 200 ? 'OK' : 'ERRO'}`);
      if (r7.status === 200) log('ausencia cancelada', r7.body.ausencia);
    }
  }

  if (tipoFaltaJust || tipoOutro) {
    const tipo = tipoFaltaJust ?? tipoOutro;
    const r6b = await post(
      '/ausencias',
      {
        tipoAusenciaId: tipo.id,
        dataInicio: hoje,
        dataFim: hoje,
        periodo: 'dia_completo',
      },
      tokenColaborador
    );
    console.log(`6b. Criar sem justificativa (requer): ${r6b.status} (esperado 400) -> ${r6b.status === 400 ? 'OK' : 'ERRO'}`);
  }

  if (tipoSemJust) {
    const r6c = await post(
      '/ausencias',
      {
        tipoAusenciaId: tipoSemJust.id,
        dataInicio: hoje,
        dataFim: hoje,
        periodo: 'horas',
      },
      tokenColaborador
    );
    console.log(`6c. periodo=horas sem horasAusencia: ${r6c.status} (esperado 400) -> ${r6c.status === 400 ? 'OK' : 'ERRO'}`);
  }

  if (tipoSemJust) {
    const r6d = await post(
      '/ausencias',
      {
        tipoAusenciaId: tipoSemJust.id,
        dataInicio: amanha,
        dataFim: hoje,
        periodo: 'dia_completo',
      },
      tokenColaborador
    );
    console.log(`6d. dataFim < dataInicio: ${r6d.status} (esperado 400) -> ${r6d.status === 400 ? 'OK' : 'ERRO'}`);
  }

  sep('8. POST /ausencias/:id/cancelar - cancelar ID inexistente -> 404');
  const r8 = await post(
    '/ausencias/00000000-0000-0000-0000-000000000000/cancelar',
    { motivo: 'Teste' },
    tokenColaborador
  );
  console.log(`Status: ${r8.status} (esperado 404) -> ${r8.status === 404 ? 'OK' : 'ERRO'}`);

  sep('9. Admin POST /admin/ausencias');
  const tiposAdminRes = await get('/tipos-ausencia', tokenAdmin);
  const tipoParaAdmin = tiposAdminRes.body.tipos?.find((t) => !t.requerJustificativa);

  if (tipoParaAdmin) {
    const r9a = await post(
      '/admin/ausencias',
      {
        usuarioId: COLABORADOR_ID,
        tipoAusenciaId: tipoParaAdmin.id,
        dataInicio: hoje,
        dataFim: hoje,
        periodo: 'dia_completo',
      },
      tokenAdmin
    );
    console.log(`9a. Admin cria pendente: ${r9a.status} (esperado 201) -> ${r9a.status === 201 ? 'OK' : 'ERRO'}`);
    if (r9a.status === 201) log('ausencia admin criada', r9a.body.ausencia);

    const r9b = await post(
      '/admin/ausencias',
      {
        usuarioId: COLABORADOR_ID,
        tipoAusenciaId: tipoParaAdmin.id,
        dataInicio: hoje,
        dataFim: hoje,
        periodo: 'meio_periodo_manha',
        status: 'aprovado',
      },
      tokenAdmin
    );
    console.log(`9b. Admin cria aprovado: ${r9b.status} (esperado 201) -> ${r9b.status === 201 ? 'OK' : 'ERRO'}`);
    if (r9b.status === 201) {
      const ausencia = r9b.body.ausencia;
      const temAprovadoPor = !!ausencia?.aprovadoPor;
      const temAprovadoEm = !!ausencia?.aprovadoEm;
      console.log(`   aprovadoPor preenchido: ${temAprovadoPor ? 'OK' : 'ERRO'}, aprovadoEm preenchido: ${temAprovadoEm ? 'OK' : 'ERRO'}`);
      log('ausencia aprovada pelo admin', ausencia);

      sep('9c. Admin cancela ausencia aprovada');
      const r9c = await post(
        `/admin/ausencias/${ausencia.id}/cancelar`,
        {
          observacoes: 'Cancelando para fins de teste de validacao da Fase 1',
        },
        tokenAdmin
      );
      console.log(`Status: ${r9c.status} (esperado 200) -> ${r9c.status === 200 ? 'OK' : 'ERRO'}`);
      if (r9c.status === 200) log('ausencia cancelada pelo admin', r9c.body.ausencia);
    }

    sep('9d. Admin nao pode criar ausencia para admin (so colaborador)');
    const r9d = await post(
      '/admin/ausencias',
      {
        usuarioId: ADMIN_USUARIO_ID,
        tipoAusenciaId: tipoParaAdmin.id,
        dataInicio: hoje,
        dataFim: hoje,
        periodo: 'dia_completo',
      },
      tokenAdmin
    );
    console.log(`Status: ${r9d.status} (esperado 400) -> ${r9d.status === 400 ? 'OK' : 'ERRO'}`);
  }

  sep('10. Operador nao deve acessar endpoints de ausencias');
  tokenOperador = await login(OPERADOR_EMAIL, OPERADOR_PASSWORD);
  console.log(`OK Operador logado (${OPERADOR_EMAIL})`);

  const ro1 = await get('/ausencias/minhas', tokenOperador);
  console.log(`GET /ausencias/minhas: ${ro1.status} (esperado 403) -> ${ro1.status === 403 ? 'OK' : 'ERRO'}`);

  const ro2 = await post('/ausencias', {}, tokenOperador);
  console.log(`POST /ausencias: ${ro2.status} (esperado 403) -> ${ro2.status === 403 ? 'OK' : 'ERRO'}`);

  const ro3 = await get('/tipos-ausencia', tokenOperador);
  console.log(`GET /tipos-ausencia: ${ro3.status} (esperado 200 - todos autenticados) -> ${ro3.status === 200 ? 'OK' : 'ERRO'}`);

  sep('11. Upload / documento_anexo');
  console.log('AVISO Upload de documento nao foi implementado na Fase 1.');
  console.log('   -> documento_anexo permanece NULL em todos os endpoints de criacao.');
  console.log('   -> Pendencia: Fase 1-B');

  sep('RESUMO FINAL');
  console.log('Verificar resultados OK/ERRO acima.');
}

await main().catch((error) => {
  console.error('ERRO', error.message);
  process.exit(1);
});
