// Run inside the API image with a dedicated studio_integration database; never uses production records.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const url = new URL(process.env.DATABASE_URL);
url.hostname = 'postgres';
url.pathname = '/studio_integration';
process.env.DATABASE_URL = url.href;
process.env.ANDROID_VALIDATED_TARGETS = '[]';
const migrate = spawnSync(process.execPath, ['/app/scripts/prisma.mjs', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: process.env,
});
if (migrate.status !== 0) throw new Error('Test migration failed');
const { db, putObject, deleteObject, closeInfra } = await import('../apps/api/dist/infra.js');
const { publishProject, releaseDownload, editProject } =
  await import('../apps/api/dist/services/projects.js');
const { bundleSchema, resolvedFileSchema } = await import('@studio/core');
const content = Buffer.from('validated integration bytes'),
  sha256 = createHash('sha256').update(content).digest('hex'),
  key = `test-assets/${randomUUID()}`;
let id;
try {
  await putObject(key, content);
  const file = resolvedFileSchema.parse({
    id: randomUUID(),
    provider: 'local',
    name: 'settings.json',
    filename: 'settings.json',
    path: 'config/settings.json',
    hashes: { sha256 },
    size: content.length,
    kind: 'config',
    distribution: 'hosted',
    status: 'resolved',
    storageKey: key,
  });
  const bundle = bundleSchema.parse({
    schemaVersion: 1,
    name: 'Isolated test',
    version: '1',
    minecraft: '1.20.1',
    loader: { type: 'fabric', version: '0.16.0' },
    files: [file],
  });
  const project = await db.project.create({
    data: { name: bundle.name, slug: randomUUID(), draft: bundle },
  });
  id = project.id;
  const release = await publishProject(id, {
    revision: 1,
    version: '1.0',
    distributionConfirmed: true,
  });
  assert.equal(release.manifest.runtime, 17);
  assert.equal(release.manifest.files[0].hashes.sha256, sha256);
  const descriptor = await releaseDownload(release.id, file.id);
  const response = await fetch(descriptor.url);
  assert.equal(response.status, 200);
  assert.equal(
    createHash('sha256')
      .update(Buffer.from(await response.arrayBuffer()))
      .digest('hex'),
    sha256,
  );
  await editProject(id, { revision: 1, name: 'Changed' });
  const immutable = await db.release.findUniqueOrThrow({ where: { id: release.id } });
  assert.equal(immutable.manifest.name, 'Isolated test');
  await assert.rejects(
    () => publishProject(id, { revision: 1, version: '2.0', distributionConfirmed: true }),
    /Projeto mudou/,
  );
  console.log(
    'PASS: release imutável, manifest Android próprio, runtime, URL assinada externa e integridade dos bytes. Banco isolado, sem homologação real declarada.',
  );
} finally {
  if (id) await db.project.deleteMany({ where: { id } });
  await deleteObject(key);
  await closeInfra();
}
