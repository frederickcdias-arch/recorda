import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 1,
  iterations: 1,
};

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3000';

export default function () {
  const loginResponse = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'admin@recorda.local', senha: 'senha-errada' }),
    {
      headers: { 'Content-Type': 'application/json' },
      redirects: 0,
    }
  );

  check(loginResponse, {
    'credenciais inválidas retornam 401': (r) => r.status === 401,
    'sem cabeçalhos sensíveis': (r) => !r.headers['set-cookie'] && !r.headers['Server'],
  });

  const missingAuthResponse = http.get(`${BASE_URL}/dashboard`);
  check(missingAuthResponse, {
    'dashboard sem token retorna 401': (r) => r.status === 401,
  });
}
