const fetch = require('node-fetch');

const baseUrl = getEnv('TEST_LOGIN_BASE_URL', 'http://localhost:3000');
const email = getEnv('TEST_LOGIN_EMAIL', 'admin@recorda.local');
const password = requireEnv('TEST_LOGIN_PASSWORD');

ensureSafeBaseUrl(baseUrl);

function getEnv(name, fallback = '') {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function requireEnv(name) {
  const value = getEnv(name);
  if (value) return value;
  throw new Error(`Defina ${name} antes de executar este script manual.`);
}

function ensureSafeBaseUrl(value) {
  const parsed = new URL(value);
  const host = parsed.hostname.toLowerCase();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const allowRemote = getEnv('TEST_LOGIN_ALLOW_REMOTE', '').toLowerCase() === 'true';
  if (!isLocalHost && !allowRemote) {
    throw new Error(
      'Este teste manual parece apontar para ambiente remoto. Defina TEST_LOGIN_ALLOW_REMOTE=true se tiver certeza.'
    );
  }
}

async function testLogin() {
  try {
    console.log('Testando login...');

    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        senha: password,
      }),
    });

    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers));

    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok && data.accessToken) {
      console.log('\nLogin bem-sucedido.');
      console.log('Token:', `${data.accessToken.substring(0, 50)}...`);

      console.log('\nTestando /auth/me...');
      const meResponse = await fetch(`${baseUrl}/auth/me`, {
        headers: {
          Authorization: `Bearer ${data.accessToken}`,
        },
      });

      console.log('Status /auth/me:', meResponse.status);
      const meData = await meResponse.json();
      console.log('User data:', JSON.stringify(meData, null, 2));
    } else {
      console.log('\nLogin falhou.');
    }
  } catch (error) {
    console.error('Erro:', error);
  }
}

testLogin();
