import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = 'https://pojav.davidhenrique.dev.br/api/v1';
const credentials = JSON.parse(await readFile('.data/secrets/initial-admin.json', 'utf8'));
const login = await fetch(base + '/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-studio-request': '1',
    Origin: 'https://pojav.davidhenrique.dev.br',
  },
  body: JSON.stringify(credentials),
});
if (login.status !== 201) throw new Error('Login failed ' + login.status);
const cookie = login.headers.get('set-cookie').split(';')[0];
const request = async (path, method = 'GET') => {
  const response = await fetch(base + path, {
    method,
    headers: {
      cookie,
      'x-studio-request': '1',
      'Content-Type': 'application/json',
      Origin: 'https://pojav.davidhenrique.dev.br',
    },
    body: method === 'POST' ? '{}' : undefined,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body;
};
const settings = await request('/settings');
if (!settings.buildEnabled) throw new Error('Builds are not enabled');
let job = await request('/launcher/builds', 'POST');
await writeFile('.data/launcher-job.json', JSON.stringify({ id: job.id }));
console.log('Build queued through public API: ' + job.id);
let previous = '';
for (let i = 0; i < 180; i++) {
  job = await request('/jobs/' + job.id);
  if (job.status !== previous) {
    console.log(job.status + ': ' + job.progress.message);
    previous = job.status;
  }
  if (['ready', 'failed', 'cancelled'].includes(job.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (job.status !== 'ready') throw new Error(job.error ?? 'Build did not finish');
const descriptor = await request('/builds/' + job.result.buildId + '/download');
const response = await fetch(descriptor.url);
if (!response.ok) throw new Error('APK download failed ' + response.status);
const bytes = Buffer.from(await response.arrayBuffer());
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== job.result.sha256) throw new Error('APK SHA-256 mismatch');
const builds = await request('/launcher/builds');
const build = builds.find((entry) => entry.id === job.result.buildId);
if (!build) throw new Error('Completed build not found');
await writeFile(`artifacts/pojav-studio-${build.versionCode}.apk`, bytes);
console.log(
  'PASS: global APK build through API, BullMQ worker, download via Cloudflare and SHA-256 ' +
    sha256,
);
