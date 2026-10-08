import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  session: vi.fn(),
  sessionCreate: vi.fn(),
  sessionDelete: vi.fn(),
  profile: vi.fn(),
  count: vi.fn(),
  update: vi.fn(),
  release: vi.fn(),
  playerUpdate: vi.fn(),
  playerFind: vi.fn(),
  eval: vi.fn(),
  queue: vi.fn(),
  upsert: vi.fn(),
  lookup: vi.fn(),
  details: vi.fn(),
}));
vi.mock('../apps/api/src/config.js', () => ({
  env: { SESSION_SECRET: 'test-player-secret-with-enough-length' },
}));
vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('hash'),
  verify: vi.fn().mockResolvedValue(true),
}));
vi.mock('../apps/api/src/infra.js', () => ({
  db: {
    $transaction: (work: any) =>
      work({
        player: { updateMany: m.playerUpdate, findUniqueOrThrow: m.playerFind },
        playerSession: { deleteMany: m.sessionDelete },
      }),
    playerSession: { findUnique: m.session, create: m.sessionCreate, deleteMany: m.sessionDelete },
    playerProfile: {
      findFirst: m.profile,
      count: m.count,
      updateMany: m.update,
      findUnique: m.lookup,
      upsert: m.upsert,
    },
    player: { update: m.playerUpdate },
    release: { findUnique: m.release },
  },
  redis: { eval: m.eval },
}));
vi.mock('../apps/api/src/services/jobs.js', () => ({
  queueImport: m.queue,
  json: (v: unknown) => v,
}));
vi.mock('../apps/api/src/services/projects.js', () => ({
  commitImport: vi.fn(),
  publishProject: vi.fn(),
}));
vi.mock('../apps/api/src/providers/registry.js', () => ({
  providers: { modrinth: { getModpack: m.details }, curseforge: { getModpack: m.details } },
}));
import {
  requirePlayer,
  personalProfile,
  accessRelease,
  updateProfile,
  profileSettings,
  registerPlayer,
  createProfile,
} from '../apps/api/src/services/players.js';
const req = () =>
  ({ headers: { authorization: 'Bearer ' + 'a'.repeat(43) }, ip: 'test-ip' }) as any;
beforeEach(() => {
  vi.resetAllMocks();
  m.eval.mockResolvedValue([1, 60]);
  m.session.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60000),
    player: { id: 'player-a', email: null, name: 'Guest' },
  });
  m.count.mockResolvedValue(0);
});
it('rejects missing or malformed bearer tokens and ignores administrator cookies', async () => {
  await expect(
    requirePlayer({ headers: {}, cookies: { studio_session: 'admin' } } as any),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    requirePlayer({ headers: { authorization: 'Bearer x' } } as any),
  ).rejects.toMatchObject({ status: 401 });
  expect(m.session).not.toHaveBeenCalled();
});
it('rejects expired sessions', async () => {
  m.session.mockResolvedValue({ expiresAt: new Date(0) });
  await expect(requirePlayer(req())).rejects.toMatchObject({ status: 401 });
});
it('scopes profile lookup to the current player', async () => {
  m.profile.mockResolvedValue(null);
  await expect(personalProfile('player-a', 'foreign-profile')).rejects.toMatchObject({
    status: 404,
  });
  expect(m.profile).toHaveBeenCalledWith({
    where: { id: 'foreign-profile', playerId: 'player-a' },
  });
});
it('prevents another player reading private releases', async () => {
  m.release.mockResolvedValue({ projectId: 'private-project', project: { personal: true } });
  await expect(accessRelease(req(), 'release')).rejects.toMatchObject({ status: 404 });
  expect(m.count).toHaveBeenCalledWith({
    where: { playerId: 'player-a', projectId: 'private-project' },
  });
});
it('allows the owner to read their private release', async () => {
  m.release.mockResolvedValue({ projectId: 'private-project', project: { personal: true } });
  m.count.mockResolvedValue(1);
  expect(await accessRelease(req(), 'release')).toHaveProperty('projectId', 'private-project');
});
it('preserves public legacy releases without requiring a player login', async () => {
  m.release.mockResolvedValue({ project: { personal: false } });
  await accessRelease({ headers: {} } as any, 'public-release');
  expect(m.session).not.toHaveBeenCalled();
});
it('prevents settings overwrites after another device changed the revision', async () => {
  m.profile.mockResolvedValue({ id: 'profile' });
  m.update.mockResolvedValue({ count: 0 });
  await expect(
    updateProfile(req(), 'profile', { revision: 1, name: 'Mine', favorite: false, settings: {} }),
  ).rejects.toMatchObject({ status: 409 });
  expect(m.update.mock.calls[0][0].where).toEqual({
    id: 'profile',
    playerId: 'player-a',
    revision: 1,
  });
});
it('stores only typed configuration instead of arbitrary account or game data', () => {
  expect(
    profileSettings.parse({ password: 'secret', world: '/data/other', performanceMode: 'light' }),
  ).toEqual({ performanceMode: 'light', touchMode: 'auto' });
  expect(() => profileSettings.parse({ performanceMode: 'hacked' })).toThrow();
});
it('upgrades a guest in place and invalidates its old bearer sessions', async () => {
  m.playerUpdate.mockResolvedValue({ count: 1 });
  m.playerFind.mockResolvedValue({ id: 'player-a', email: 'user@example.test', name: 'User' });
  const response = await registerPlayer(req(), {
    email: 'USER@example.test',
    password: 'test-password-123',
    name: 'User',
  });
  expect(m.playerUpdate.mock.calls[0][0].where).toEqual({ id: 'player-a', email: null });
  expect(m.sessionDelete).toHaveBeenCalledWith({ where: { playerId: 'player-a' } });
  expect(response.player.id).toBe('player-a');
  expect(response).not.toHaveProperty('password');
});
it('does not accept local project IDs or operations through the external import API', async () => {
  await expect(
    createProfile(req(), { provider: 'local', projectId: 'private', versionId: 'version' }),
  ).rejects.toThrow();
  expect(m.queue).not.toHaveBeenCalled();
});
it('prevents a stale guest registration from changing an account upgraded concurrently', async () => {
  m.playerUpdate.mockResolvedValue({ count: 0 });
  await expect(
    registerPlayer(req(), {
      email: 'other@example.test',
      password: 'test-password-123',
      name: 'Other',
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(m.sessionDelete).not.toHaveBeenCalled();
  expect(m.sessionCreate).not.toHaveBeenCalled();
});
it('queues metadata-only personal imports with no client-supplied target project', async () => {
  m.lookup.mockResolvedValue(null);
  m.details.mockResolvedValue({ name: 'Pack', icon: null });
  m.upsert.mockResolvedValue({ id: 'profile', jobId: null });
  m.profile.mockResolvedValue({ id: 'profile', projectId: null, jobId: null });
  await createProfile(req(), {
    provider: 'modrinth',
    projectId: 'pack',
    versionId: 'version',
    targetProjectId: 'foreign',
    operation: 'add-mod',
    verifyDownloads: true,
  });
  expect(m.queue).toHaveBeenCalledWith(
    {
      provider: 'modrinth',
      projectId: 'pack',
      versionId: 'version',
      operation: 'prepare',
      verifyDownloads: false,
    },
    'profile',
  );
});
