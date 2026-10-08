import { createHmac } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { db, redis } from '../infra.js';
import { env } from '../config.js';
import { consumeLimit } from '../security.js';
import { json } from './jobs.js';
import { redactDiagnostic } from './launcher.js';

const identifier = z
  .string()
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const telemetrySchema = z.object({
  consent: z.literal(true),
  deviceId: z.string().uuid(),
  device: z.object({
    model: z.string().max(100),
    android: z.string().max(30),
    architecture: z.string().max(40),
  }),
  events: z
    .array(
      z.object({
        id: z.string().uuid(),
        sessionId: z.string().uuid(),
        projectId: identifier.optional(),
        releaseId: identifier.optional(),
        kind: z.enum([
          'telemetry-enabled',
          'installation-start',
          'installation-ready',
          'installation-pending',
          'installation-failed',
          'launch-request',
          'game-start',
          'game-exit',
          'game-log',
          'session-interrupted',
        ]),
        launcherVersion: z.string().min(1).max(100),
        occurredAt: z.string().datetime(),
        data: z
          .object({
            durationMs: z.number().int().min(0).max(604800000).optional(),
            exitCode: z.number().int().min(-2147483648).max(2147483647).optional(),
            performanceMode: z.enum(['light', 'balanced', 'original']).optional(),
            message: z.string().max(2000).optional(),
            logBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
          })
          .default({}),
        log: z.string().max(16384).default(''),
      }),
    )
    .min(1)
    .max(10),
});
export function telemetryDeviceKey(deviceId: string) {
  return createHmac('sha256', env.SESSION_SECRET).update(`telemetry:${deviceId}`).digest('hex');
}
export async function submitTelemetry(input: unknown) {
  const batch = telemetrySchema.parse(input);
  const now = Date.now();
  for (const event of batch.events) {
    const time = Date.parse(event.occurredAt);
    if (time < now - 30 * 86400000 || time > now + 86400000)
      throw new BadRequestException('Data do evento fora do período permitido');
    if (event.releaseId && !event.projectId)
      throw new BadRequestException('Release exige modpack no evento');
  }
  const deviceKey = telemetryDeviceKey(batch.deviceId);
  await consumeLimit(redis, `telemetry-device:${deviceKey}`, 60, 3600);
  await consumeLimit(redis, 'telemetry-global', 120, 60);
  await consumeLimit(redis, 'telemetry-global-events-day', 5000, 86400, batch.events.length);
  await consumeLimit(
    redis,
    'telemetry-global-bytes-day',
    16 * 1048576,
    86400,
    Buffer.byteLength(JSON.stringify(batch)),
  );
  const releaseIds = [...new Set(batch.events.flatMap((e) => (e.releaseId ? [e.releaseId] : [])))];
  const releases = await db.release.findMany({
    where: { id: { in: releaseIds } },
    select: { id: true, projectId: true },
  });
  for (const event of batch.events)
    if (
      event.releaseId &&
      !releases.some((r) => r.id === event.releaseId && r.projectId === event.projectId)
    )
      throw new BadRequestException('Release inválida no evento');
  const projects = [...new Set(batch.events.flatMap((e) => (e.projectId ? [e.projectId] : [])))];
  if (
    projects.length &&
    (await db.project.count({ where: { id: { in: projects } } })) !== projects.length
  )
    throw new BadRequestException('Modpack inválido no evento');
  const device = json(
    Object.fromEntries(Object.entries(batch.device).map(([k, v]) => [k, redactDiagnostic(v)])),
  );
  await db.telemetryEvent.createMany({
    skipDuplicates: true,
    data: batch.events.map((e) => ({
      id: e.id,
      deviceKey,
      sessionId: e.sessionId,
      projectId: e.projectId,
      releaseId: e.releaseId,
      kind: e.kind,
      launcherVersion: e.launcherVersion,
      device,
      data: json({
        ...e.data,
        ...(e.data.message ? { message: redactDiagnostic(e.data.message) } : {}),
      }),
      log: redactDiagnostic(e.log),
      occurredAt: new Date(e.occurredAt),
    })),
  });
  // Replayed UUIDs are acknowledged, allowing the client to remove them after a lost response.
  return { accepted: batch.events.map((e) => e.id) };
}
export async function listTelemetry(input: unknown) {
  const q = z
    .object({
      projectId: identifier.optional(),
      deviceKey: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      kind: telemetrySchema.shape.events.element.shape.kind.optional(),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
    })
    .parse(input);
  const where = { projectId: q.projectId, deviceKey: q.deviceKey, kind: q.kind };
  const [events, total, devices] = await Promise.all([
    db.telemetryEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      skip: q.offset,
      take: 25,
    }),
    db.telemetryEvent.count({ where }),
    db.telemetryEvent.groupBy({
      by: ['deviceKey'],
      where,
      _count: true,
      orderBy: { _count: { deviceKey: 'desc' } },
      take: 100,
    }),
  ]);
  return {
    events,
    total,
    devices: devices.map((d) => ({ deviceKey: d.deviceKey, events: d._count })),
    nextOffset: q.offset + events.length < total ? q.offset + events.length : null,
  };
}
