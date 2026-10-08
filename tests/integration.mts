// Explicit local integration test. Temporary database records are removed at the end.
import { randomUUID, createHash } from 'node:crypto';
import { hash } from 'argon2';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { db, closeInfra } from '../apps/api/src/infra.js';
const email = `smoke-${randomUUID()}@example.test`,
  password = randomUUID() + randomUUID();
const admin = await db.admin.create({ data: { email, passwordHash: await hash(password) } });
let cookie = '',
  projectId: string | undefined,
  reportId: string | undefined,
  jobId: string | undefined;
const call = async (path: string, method = 'GET', body?: unknown, expected = 200) => {
  const response = await fetch(`http://localhost:3000/api/v1${path}`, {
    method,
    headers: {
      'x-studio-request': '1',
      ...(cookie ? { cookie } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (path === '/auth/login') cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
};
try {
  await call('/projects', 'GET', undefined, 401);
  await call('/auth/login', 'POST', { email, password }, 201);
  const form = new FormData();
  form.append('file', new Blob([await readFile('.data/smoke.mrpack')]), 'smoke.mrpack');
  const queued = await call('/imports/upload', 'POST', form, 202);
  jobId = queued.id;
  let job = queued;
  for (let i = 0; i < 40 && !['ready', 'failed'].includes(job.status); i++) {
    await new Promise((r) => setTimeout(r, 500));
    job = await call(`/jobs/${jobId}`);
  }
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.bundle.files.length, 2);
  assert.equal(job.result.bundle.performance.enabled, false);
  assert.ok(job.result.bundle.files.every((f: any) => f.status === 'resolved'));
  const project = await call(`/jobs/${jobId}/commit`, 'POST', { name: 'SMOKE TEMPORÁRIO' }, 201);
  projectId = project.id;
  await call(`/jobs/${jobId}/commit`, 'POST', { name: 'duplicate' }, 400);
  const detail = await call(`/projects/${projectId}`);
  assert.equal(detail.draft.files.length, 2);
  await call(`/projects/${projectId}`, 'PATCH', { revision: 99, name: 'stale' }, 409);
  const exported = await call(`/projects/${projectId}/export`);
  assert.ok(exported.files.every((f: any) => f.storageKey === null));
  // Publication is intentionally blocked until the MC/loader pair is tested on a device.
  await call(
    `/projects/${projectId}/releases`,
    'POST',
    { revision: detail.revision, version: 'test', distributionConfirmed: true },
    400,
  );
  await call('/public/diagnostics', 'POST', { consent: false }, 400);
  const report = await call(
    '/public/diagnostics',
    'POST',
    {
      consent: true,
      projectId,
      kind: 'installation',
      launcherVersion: 'test',
      device: { model: 'test', android: '15' },
      message: 'Smoke test',
      log: 'Bearer abc-secret access_token=secret john@example.com',
    },
    201,
  );
  reportId = report.id;
  const reports = await call('/diagnostics');
  const found = reports.find((r: any) => r.id === reportId);
  assert.ok(found);
  assert.ok(!found.log.includes('abc-secret'));
  assert.ok(!found.log.includes('john@example.com'));
  await call(`/diagnostics/${reportId}`, 'PATCH', { status: 'resolved' });
  const catalog = await call('/catalog/modpacks?provider=modrinth&query=Cobblemon&limit=2');
  assert.ok(catalog.items.length > 0, JSON.stringify(catalog.issues));
  assert.ok(catalog.items.every((p: any) => p.provider === 'modrinth'));
  assert.ok(catalog.nextCursor);
  const second = await call(
    `/catalog/modpacks?provider=modrinth&query=Cobblemon&limit=2&cursor=${encodeURIComponent(catalog.nextCursor)}`,
  );
  assert.ok(
    second.items.every(
      (p: any) => !catalog.items.some((x: any) => x.externalProjectId === p.externalProjectId),
    ),
  );
  console.log(
    'PASS: autenticação, upload MRPACK, BullMQ, S3, commit único, revisão otimista, exportação segura, bloqueio de publicação não homologada, consentimento/redação, catálogo Modrinth real e paginação.',
  );
} finally {
  if (reportId) await db.diagnosticReport.deleteMany({ where: { id: reportId } });
  if (jobId) await db.job.deleteMany({ where: { id: jobId } });
  if (projectId) {
    await db.audit.deleteMany({ where: { entityId: projectId } });
    await db.project.deleteMany({ where: { id: projectId } });
  }
  await db.admin.delete({ where: { id: admin.id } });
  await closeInfra();
}
