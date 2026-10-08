// Run inside the API container. Fixtures are private and removed in finally.
import { createRequire } from 'node:module';
import { randomUUID, randomBytes } from 'node:crypto';
const require = createRequire('/app/apps/api/package.json');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const playerIds = [],
  projectIds = [],
  jobIds = [];
let checks = 0;
const assert = (value, message) => {
  if (!value) throw Error(message);
  checks++;
};
const request = async (path, token, body) => {
  const res = await fetch(
    'http://localhost:3000' + (path.startsWith('/api/v1/') ? path : '/api/v1' + path),
    {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-studio-request': '1',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  let json;
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, json };
};
try {
  const a = (await request('/player/auth/guest', null, {})).json,
    b = (await request('/player/auth/guest', null, {})).json;
  playerIds.push(a.player.id, b.player.id);
  assert(a.player.guest && b.player.guest, 'Guest sessions');
  const source = await db.release.findFirstOrThrow({ where: { project: { personal: false } } });
  const bundle = structuredClone(source.bundle);
  bundle.files = bundle.files
    .filter((f) => f.provider === 'modrinth' && f.distribution === 'origin')
    .slice(0, 1);
  bundle.warnings = [];
  assert(bundle.files.length === 1, 'Published fixture source');
  const profile = await db.playerProfile.create({
    data: {
      playerId: a.player.id,
      provider: 'modrinth',
      externalProjectId: 'fixture-' + randomUUID(),
      externalVersionId: 'fixture-version',
      name: 'Private integration test',
      settings: { performanceMode: 'light', touchMode: 'auto' },
    },
  });
  const job = await db.job.create({
    data: {
      kind: 'prepare',
      status: 'ready',
      input: {
        provider: 'modrinth',
        projectId: profile.externalProjectId,
        versionId: profile.externalVersionId,
        operation: 'prepare',
        verifyDownloads: false,
      },
      progress: { stage: 'ready', completed: 1, total: 1, message: 'fixture' },
      result: { bundle, icon: null, importedFrom: null, optionalFiles: [] },
    },
  });
  jobIds.push(job.id);
  await db.playerProfile.update({ where: { id: profile.id }, data: { jobId: job.id } });
  assert(
    (await request('/player/profiles/' + profile.id, b.token)).status === 404,
    'Cross-user profile read',
  );
  assert(
    (
      await request('/player/profiles/' + profile.id + '/settings', b.token, {
        revision: 1,
        name: 'stolen',
        favorite: true,
        settings: {},
      })
    ).status === 404,
    'Cross-user profile write',
  );
  const installed = await Promise.all([
    request('/player/profiles/' + profile.id + '/install', a.token, {}),
    request('/player/profiles/' + profile.id + '/install', a.token, {}),
  ]);
  assert(
    installed.every((r) => r.status === 201),
    'Idempotent concurrent installation',
  );
  const card = installed[0].json.card;
  projectIds.push(card.id);
  assert(
    (await db.project.findUniqueOrThrow({ where: { id: card.id } })).personal,
    'Private project from creation',
  );
  assert(
    (await db.release.count({ where: { projectId: card.id } })) === 1,
    'No duplicated release',
  );
  assert((await request(card.manifestEndpoint, a.token)).status === 200, 'Owner manifest');
  assert((await request(card.manifestEndpoint, b.token)).status === 404, 'Foreign manifest');
  assert((await request(card.manifestEndpoint, null)).status === 401, 'Anonymous manifest');
  assert(
    (await request('/public/projects/' + card.id + '/latest', b.token)).status === 404,
    'Foreign latest',
  );
  const manifest = (await request(card.manifestEndpoint, a.token)).json,
    file = manifest.files[0];
  assert((await request(file.downloadEndpoint, b.token)).status === 404, 'Foreign file URL');
  assert(
    (
      await request('/public/releases/' + card.releaseId + '/downloads', b.token, {
        fileIds: [file.id],
      })
    ).status === 404,
    'Foreign batch URLs',
  );
  assert(
    !(await request('/public/catalog')).json.items.some((p) => p.id === card.id),
    'Private project excluded from published catalog',
  );
  const query = '__studio_private_fixture__';
  const cursor = Buffer.from(
    JSON.stringify({
      signature: JSON.stringify([true, query, null, null, null, 'popular', 'all', 'modpack', 12]),
      offsets: { modrinth: -1, curseforge: -1, local: -1 },
      buffer: [{ provider: 'local', externalProjectId: card.id }],
    }),
  ).toString('base64url');
  const discovery = await request(
    '/public/discover/modpacks?query=' + query + '&limit=12&cursor=' + cursor,
  );
  assert(
    discovery.status === 200 && discovery.json.items.length === 0,
    'Forged cursor cannot expose local private data',
  );
  assert(
    (await request('/projects', a.token)).status === 401,
    'Player cannot access administrator API',
  );
  const edit = {
    revision: 1,
    name: 'My phone profile',
    favorite: true,
    settings: { performanceMode: 'balanced', touchMode: 'hide', password: 'must-not-store' },
  };
  assert(
    (await request('/player/profiles/' + profile.id + '/settings', a.token, edit)).status === 201,
    'Settings save',
  );
  assert(
    (await request('/player/profiles/' + profile.id + '/settings', a.token, edit)).status === 409,
    'Stale-device conflict',
  );
  assert(
    !JSON.stringify(
      (await db.playerProfile.findUniqueOrThrow({ where: { id: profile.id } })).settings,
    ).includes('must-not-store'),
    'Typed settings',
  );
  const email = 'studio-check-' + randomUUID() + '@example.invalid',
    password = randomBytes(24).toString('base64url');
  const registered = await request('/player/auth/register', a.token, {
    email,
    password,
    name: 'Integration fixture',
  });
  assert(
    registered.status === 201 && registered.json.player.id === a.player.id,
    'Guest upgrade preserves profile ownership',
  );
  assert((await request('/player/library', a.token)).status === 401, 'Old guest token revoked');
  const signed = await request('/player/auth/login', null, { email, password });
  assert(signed.status === 201, 'Login on second phone');
  const library = await request('/player/library', signed.json.token);
  assert(
    library.json.profiles.some((p) => p.id === profile.id && p.name === edit.name && p.favorite),
    'Library synchronizes on second login',
  );
  assert(
    !JSON.stringify(library.json).includes(password) &&
      !JSON.stringify(library.json).includes('passwordHash'),
    'No password leakage',
  );
  assert(
    (await request('/player/auth/login', null, { email, password: 'incorrect-password' }))
      .status === 401,
    'Wrong password',
  );
  const changed = await request('/player/auth/password', signed.json.token, {
    currentPassword: password,
    password: randomBytes(24).toString('base64url'),
  });
  assert(changed.status === 201, 'Password change');
  assert(
    (await request('/player/library', signed.json.token)).status === 401,
    'Password change revokes older sessions',
  );
  assert((await request('/player/auth/logout', changed.json.token, {})).status === 201, 'Logout');
  assert(
    (await request('/player/library', changed.json.token)).status === 401,
    'Logout invalidation',
  );
  console.log(
    'PASS: ' +
      checks +
      ' live checks for guest upgrade, private imports, cross-user access, admin isolation, cursor privacy, revision conflicts and second-device login',
  );
} finally {
  const created = await db.job.findMany({
    where: { id: { in: jobIds } },
    select: { projectId: true },
  });
  for (const job of created)
    if (job.projectId && !projectIds.includes(job.projectId)) projectIds.push(job.projectId);
  const releases = await db.release.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true },
  });
  await db.player.deleteMany({ where: { id: { in: playerIds } } });
  await db.audit.deleteMany({
    where: { entityId: { in: [...projectIds, ...jobIds, ...releases.map((r) => r.id)] } },
  });
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.job.deleteMany({ where: { id: { in: jobIds } } });
  await db.$disconnect();
}
