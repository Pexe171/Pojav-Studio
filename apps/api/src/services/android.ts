import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile, rm, access, readdir } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BadRequestException } from '@nestjs/common';
import { env } from '../config.js';
import { db, builds, putObject } from '../infra.js';
import { json } from './jobs.js';
const studioRoot = fileURLToPath(new URL('../../../../', import.meta.url));
export async function queueLauncherBuild() {
  if (!env.BUILD_ENABLED)
    throw new BadRequestException('Habilite o worker Android antes de gerar o launcher');
  const result = await db.$transaction(async (tx) => {
    // Database advisory lock serializes versionCode allocation across administrators.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(730041)`;
    const previous = await tx.build.aggregate({ _max: { versionCode: true } });
    const versionCode = (previous._max.versionCode ?? 0) + 1;
    const job = await tx.job.create({
      data: {
        kind: 'build',
        input: json({ versionCode }),
        progress: json({
          stage: 'queued',
          completed: 0,
          total: 1,
          message: 'Launcher aguardando build',
        }),
      },
    });
    await tx.build.create({ data: { jobId: job.id, versionCode } });
    return job;
  });
  await builds.add(
    'build',
    { id: result.id },
    { jobId: result.id, attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
  );
  return result;
}
async function gradle(cwd: string, jobId: string) {
  const childEnv = { ...process.env };
  delete childEnv.CURSEFORGE_API_KEY;
  delete childEnv.GPLAY_KEYSTORE_PASSWORD;
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
      ['--no-daemon', ':app_pojavlauncher:assembleRelease'],
      { cwd, env: childEnv, shell: false, detached: process.platform !== 'win32' },
    );
    let tail = '';
    let stopped = false;
    const terminate = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {}
    };
    const timer = setInterval(() => {
      void db.job
        .findUnique({ where: { id: jobId } })
        .then((job) => {
          if (job?.cancelRequested && !stopped) {
            stopped = true;
            terminate('SIGTERM');
          }
        })
        .catch(() => {});
    }, 2000);
    const timeout = setTimeout(() => {
      stopped = true;
      terminate('SIGTERM');
    }, 45 * 60000);
    const force = setTimeout(() => {
      if (stopped) terminate('SIGKILL');
    }, 46 * 60000);
    for (const stream of [child.stdout, child.stderr])
      stream?.on('data', (data: Buffer) => {
        tail = (tail + data.toString()).slice(-20000);
      });
    child.on('error', (error) => {
      clearInterval(timer);
      clearTimeout(timeout);
      clearTimeout(force);
      reject(error);
    });
    child.on('exit', (code) => {
      clearInterval(timer);
      clearTimeout(timeout);
      clearTimeout(force);
      code === 0
        ? resolvePromise()
        : reject(
            new Error(
              stopped
                ? 'Build cancelado ou excedeu o tempo'
                : `Gradle falhou (${code}): ${tail.slice(-3000)}`,
            ),
          );
    });
  });
}
export async function processBuild(jobId: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } }),
    build = await db.build.findUniqueOrThrow({ where: { jobId } });
  if (job.status === 'ready') return job.result;
  const root = resolve(env.BUILD_ROOT),
    directory = resolve(root, jobId);
  if (!directory.startsWith(root + sep)) throw new Error('Diretório de build inválido');
  try {
    if (job.cancelRequested) throw new Error('Build cancelado');
    if (!env.PUBLIC_API_URL.startsWith('https://') && env.NODE_ENV === 'production')
      throw new Error('Launcher de produção exige HTTPS');
    await access(env.APK_KEYSTORE_PATH);
    if (!env.APK_KEYSTORE_PASSWORD) throw new Error('Senha do keystore não configurada');
    const lock = JSON.parse(
      await readFile(join(studioRoot, 'integrations/amethyst/launcher.lock.json'), 'utf8'),
    ) as { commit: string };
    const marker = await readFile(join(env.LAUNCHER_SOURCE, 'studio-source-commit'), 'utf8');
    if (marker.trim() !== lock.commit) throw new Error('Fonte Android não corresponde ao lock');
    await db.build.update({ where: { id: build.id }, data: { status: 'building' } });
    await db.job.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        progress: json({
          stage: 'building',
          completed: 0,
          total: 1,
          message: 'Compilando launcher único',
        }),
      },
    });
    await mkdir(directory, { recursive: true });
    await cp(env.LAUNCHER_SOURCE, directory, {
      recursive: true,
      filter: (source) =>
        !relative(env.LAUNCHER_SOURCE, source)
          .split(sep)
          .some((x) => x === '.git' || x === 'build' || x === '.gradle'),
    });
    const { applyOverlay } = (await import(join(studioRoot, 'scripts/launcher-overlay.mjs'))) as {
      applyOverlay: (directory: string, config: unknown) => Promise<void>;
    };
    await applyOverlay(directory, {
      apiUrl: env.PUBLIC_API_URL,
      applicationId: env.LAUNCHER_APPLICATION_ID,
      name: env.LAUNCHER_NAME,
      versionCode: build.versionCode,
      versionName: `1.0.${build.versionCode}`,
      keystore: env.APK_KEYSTORE_PATH,
      keyAlias: env.APK_KEY_ALIAS,
    });
    await gradle(directory, jobId);
    const apkFolder = join(directory, 'app_pojavlauncher/build/outputs/apk/release');
    const apkName = (await readdir(apkFolder)).find((n) => n.endsWith('.apk'));
    if (!apkName) throw new Error('Gradle não produziu APK');
    const bytes = await readFile(join(apkFolder, apkName));
    const storageKey = await putObject(
      `apks/pojav-studio-${build.versionCode}.apk`,
      bytes,
      'application/vnd.android.package-archive',
    );
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await db.build.update({
      where: { id: build.id },
      data: { status: 'ready', storageKey, sha256 },
    });
    await db.job.update({
      where: { id: jobId },
      data: {
        status: 'ready',
        result: json({ buildId: build.id, sha256 }),
        progress: json({
          stage: 'ready',
          completed: 1,
          total: 1,
          message: 'Launcher pronto para baixar',
        }),
      },
    });
    return { buildId: build.id, sha256 };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no build';
    await db.build.update({ where: { id: build.id }, data: { status: 'failed' } });
    await db.job.update({
      where: { id: jobId },
      data: {
        status: message.includes('cancelado') ? 'cancelled' : 'failed',
        error: message,
        progress: json({ stage: 'failed', completed: 0, total: 1, message }),
      },
    });
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
