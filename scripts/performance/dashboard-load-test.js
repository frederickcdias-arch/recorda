import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    'group_duration{group:dashboard}': ['p(95)<1200'],
    'group_duration{group:relatorio}': ['p(95)<1500'],
  },
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 25 },
    { duration: '30s', target: 0 },
  ],
};

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL ?? 'admin@recorda.local';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD ?? 'admin123';

function login() {
  const response = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, senha: ADMIN_PASSWORD }),
    {
      headers: { 'Content-Type': 'application/json' },
      redirects: 0,
    }
  );

  check(response, {
    'login status 200': (r) => r.status === 200,
    'recebe token de acesso': (r) => Boolean(r.json('accessToken')),
  });

  return response.json('accessToken');
}

export default function () {
  const token = login();
  const authHeaders = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  group('dashboard', () => {
    const dashboardRes = http.get(`${BASE_URL}/dashboard`, authHeaders);
    check(dashboardRes, {
      'dashboard 200': (r) => r.status === 200,
      'tem stats': (r) => typeof r.json('stats') === 'object',
    });
  });

  group('relatorio', () => {
    const relatorioRes = http.get(
      `${BASE_URL}/relatorios?dataInicio=2024-01-01&dataFim=2024-01-31&formato=json`,
      authHeaders
    );
    check(relatorioRes, {
      'relatorio 200': (r) => r.status === 200,
      'resumo por etapa preenchido': (r) => Array.isArray(r.json('resumoPorEtapa')),
    });
  });

  sleep(1);
}
