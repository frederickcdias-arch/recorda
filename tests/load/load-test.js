/**
 * Load Testing Configuration
 * Scripts para testes de carga e stress testing
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Métricas personalizadas
const errorRate = new Rate('errors');

// Configuração de testes
export const options = {
  // Teste de carga progressivo
  stages: [
    { duration: '2m', target: 10 },   // Ramp up para 10 usuários
    { duration: '5m', target: 10 },   // Manter 10 usuários
    { duration: '2m', target: 50 },   // Ramp up para 50 usuários
    { duration: '5m', target: 50 },   // Manter 50 usuários
    { duration: '2m', target: 100 },  // Ramp up para 100 usuários
    { duration: '5m', target: 100 },  // Manter 100 usuários
    { duration: '2m', target: 0 },    // Ramp down
  ],
  
  // Limites de performance
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% das requisições < 500ms
    http_req_failed: ['rate<0.1'],     // Taxa de erro < 10%
    errors: ['rate<0.1'],              // Taxa de erro personalizada < 10%
  },
};

// Base URL da aplicação
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Dados de teste
const testUsers = [
  { email: 'test1@example.com', password: 'Test123456!' },
  { email: 'test2@example.com', password: 'Test123456!' },
  { email: 'test3@example.com', password: 'Test123456!' },
];

// Função de login
function login(email: string, password: string) {
  const response = http.post(`${BASE_URL}/auth/login`, {
    email,
    password,
  }, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const success = check(response, {
    'login status is 200': (r) => r.status === 200,
    'login response has token': (r) => r.json('accessToken') !== undefined,
  });

  errorRate.add(!success);

  if (success) {
    return response.json('accessToken');
  }
  return null;
}

// Função principal de teste
export default function () {
  // Login
  const randomUser = testUsers[Math.floor(Math.random() * testUsers.length)];
  const token = login(randomUser.email, randomUser.password);

  if (!token) {
    console.error('Failed to login, skipping test iteration');
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Teste de endpoints principais
  const endpoints = [
    { path: '/usuarios', method: 'GET' },
    { path: '/usuarios/ativos', method: 'GET' },
    { path: '/projetos', method: 'GET' },
    { path: '/dashboard/estatisticas', method: 'GET' },
    { path: '/relatorios/operacional?dataInicio=2024-01-01&dataFim=2024-12-31', method: 'GET' },
    { path: '/configuracao/empresas', method: 'GET' },
  ];

  for (const endpoint of endpoints) {
    let response;

    if (endpoint.method === 'GET') {
      response = http.get(`${BASE_URL}${endpoint.path}`, { headers });
    } else if (endpoint.method === 'POST') {
      response = http.post(`${BASE_URL}${endpoint.path}`, {}, { headers });
    }

    const success = check(response, {
      [`${endpoint.method} ${endpoint.path} status is 200`]: (r) => r.status === 200,
      [`${endpoint.method} ${endpoint.path} response time < 500ms`]: (r) => r.timings.duration < 500,
    });

    errorRate.add(!success);
  }

  // Pausa entre requisições
  sleep(1);
}

// Função de setup (opcional)
export function setup() {
  console.log('Iniciando teste de carga...');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Users: ${testUsers.length}`);
}

// Função de teardown (opcional)
export function teardown(data) {
  console.log('Teste de carga concluído');
}
