// Register the initial APK produced and verified outside the background worker.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const database = new URL(process.env.DATABASE_URL);
database.hostname = 'postgres';
process.env.DATABASE_URL = database.href;
process.env.STORAGE_ENDPOINT = 'http://storage:9000';
process.env.REDIS_URL = 'redis://redis:6379';
const { db, putObject, closeInfra } = await import('../apps/api/dist/infra.js');
const bytes = await readFile('/artifacts/pojav-studio-1.apk'),
  sha256 = createHash('sha256').update(bytes).digest('hex');
try {
  if (await db.build.findFirst({ where: { sha256, status: 'ready' } })) {
    console.log('APK already registered.');
    process.exitCode = 0;
  } else {
    const storageKey = await putObject(
      'apks/pojav-studio-1.apk',
      bytes,
      'application/vnd.android.package-archive',
    );
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(730041)`;
      if (await tx.build.count())
        throw new Error('Version code 1 is only valid for the first APK.');
      const job = await tx.job.create({
        data: {
          kind: 'build',
          status: 'ready',
          input: { versionCode: 1, initialValidation: 'Gradle assembleRelease and apksigner v2' },
          progress: {
            stage: 'ready',
            completed: 1,
            total: 1,
            message: 'Launcher compilado e assinatura verificada',
          },
        },
      });
      const build = await tx.build.create({
        data: { jobId: job.id, versionCode: 1, status: 'ready', storageKey, sha256 },
      });
      await tx.job.update({
        where: { id: job.id },
        data: { result: { buildId: build.id, sha256 } },
      });
      await tx.audit.create({
        data: {
          action: 'register-validated-launcher',
          entityId: build.id,
          detail: { sha256, versionCode: 1 },
        },
      });
    });
    console.log('Registered verified APK versionCode 1, SHA-256 ' + sha256);
  }
} finally {
  await closeInfra();
}
