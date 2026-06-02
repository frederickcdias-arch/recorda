import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const frontendUrl = (process.env.PUSH_TEST_FRONTEND_URL || 'http://localhost:4173').trim();
const backendUrl = (process.env.PUSH_TEST_BACKEND_URL || 'http://localhost:3000').trim();
const adminEmail = (process.env.PUSH_TEST_ADMIN_EMAIL || 'admin@recorda.local').trim();
const adminPassword = requireEnv('PUSH_TEST_ADMIN_PASSWORD');
const userEmail = (process.env.PUSH_TEST_USER_EMAIL || 'push.teste@recorda.local').trim();
const userPassword = requireEnv('PUSH_TEST_USER_PASSWORD');
const userName = (process.env.PUSH_TEST_USER_NAME || 'Push Teste').trim();
const userProfile = (process.env.PUSH_TEST_USER_PROFILE || 'colaborador').trim();
const waitMs = Number(process.env.PUSH_TEST_WAIT_MS || 12_000);
const vapidPublicKey = (
  process.env.VITE_VAPID_PUBLIC_KEY ||
  process.env.VAPID_PUBLIC_KEY ||
  ''
).trim();

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const userDataDir = path.join(repoRoot, '.tmp', 'playwright-push-profile');

ensureSafeBaseUrl(frontendUrl, 'PUSH_TEST_ALLOW_REMOTE');
ensureSafeBaseUrl(backendUrl, 'PUSH_TEST_ALLOW_REMOTE');

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (value) return value;
  throw new Error(`Defina ${name} antes de executar este script.`);
}

function ensureSafeBaseUrl(baseUrl, allowRemoteEnv) {
  const parsed = new URL(baseUrl);
  const host = parsed.hostname.toLowerCase();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const allowRemote = process.env[allowRemoteEnv]?.trim().toLowerCase() === 'true';
  if (!isLocalHost && !allowRemote) {
    throw new Error(
      `Este script parece apontar para ambiente remoto. Defina ${allowRemoteEnv}=true se tiver certeza.`
    );
  }
}

function createDatabaseClient() {
  return new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

async function loginApi(email, senha) {
  const response = await fetch(`${backendUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Falha no login API para ${email}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function ensureRecipientUser(database) {
  const existing = await database.query(`SELECT id FROM usuarios WHERE email = $1`, [userEmail]);
  if (existing.rows.length > 0) {
    await database.query(`UPDATE usuarios SET ativo = TRUE WHERE email = $1`, [userEmail]);
    return existing.rows[0].id;
  }

  const bcrypt = await import('bcryptjs');
  const senhaHash = await bcrypt.hash(userPassword, 10);
  const inserted = await database.query(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING id`,
    [userName, userEmail, senhaHash, userProfile]
  );

  return inserted.rows[0].id;
}

async function waitForSubscription(page, timeoutMs) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      return {
        permission: Notification.permission,
        hasSubscription: !!subscription,
        endpoint: subscription?.endpoint ?? null,
      };
    });

    if (state.hasSubscription) {
      return state;
    }

    await page.waitForTimeout(1_000);
  }

  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    return {
      permission: Notification.permission,
      hasSubscription: !!subscription,
      endpoint: subscription?.endpoint ?? null,
    };
  });
}

async function main() {
  const database = createDatabaseClient();
  await database.connect();

  try {
    const userId = await ensureRecipientUser(database);
    await database.query(`DELETE FROM push_subscriptions WHERE usuario_id = $1`, [userId]);

    await fs.rm(userDataDir, { recursive: true, force: true });

    const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
    await context.grantPermissions(['notifications'], { origin: frontendUrl });
    const page = context.pages()[0] ?? (await context.newPage());

    await page.goto(`${frontendUrl}/login`, { waitUntil: 'networkidle' });
    await page.fill('#email', userEmail);
    await page.fill('#password', userPassword);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000, waitUntil: 'commit' });

    const browserState = await waitForSubscription(page, waitMs);
    const autoSubscription = browserState.hasSubscription;

    const subscriptionsResult = await database.query(
      `SELECT endpoint, ativo
       FROM push_subscriptions
       WHERE usuario_id = $1
       ORDER BY criado_em DESC`,
      [userId]
    );

    const adminLogin = await loginApi(adminEmail, adminPassword);
    const marker = `Teste Push ${Date.now()}`;

    const createResponse = await fetch(`${backendUrl}/admin/comunicados`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminLogin.accessToken}`,
      },
      body: JSON.stringify({
        titulo: marker,
        conteudo: `Conteudo de teste ${marker}`,
        prioridade: 'ALTA',
        escopoDestino: 'USUARIOS_ESPECIFICOS',
      }),
    });
    const created = await createResponse.json();

    if (!createResponse.ok) {
      throw new Error(`Falha ao criar comunicado: ${JSON.stringify(created)}`);
    }

    const publishResponse = await fetch(
      `${backendUrl}/admin/comunicados/${created.comunicado.id}/publicar`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminLogin.accessToken}`,
        },
        body: JSON.stringify({ usuarioIds: [userId] }),
      }
    );
    const published = await publishResponse.json();

    if (!publishResponse.ok) {
      throw new Error(`Falha ao publicar comunicado: ${JSON.stringify(published)}`);
    }

    await page.waitForTimeout(5_000);

    const userLogin = await loginApi(userEmail, userPassword);
    const unreadResponse = await fetch(`${backendUrl}/comunicados/nao-lidos`, {
      headers: { Authorization: `Bearer ${userLogin.accessToken}` },
    });
    const unreadData = await unreadResponse.json();

    if (!unreadResponse.ok) {
      throw new Error(`Falha ao consultar nao lidos: ${JSON.stringify(unreadData)}`);
    }

    const deliveryResult = await database.query(
      `SELECT cd.lido_em, cd.entregue_em, c.status, c.publicado_em
       FROM comunicado_destinatarios cd
       JOIN comunicados c ON c.id = cd.comunicado_id
       WHERE cd.usuario_id = $1 AND c.id = $2`,
      [userId, created.comunicado.id]
    );

    const summary = {
      autoSubscription,
      browserState,
      subscriptionRows: subscriptionsResult.rows.length,
      subscriptionActive: subscriptionsResult.rows[0]?.ativo ?? null,
      publishResult: published,
      unreadFound: unreadData.comunicados.some((item) => item.titulo === marker),
      unreadTotal: unreadData.totalNaoLidos,
      destinatarioRow: deliveryResult.rows[0] ?? null,
    };

    if (!summary.autoSubscription) {
      throw new Error(`Auto-subscription nao ocorreu no app: ${JSON.stringify(summary)}`);
    }

    if (!summary.browserState.hasSubscription || summary.subscriptionRows === 0) {
      throw new Error(`Subscription nao registrada corretamente: ${JSON.stringify(summary)}`);
    }

    if (!summary.unreadFound || !summary.destinatarioRow) {
      throw new Error(`Comunicado nao entregue corretamente: ${JSON.stringify(summary)}`);
    }

    console.log(JSON.stringify(summary, null, 2));

    await context.close();
  } finally {
    await database.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
