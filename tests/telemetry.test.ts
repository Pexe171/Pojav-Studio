import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  releases: vi.fn(),
  projects: vi.fn(),
  eval: vi.fn(),
}));
vi.mock('../apps/api/src/config.js', () => ({
  env: { SESSION_SECRET: 'isolated-telemetry-test-secret' },
}));
vi.mock('../apps/api/src/infra.js', () => ({
  db: {
    telemetryEvent: { createMany: mocks.createMany },
    release: { findMany: mocks.releases },
    project: { count: mocks.projects },
  },
  redis: { eval: mocks.eval },
  imports: {},
  builds: {},
}));
import {
  submitTelemetry,
  telemetryDeviceKey,
  telemetrySchema,
} from '../apps/api/src/services/telemetry.js';
it('retains server storage bounds with weighted daily limits', async () => {
  await submitTelemetry(batch());
  expect(
    mocks.eval.mock.calls.some(
      (call) => call[2] === 'telemetry-global-bytes-day' && Number(call[4]) > 100,
    ),
  ).toBe(true);
  mocks.eval.mockResolvedValue([999999999, 3600]);
  await expect(submitTelemetry(batch())).rejects.toMatchObject({ status: 429 });
});
function batch() {
  return {
    consent: true,
    deviceId: randomUUID(),
    device: { model: 'Test phone', android: '12', architecture: 'arm64-v8a' },
    events: [
      {
        id: randomUUID(),
        sessionId: randomUUID(),
        kind: 'game-log',
        launcherVersion: '1.0.10',
        occurredAt: new Date().toISOString(),
        data: { message: 'password=secret' },
        log: 'Bearer abcdefgh123 email@example.test',
      },
    ],
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.eval.mockResolvedValue([1, 3600]);
  mocks.releases.mockResolvedValue([]);
  mocks.projects.mockResolvedValue(0);
  mocks.createMany.mockResolvedValue({ count: 1 });
});
it('requires explicit consent', () => {
  expect(() => telemetrySchema.parse({ ...batch(), consent: false })).toThrow();
});
it('bounds batches and log size', () => {
  const b = batch();
  expect(() =>
    telemetrySchema.parse({ ...b, events: Array.from({ length: 11 }, () => b.events[0]) }),
  ).toThrow();
  expect(() =>
    telemetrySchema.parse({ ...b, events: [{ ...b.events[0], log: 'x'.repeat(16385) }] }),
  ).toThrow();
});
it('uses a stable pseudonym and strips credentials before persistence', async () => {
  const b = batch();
  await submitTelemetry(b);
  const row = mocks.createMany.mock.calls[0][0].data[0];
  expect(row.deviceKey).toBe(telemetryDeviceKey(b.deviceId));
  expect(row.deviceKey).not.toBe(b.deviceId);
  expect(row.log).not.toContain('abcdefgh123');
  expect(row.log).not.toContain('email@example.test');
  expect(row.data.message).not.toContain('secret');
  expect(row).not.toHaveProperty('deviceId');
});
it('acknowledges replayed UUIDs without overwriting events', async () => {
  const b = batch();
  mocks.createMany.mockResolvedValue({ count: 0 });
  expect(await submitTelemetry(b)).toEqual({ accepted: [b.events[0].id] });
  expect(mocks.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
});
it('rejects a release belonging to another modpack', async () => {
  const b = batch();
  mocks.releases.mockResolvedValue([{ id: 'release', projectId: 'other' }]);
  await expect(
    submitTelemetry({
      ...b,
      events: [{ ...b.events[0], projectId: 'pack', releaseId: 'release' }],
    }),
  ).rejects.toThrow();
  expect(mocks.createMany).not.toHaveBeenCalled();
});
it('rejects nonexistent modpacks', async () => {
  const b = batch();
  await expect(
    submitTelemetry({ ...b, events: [{ ...b.events[0], projectId: 'missing' }] }),
  ).rejects.toThrow();
  expect(mocks.createMany).not.toHaveBeenCalled();
});
it('rejects expired dates before writing', async () => {
  const b = batch();
  await expect(
    submitTelemetry({
      ...b,
      events: [{ ...b.events[0], occurredAt: new Date(Date.now() - 31 * 86400000).toISOString() }],
    }),
  ).rejects.toThrow();
  expect(mocks.createMany).not.toHaveBeenCalled();
});
it('accepts offline events from the previous week', async () => {
  const b = batch();
  await submitTelemetry({
    ...b,
    events: [{ ...b.events[0], occurredAt: new Date(Date.now() - 6 * 86400000).toISOString() }],
  });
  expect(mocks.createMany).toHaveBeenCalled();
});
it('rejects SQL-shaped identifiers and ignores unexpected sensitive fields', () => {
  const b = batch();
  expect(() =>
    telemetrySchema.parse({ ...b, events: [{ ...b.events[0], projectId: "' OR 1=1--" }] }),
  ).toThrow();
  expect(telemetrySchema.parse({ ...b, accountEmail: 'private@example.test' })).not.toHaveProperty(
    'accountEmail',
  );
});
