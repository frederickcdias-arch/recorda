/**
 * Teste manual — Fase 1 Justificativas de Ausência
 * Executa: node tests/manual/test-ausencias-fase1.mjs
 */

const BASE = 'http://localhost:3000';
const log = (tag, obj) => console.log(`\n[${tag}]`, JSON.stringify(obj, null, 2));
const sep = (label) => console.log(`\n${'─'.repeat(60)}\n${label}\n${'─'.repeat(60)}`);

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
  const url = `${BASE}${path}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function login(email, senha) {
  const r = await post('/auth/login', { email, senha });
  if (r.status === 200 && r.body.accessToken) return r.body.accessToken;
  throw new Error(`Login failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
}

// ─── Main ─────────────────────────────────────────────────────
sep('SETUP — Obter tokens');

let tokenAdmin, tokenColaborador, tokenOperador;

try {
  tokenAdmin = await login('admin@recorda.local', 'admin123');
  console.log('✅ Admin logado');
} catch (e) {
  // try the other admin
  try {
    tokenAdmin = await login('admin@recorda.com', 'admin123');
    console.log('✅ Admin logado (admin@recorda.com)');
  } catch (e2) {
    console.error('❌', e2.message);
    process.exit(1);
  }
}

// Try known colaborador
for (const cred of [
  { email: 'teste@recorda.local', senha: 'Recorda@2024' },
  { email: 'push.teste@recorda.local', senha: 'admin123' },
  { email: 'thiagoliandro@gmail.com', senha: 'admin123' },
  { email: 'teste@recorda.local', senha: 'admin123' },
]) {
  try {
    tokenColaborador = await login(cred.email, cred.senha);
    console.log(`✅ Colaborador logado (${cred.email})`);
    break;
  } catch { /* try next */ }
}
if (!tokenColaborador) {
  console.warn('⚠️  Nenhum colaborador com senha admin123 — alguns testes serão pulados');
}

// ─── 1. GET /tipos-ausencia (sem auth) ───────────────────────
sep('1. GET /tipos-ausencia — sem token → 401');
const r1 = await get('/tipos-ausencia');
console.log(`Status: ${r1.status} (esperado 401) → ${r1.status === 401 ? '✅' : '❌'}`);

// ─── 2. GET /tipos-ausencia (com token admin) ─────────────────
sep('2. GET /tipos-ausencia — admin → 200');
const r2 = await get('/tipos-ausencia', tokenAdmin);
console.log(`Status: ${r2.status} (esperado 200) → ${r2.status === 200 ? '✅' : '❌'}`);
if (r2.status === 200) {
  const tipos = r2.body.tipos ?? [];
  const temOutro = tipos.some(t => t.nome === 'Outro');
  console.log(`Total tipos: ${tipos.length}, tem "Outro": ${temOutro ? '✅' : '❌'}`);
  console.log('Tipos:', tipos.map(t => t.nome).join(', '));
}

// ─── 3. GET /ausencias/minhas — sem token → 401 ───────────────
sep('3. GET /ausencias/minhas — sem token → 401');
const r3 = await get('/ausencias/minhas');
console.log(`Status: ${r3.status} (esperado 401) → ${r3.status === 401 ? '✅' : '❌'}`);

// ─── 4. GET /ausencias/minhas — admin → 403 (não é colaborador)─
sep('4. GET /ausencias/minhas — admin → 403');
const r4 = await get('/ausencias/minhas', tokenAdmin);
console.log(`Status: ${r4.status} (esperado 403) → ${r4.status === 403 ? '✅' : '❌'}`);

// ─── Testes com colaborador ────────────────────────────────────
if (tokenColaborador) {
  sep('5. GET /ausencias/minhas — colaborador → 200');
  const r5 = await get('/ausencias/minhas', tokenColaborador);
  console.log(`Status: ${r5.status} (esperado 200) → ${r5.status === 200 ? '✅' : '❌'}`);
  if (r5.status === 200) {
    console.log(`Paginação: total=${r5.body.total}, items=${r5.body.items?.length}`);
  }

  // Obter tipos para usar no teste de criação
  const tiposRes = await get('/tipos-ausencia', tokenColaborador);
  const tipoFaltaJust = tiposRes.body.tipos?.find(t => t.nome === 'Falta Justificada');
  const tipoOutro = tiposRes.body.tipos?.find(t => t.nome === 'Outro');
  const tipoSemJust = tiposRes.body.tipos?.find(t => !t.requerJustificativa && !t.requerDocumento);

  sep('6. POST /ausencias — colaborador cria própria ausência');
  const hoje = new Date().toISOString().split('T')[0];
  const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // 6a. Criação válida com tipo que requer justificativa
  if (tipoFaltaJust || tipoOutro) {
    const tipo = tipoFaltaJust ?? tipoOutro;
    const r6a = await post('/ausencias', {
      tipoAusenciaId: tipo.id,
      dataInicio: hoje,
      dataFim: hoje,
      periodo: 'dia_completo',
      justificativa: 'Precisei ir ao médico urgentemente',
    }, tokenColaborador);
    console.log(`6a. Criar com justificativa: ${r6a.status} (esperado 201) → ${r6a.status === 201 ? '✅' : '❌'}`);
    if (r6a.status === 201) log('ausencia criada', r6a.body.ausencia);
    
    // Guardar ID para testar cancelamento
    if (r6a.status === 201) {
      const ausenciaId = r6a.body.ausencia?.id;
      sep('7. POST /ausencias/:id/cancelar — colaborador cancela própria pendente');
      const r7 = await post(`/ausencias/${ausenciaId}/cancelar`, { motivo: 'Motivo teste — cancelamento de ausência pendente' }, tokenColaborador);
      console.log(`Status: ${r7.status} (esperado 200) → ${r7.status === 200 ? '✅' : '❌'}`);
      if (r7.status === 200) log('ausencia cancelada', r7.body.ausencia);
    }
  }

  // 6b. Criação sem justificativa quando requer → 400
  if (tipoFaltaJust || tipoOutro) {
    const tipo = tipoFaltaJust ?? tipoOutro;
    const r6b = await post('/ausencias', {
      tipoAusenciaId: tipo.id,
      dataInicio: hoje,
      dataFim: hoje,
      periodo: 'dia_completo',
      // sem justificativa — deve retornar 400
    }, tokenColaborador);
    console.log(`6b. Criar sem justificativa (requer): ${r6b.status} (esperado 400) → ${r6b.status === 400 ? '✅' : '❌'}`);
  }

  // 6c. periodo=horas sem horasAusencia → 400
  if (tipoSemJust) {
    const r6c = await post('/ausencias', {
      tipoAusenciaId: tipoSemJust.id,
      dataInicio: hoje,
      dataFim: hoje,
      periodo: 'horas',
      // sem horasAusencia → deve retornar 400
    }, tokenColaborador);
    console.log(`6c. periodo=horas sem horasAusencia: ${r6c.status} (esperado 400) → ${r6c.status === 400 ? '✅' : '❌'}`);
  }

  // 6d. dataFim < dataInicio → 400
  if (tipoSemJust) {
    const r6d = await post('/ausencias', {
      tipoAusenciaId: tipoSemJust.id,
      dataInicio: amanha,
      dataFim: hoje,  // anterior ao inicio → 400
      periodo: 'dia_completo',
    }, tokenColaborador);
    console.log(`6d. dataFim < dataInicio: ${r6d.status} (esperado 400) → ${r6d.status === 400 ? '✅' : '❌'}`);
  }

  // 8. Colaborador não pode cancelar ausência de outro
  sep('8. POST /ausencias/:id/cancelar — cancelar ID inexistente → 404');
  const r8 = await post('/ausencias/00000000-0000-0000-0000-000000000000/cancelar', { motivo: 'Teste' }, tokenColaborador);
  console.log(`Status: ${r8.status} (esperado 404) → ${r8.status === 404 ? '✅' : '❌'}`);
}

// ─── Testes Admin ──────────────────────────────────────────────
sep('9. Admin POST /admin/ausencias');

// Buscar um colaborador real
const tiposAdminRes = await get('/tipos-ausencia', tokenAdmin);
const tipoParaAdmin = tiposAdminRes.body.tipos?.find(t => !t.requerJustificativa);

// Usar o id do colaborador Teste
const colaboradorId = '6232cf90-4599-47fa-a173-e4a09d4f44ca';
const hoje = new Date().toISOString().split('T')[0];

if (tipoParaAdmin) {
  // 9a. Admin cria ausência pendente para colaborador
  const r9a = await post('/admin/ausencias', {
    usuarioId: colaboradorId,
    tipoAusenciaId: tipoParaAdmin.id,
    dataInicio: hoje,
    dataFim: hoje,
    periodo: 'dia_completo',
  }, tokenAdmin);
  console.log(`9a. Admin cria pendente: ${r9a.status} (esperado 201) → ${r9a.status === 201 ? '✅' : '❌'}`);
  if (r9a.status === 201) log('ausencia admin criada', r9a.body.ausencia);

  // 9b. Admin cria ausência já aprovada
  const r9b = await post('/admin/ausencias', {
    usuarioId: colaboradorId,
    tipoAusenciaId: tipoParaAdmin.id,
    dataInicio: hoje,
    dataFim: hoje,
    periodo: 'meio_periodo_manha',
    status: 'aprovado',
  }, tokenAdmin);
  console.log(`9b. Admin cria aprovado: ${r9b.status} (esperado 201) → ${r9b.status === 201 ? '✅' : '❌'}`);
  if (r9b.status === 201) {
    const ausencia = r9b.body.ausencia;
    const temAprovadoPor = !!ausencia?.aprovadoPor;
    const temAprovadoEm = !!ausencia?.aprovadoEm;
    console.log(`   aprovadoPor preenchido: ${temAprovadoPor ? '✅' : '❌'}, aprovadoEm preenchido: ${temAprovadoEm ? '✅' : '❌'}`);
    log('ausencia aprovada pelo admin', ausencia);

    // 9c. Admin cancela ausência aprovada
    sep('9c. Admin cancela ausência aprovada');
    const r9c = await post(`/admin/ausencias/${ausencia.id}/cancelar`, {
      observacoes: 'Cancelando para fins de teste de validação da Fase 1',
    }, tokenAdmin);
    console.log(`Status: ${r9c.status} (esperado 200) → ${r9c.status === 200 ? '✅' : '❌'}`);
    if (r9c.status === 200) log('ausencia cancelada pelo admin', r9c.body.ausencia);
  }

  // 9d. Admin não pode criar para usuário administrador → 400
  sep('9d. Admin não pode criar ausência para admin (só colaborador)');
  const r9d = await post('/admin/ausencias', {
    usuarioId: '550e8400-e29b-41d4-a716-446655440000', // admin
    tipoAusenciaId: tipoParaAdmin.id,
    dataInicio: hoje,
    dataFim: hoje,
    periodo: 'dia_completo',
  }, tokenAdmin);
  console.log(`Status: ${r9d.status} (esperado 400) → ${r9d.status === 400 ? '✅' : '❌'}`);
}

// ─── 10. Operador → 403 ───────────────────────────────────────
sep('10. Operador não deve acessar endpoints de ausências');
try {
  tokenOperador = await login('operador.teste@recorda.local', 'Recorda@2024');
  console.log('✅ Operador logado');

  const ro1 = await get('/ausencias/minhas', tokenOperador);
  console.log(`GET /ausencias/minhas: ${ro1.status} (esperado 403) → ${ro1.status === 403 ? '✅' : '❌'}`);

  const ro2 = await post('/ausencias', {}, tokenOperador);
  console.log(`POST /ausencias: ${ro2.status} (esperado 403) → ${ro2.status === 403 ? '✅' : '❌'}`);

  const ro3 = await get('/tipos-ausencia', tokenOperador);
  console.log(`GET /tipos-ausencia: ${ro3.status} (esperado 200 — todos autenticados) → ${ro3.status === 200 ? '✅' : '❌'}`);
} catch(e) {
  console.warn('⚠️  Operador login falhou:', e.message);
}

// ─── 11. Upload/Anexo ─────────────────────────────────────────
sep('11. Upload / documento_anexo');
console.log('⚠️  Upload de documento NÃO foi implementado na Fase 1.');
console.log('   → documento_anexo permanece NULL em todos os endpoints de criação.');
console.log('   → Pendência: Fase 1-B');

sep('RESUMO FINAL');
console.log('Verificar resultados ✅/❌ acima.');
