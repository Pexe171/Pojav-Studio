import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { providerSchema } from '@studio/core';
import { db, imports, builds } from '../infra.js';
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const importRequest = z
  .object({
    provider: providerSchema,
    projectId: z.string().min(1).max(100).optional(),
    versionId: z.string().min(1).max(100).optional(),
    uploadKey: z.string().startsWith('uploads/').optional(),
    targetProjectId: z.string().optional(),
    revision: z.number().int().optional(),
    operation: z.enum(['prepare', 'add-mod', 'upstream', 'verify-draft']).default('prepare'),
    verifyDownloads: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.provider === 'local' && !v.uploadKey && !v.projectId && v.operation !== 'verify-draft')
      ctx.addIssue({ code: 'custom', message: 'Arquivo ou projeto local necessário' });
    if (v.provider !== 'local' && (!v.projectId || !v.versionId))
      ctx.addIssue({ code: 'custom', message: 'Projeto e versão necessários' });
    if (v.operation !== 'prepare' && (!v.targetProjectId || !v.revision))
      ctx.addIssue({ code: 'custom', message: 'Projeto e revisão de destino necessários' });
  });
export type ImportRequest = z.infer<typeof importRequest>;
export async function queueImport(input: ImportRequest, profileId?: string) {
  const data = {
    data: {
      kind: input.operation,
      input: json(input),
      projectId: input.targetProjectId,
      progress: json({
        stage: 'queued',
        completed: 0,
        total: 0,
        message: 'Aguardando processamento',
      }),
    },
  };
  const job = profileId
    ? await db.$transaction(async (tx) => {
        const created = await tx.job.create(data);
        const attached = await tx.playerProfile.updateMany({
          where: { id: profileId, jobId: null },
          data: { jobId: created.id },
        });
        if (!attached.count) throw new ConflictException('Perfil já está em preparação');
        return created;
      })
    : await db.job.create(data);
  await imports.add(
    input.operation,
    { id: job.id },
    {
      jobId: job.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
  return job;
}
export async function getJob(id: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id } });
  return job;
}
export async function cancelJob(id: string) {
  return db.job.update({ where: { id }, data: { cancelRequested: true } });
}
export async function retryJob(id: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id } });
  if (job.kind === 'build' || job.status !== 'failed')
    throw new ConflictException('Somente importações interrompidas podem ser retomadas');
  const entry = await imports.getJob(id);
  if (!entry || (await entry.getState()) !== 'failed')
    throw new ConflictException('Importação não está disponível para retomar');
  const updated = await db.job.updateMany({
    where: { id, status: 'failed' },
    data: { status: 'queued', error: null, cancelRequested: false },
  });
  if (!updated.count) throw new ConflictException('Importação já retomada');
  try {
    await entry.retry('failed');
  } catch (error) {
    await db.job.updateMany({
      where: { id, status: 'queued' },
      data: { status: 'failed', error: 'Não foi possível retomar a fila' },
    });
    throw error;
  }
  return getJob(id);
}
export async function reconcileJobs() {
  const pending = await db.job.findMany({ where: { status: { in: ['queued', 'processing'] } } });
  for (const job of pending) {
    const queue = job.kind === 'build' ? builds : imports;
    const entry = await queue.getJob(job.id);
    if (!entry)
      await queue.add(
        job.kind,
        { id: job.id },
        {
          jobId: job.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    else if ((await entry.getState()) === 'failed') {
      // BullMQ can fail a stalled job without invoking the importer catch block.
      await db.job.updateMany({
        where: { id: job.id, status: { in: ['queued', 'processing'] } },
        data: {
          status: 'failed',
          error: entry.failedReason || 'Processamento interrompido',
          progress: json({
            stage: 'failed',
            completed: 0,
            total: 0,
            message: 'Importação interrompida. Tente novamente.',
          }),
        },
      });
    }
  }
}
export const uploadKey = (extension: string) => `uploads/${randomUUID()}${extension}`;
