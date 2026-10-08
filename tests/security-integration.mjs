// Dedicated database and Redis DB 15; no real administrator credentials are used.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { hash } = require('argon2');
const database = new URL(process.env.DATABASE_URL);
database.hostname = 'postgres';
database.pathname = '/studio_security';
const redisUrl = new URL(process.env.REDIS_URL);
redisUrl.pathname = '/15';
process.env.DATABASE_URL = database.href;
process.env.REDIS_URL = redisUrl.href;
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.PORT = '3001';
const migration = spawnSync(process.execPath, ['/app/scripts/prisma.mjs', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: process.env,
});
if (migration.status !== 0) throw new Error('Security test migration failed');
const { db, redis, closeInfra } = await import('../apps/api/dist/infra.js');
const { consumeLimit, accountLimitKey, passwordCheck } =
  await import('../apps/api/dist/security.js');
const email = `audit-${randomUUID()}@example.test`,
  password = randomBytes(32).toString('base64url');
const account = await db.admin.create({ data: { email, passwordHash: await hash(password) } });
const server = spawn(process.execPath, ['/app/apps/api/dist/main.js'], {
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
for (const stream of [server.stdout, server.stderr])
  stream.on('data', (bytes) => {
    logs = (logs + bytes).slice(-8000);
  });
const root = 'http://127.0.0.1:3001/api/v1';
let sequence = 0;
const request = (path, method = 'GET', body, headers = {}) =>
  fetch(root + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-studio-request': '1',
      'x-forwarded-for': `203.0.113.${++sequence}`,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const check = async (response, expected) => {
  assert.equal(response.status, expected, await response.clone().text());
  return response;
};
const touched = new Set();
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(root + '/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) throw new Error('Test API exited: ' + logs);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Test API did not start');
  const atomicKey = 'security-atomic:' + randomUUID();
  touched.add(atomicKey);
  const concurrent = await Promise.allSettled(
    Array.from({ length: 20 }, () => consumeLimit(redis, atomicKey, 10, 60)),
  );
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 10);
  assert.ok((await redis.ttl(atomicKey)) > 0);
  let releaseChecks;
  const gate = new Promise((resolve) => {
    releaseChecks = resolve;
  });
  const running = Array.from({ length: 4 }, () => passwordCheck(() => gate));
  try {
    await assert.rejects(
      () => passwordCheck(async () => true),
      (error) => error.getStatus() === 429,
    );
  } finally {
    releaseChecks();
    await Promise.all(running);
  }
  await assert.rejects(() =>
    passwordCheck(async () => {
      throw new Error('test verification failed');
    }),
  );
  assert.equal(await passwordCheck(async () => true), true);
  assert.equal(
    accountLimitKey('  TEST@EXAMPLE.TEST ', 'key'),
    accountLimitKey('test@example.test', 'key'),
  );
  assert.ok(!accountLimitKey(email, 'key').includes(email));
  for (const route of ['/projects', '/settings', '/jobs', '/diagnostics', '/launcher/builds'])
    await check(await request(route), 401);
  await check(
    await request('/projects', 'GET', undefined, { cookie: '__Host-studio_session=forged' }),
    401,
  );
  await check(
    await request(
      '/auth/login',
      'POST',
      { email, password },
      { origin: 'https://attacker.invalid' },
    ),
    403,
  );
  await check(
    await request('/auth/login', 'POST', { email, password }, { 'x-studio-request': '' }),
    403,
  );
  await check(await request('/auth/login', 'POST', { email: { $ne: null }, password }), 400);
  await check(await request('/auth/login', 'POST', { email: "' OR 1=1 --", password }), 400);
  const unknown = `missing-${randomUUID()}@example.test`;
  const unknownResponse = await check(
    await request('/auth/login', 'POST', { email: unknown, password: 'wrong' }),
    401,
  );
  const wrongResponse = await check(
    await request('/auth/login', 'POST', { email, password: 'wrong' }),
    401,
  );
  assert.deepEqual(await unknownResponse.json(), await wrongResponse.json());
  const login = await check(await request('/auth/login', 'POST', { email, password }), 201);
  const cookieHeader = login.headers.get('set-cookie');
  assert.ok(cookieHeader.startsWith('__Host-studio_session='));
  assert.match(cookieHeader, /HttpOnly/i);
  assert.match(cookieHeader, /Secure/i);
  assert.match(cookieHeader, /SameSite=Strict/i);
  assert.equal(login.headers.get('cache-control'), 'no-store');
  const cookie = cookieHeader.split(';')[0];
  await check(await request('/auth/me', 'GET', undefined, { cookie }), 200);
  await check(await request('/projects/%27%20OR%201%3D1', 'GET', undefined, { cookie }), 400);
  await check(
    await request(
      '/imports',
      'POST',
      { provider: 'local', uploadKey: 'uploads/../../secret' },
      { cookie },
    ),
    400,
  );
  await check(await request('/projects/invalid/files', 'POST', undefined, { cookie }), 400);
  await check(await request('/auth/logout', 'POST', {}, { cookie }), 201);
  await check(await request('/auth/me', 'GET', undefined, { cookie }), 401);
  const attacked = `bruteforce-${randomUUID()}@example.test`;
  for (let i = 0; i < 10; i++)
    await check(
      await request('/auth/login', 'POST', {
        email: i % 2 ? attacked.toUpperCase() : attacked,
        password: 'wrong',
      }),
      401,
    );
  const blocked = await check(
    await request('/auth/login', 'POST', { email: attacked, password: 'wrong' }),
    429,
  );
  assert.ok(Number(blocked.headers.get('retry-after')) > 0, 'Missing retry guidance');
  assert.ok((await redis.ttl(accountLimitKey(attacked, process.env.SESSION_SECRET))) > 0);
  const globalKey = 'security-global:' + randomUUID();
  touched.add(globalKey);
  for (let i = 0; i < 60; i++) await consumeLimit(redis, globalKey, 60, 60);
  await assert.rejects(
    () => consumeLimit(redis, globalKey, 60, 60),
    (error) => error.getStatus() === 429,
  );
  assert.equal(await db.admin.count(), 1);
  const build = await db.build.create({
    data: {
      status: 'ready',
      storageKey: 'test-fixture/not-an-apk',
      sha256: 'a'.repeat(64),
      versionCode: 123,
      jobId: randomUUID(),
    },
  });
  try {
    const latest = await (await check(await request('/public/launcher/version'), 200)).json();
    assert.equal(latest.versionCode, 123);
    assert.equal(latest.minimumVersionCode, 123);
    assert.equal(latest.sha256, 'a'.repeat(64));
    assert.equal(new URL(latest.url).protocol, 'https:');
    assert.equal(new URL(latest.url).hostname, latest.downloadHost);
    assert.ok(!JSON.stringify(latest).includes(process.env.SESSION_SECRET));
  } finally {
    await db.build.delete({ where: { id: build.id } });
  }
  console.log(
    'PASS: isolated security audit: account throttling across forged IPs/case changes, global/atomic limits, generic errors, secure cookies, forged sessions, CSRF, SQL/NoSQL input, private routes, logout and no credential caching.',
  );
} finally {
  server.kill('SIGTERM');
  await new Promise((resolve) =>
    server.exitCode !== null ? resolve() : server.once('exit', resolve),
  );
  await db.admin.delete({ where: { id: account.id } });
  for (const key of await redis.keys('*')) {
    if (
      key.startsWith('limit:203.0.113.') ||
      key === 'limit:::ffff:127.0.0.1:request' ||
      key === 'login-global' ||
      key.startsWith('login-account:') ||
      touched.has(key)
    )
      await redis.del(key);
  }
  await closeInfra();
}
