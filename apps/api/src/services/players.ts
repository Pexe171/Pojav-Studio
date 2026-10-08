import { createHmac, randomBytes } from 'node:crypto';
import { hash, verify } from 'argon2';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { bundleSchema } from '@studio/core';
import { env } from '../config.js';
import { db, redis } from '../infra.js';
import { consumeLimit, accountLimitKey, passwordCheck } from '../security.js';
import { providers } from '../providers/registry.js';
import { searchCatalog, searchSchema } from './catalog.js';
import { queueImport, json } from './jobs.js';
import { commitImport, publishProject } from './projects.js';

export const playerId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const playerCredentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(10).max(128),
});
export const profileSettings = z.object({
  performanceMode: z.enum(['light', 'balanced', 'original']).default('light'),
  touchMode: z.enum(['auto', 'show', 'hide']).default('auto'),
});
const tokenHash = (token: string) =>
  createHmac('sha256', env.SESSION_SECRET)
    .update('player:' + token)
    .digest('hex');
const dummy = hash(randomBytes(32).toString('hex'));
export async function requirePlayer(req: Request) {
  const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) throw new UnauthorizedException('Entre na sua conta ou continue como visitante');
  const session = await db.playerSession.findUnique({
    where: { id: tokenHash(token) },
    include: { player: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now())
    throw new UnauthorizedException('Sessão expirada. Entre novamente.');
  return session.player;
}
const safePlayer = (p: { id: string; email: string | null; name: string }) => ({
  id: p.id,
  email: p.email,
  name: p.name,
  guest: !p.email,
});
async function createSession(player: { id: string; email: string | null; name: string }) {
  const token = randomBytes(32).toString('base64url');
  await db.playerSession.create({
    data: {
      id: tokenHash(token),
      playerId: player.id,
      expiresAt: new Date(Date.now() + 90 * 86400000),
    },
  });
  return { token, player: safePlayer(player) };
}
export async function guest(req: Request) {
  await consumeLimit(redis, 'player-guest-global', 60, 3600);
  await consumeLimit(redis, `player-guest:${req.ip}`, 10, 3600);
  return createSession(await db.player.create({ data: {} }));
}
export async function registerPlayer(req: Request, input: unknown) {
  await consumeLimit(redis, 'player-register-global', 30, 3600);
  const value = playerCredentials.extend({ name: z.string().trim().min(1).max(80) }).parse(input);
  await consumeLimit(redis, `player-register:${req.ip}`, 3, 3600);
  const passwordHash = await passwordCheck(() => hash(value.password));
  // Upgrade the current guest in place, preserving its profiles and installation IDs.
  let current = null;
  try {
    current = await requirePlayer(req);
  } catch (error) {
    if (!(error instanceof UnauthorizedException)) throw error;
  }
  const candidate = current;
  const player =
    candidate && !candidate.email
      ? await db.$transaction(async (tx) => {
          const upgraded = await tx.player.updateMany({
            where: { id: candidate.id, email: null },
            data: { email: value.email, name: value.name, passwordHash },
          });
          if (!upgraded.count)
            throw new ConflictException('Esta conta já foi criada. Entre com seu email e senha.');
          await tx.playerSession.deleteMany({ where: { playerId: candidate.id } });
          return tx.player.findUniqueOrThrow({ where: { id: candidate.id } });
        })
      : await db.player.create({ data: { email: value.email, name: value.name, passwordHash } });
  return createSession(player);
}
export async function loginPlayer(req: Request, input: unknown) {
  const value = playerCredentials.parse(input);
  await consumeLimit(redis, `player-login:${req.ip}`, 10, 900);
  await consumeLimit(redis, 'player-login-global', 60, 60);
  const key = accountLimitKey(value.email, env.SESSION_SECRET) + ':player';
  await consumeLimit(redis, key, 10, 900);
  const player = await db.player.findUnique({ where: { email: value.email } });
  const valid = await passwordCheck(async () =>
    verify(player?.passwordHash ?? (await dummy), value.password),
  );
  if (!player || !valid) throw new UnauthorizedException('Email ou senha inválidos');
  await redis.del(key);
  return createSession(player);
}
export async function logoutPlayer(req: Request) {
  await requirePlayer(req);
  const token = req.headers.authorization!.slice(7);
  await db.playerSession.deleteMany({ where: { id: tokenHash(token) } });
  return { ok: true };
}
export async function changePlayerPassword(req: Request, input: unknown) {
  const player = await requirePlayer(req);
  if (!player.passwordHash) throw new BadRequestException('Crie sua conta primeiro');
  const value = z
    .object({ currentPassword: z.string().min(1).max(128), password: z.string().min(10).max(128) })
    .parse(input);
  await consumeLimit(redis, `player-password:${player.id}`, 5, 3600);
  if (!(await passwordCheck(() => verify(player.passwordHash!, value.currentPassword))))
    throw new UnauthorizedException('Senha atual inválida');
  const passwordHash = await passwordCheck(() => hash(value.password));
  await db.$transaction([
    db.player.update({ where: { id: player.id }, data: { passwordHash } }),
    db.playerSession.deleteMany({ where: { playerId: player.id } }),
  ]);
  return createSession(player);
}
export async function personalProfile(player: string, id: string) {
  const profile = await db.playerProfile.findFirst({
    where: { id: playerId.parse(id), playerId: player },
  });
  if (!profile) throw new NotFoundException('Perfil não encontrado');
  return profile;
}
export async function profileCard(profile: Awaited<ReturnType<typeof personalProfile>>) {
  const release = profile.projectId
    ? await db.release.findFirst({
        where: {
          projectId: profile.projectId,
          ...(profile.provider === 'local' ? { id: profile.externalVersionId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      })
    : null;
  const job = profile.jobId
    ? await db.job.findUnique({
        where: { id: profile.jobId },
        select: { id: true, status: true, progress: true, error: true },
      })
    : null;
  let card = null;
  if (release) {
    const b = bundleSchema.parse(release.bundle);
    card = {
      id: release.projectId,
      name: profile.name,
      icon: profile.icon,
      version: release.version,
      releaseId: release.id,
      minecraft: b.minecraft,
      loader: b.loader,
      modCount: b.files.filter((f) => f.kind === 'mod').length,
      size: b.files.reduce((n, f) => n + f.size, 0),
      manifestEndpoint: `/api/v1/public/releases/${release.id}/manifest`,
      profileId: profile.id,
      profileRevision: profile.revision,
      settings: profile.settings,
      favorite: profile.favorite,
    };
  }
  let preparationError: string | undefined;
  if (!card && profile.projectId) {
    const project = await db.project.findUnique({ where: { id: profile.projectId } });
    if (project) {
      const bundle = bundleSchema.parse(project.draft);
      const blocked = bundle.files.filter(
        (f) => f.required && (f.status !== 'resolved' || f.distribution === 'blocked'),
      );
      if (blocked.length)
        preparationError = `${blocked.length} arquivos obrigatórios indisponíveis: ${blocked[0]?.issue ?? blocked[0]?.name}`;
    }
  }
  return {
    ...profile,
    card,
    preparationError,
    job: job ? { id: job.id, status: job.status, progress: job.progress, error: job.error } : null,
  };
}
export async function playerLibrary(req: Request) {
  const player = await requirePlayer(req);
  const profiles = await db.playerProfile.findMany({
    where: { playerId: player.id },
    orderBy: [{ favorite: 'desc' }, { updatedAt: 'desc' }],
    take: 100,
  });
  return { player: safePlayer(player), profiles: await Promise.all(profiles.map(profileCard)) };
}
export async function createProfile(req: Request, input: unknown) {
  const player = await requirePlayer(req);
  const value = z
    .object({
      provider: z.enum(['modrinth', 'curseforge']),
      projectId: playerId,
      versionId: playerId,
    })
    .parse(input);
  const key = {
    playerId: player.id,
    provider: value.provider,
    externalProjectId: value.projectId,
    externalVersionId: value.versionId,
  };
  const old = await db.playerProfile.findUnique({
    where: { playerId_provider_externalProjectId_externalVersionId: key },
  });
  if (old && (old.jobId || old.projectId)) return profileCard(old);
  await consumeLimit(redis, `player-import:${player.id}`, 10, 86400);
  await consumeLimit(redis, 'player-import-global', 30, 3600);
  if ((await db.playerProfile.count({ where: { playerId: player.id } })) >= 100)
    throw new BadRequestException('Limite de 100 perfis atingido');
  const detail = await providers[value.provider].getModpack(value.projectId);
  const profile = await db.playerProfile.upsert({
    where: { playerId_provider_externalProjectId_externalVersionId: key },
    create: {
      ...key,
      name: detail.name,
      icon: detail.icon,
      settings: json(profileSettings.parse({})),
    },
    update: {},
  });
  if (!profile.jobId) {
    try {
      await queueImport(
        {
          provider: value.provider,
          projectId: value.projectId,
          versionId: value.versionId,
          operation: 'prepare',
          verifyDownloads: false,
        },
        profile.id,
      );
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
    }
  }
  return profileCard(await personalProfile(player.id, profile.id));
}
export async function attachPublicRelease(req: Request, input: unknown) {
  const player = await requirePlayer(req);
  const { releaseId } = z.object({ releaseId: playerId }).parse(input);
  const release = await accessRelease(req, releaseId);
  if (release.project.personal) throw new BadRequestException('Use seu perfil pessoal existente');
  if ((await db.playerProfile.count({ where: { playerId: player.id } })) >= 100)
    throw new BadRequestException('Limite de perfis atingido');
  const key = {
    playerId: player.id,
    provider: 'local',
    externalProjectId: release.projectId,
    externalVersionId: release.id,
  };
  const profile = await db.playerProfile.upsert({
    where: { playerId_provider_externalProjectId_externalVersionId: key },
    create: {
      ...key,
      name: release.project.name,
      icon: release.project.icon,
      projectId: release.projectId,
      settings: json(profileSettings.parse({})),
    },
    update: {},
  });
  return profileCard(profile);
}
export async function installProfile(req: Request, id: string) {
  const player = await requirePlayer(req);
  let p = await personalProfile(player.id, id);
  if (!p.jobId) {
    if (p.projectId) return profileCard(p);
    throw new BadRequestException('Perfil sem importação');
  }
  const job = await db.job.findUniqueOrThrow({ where: { id: p.jobId } });
  if (!p.projectId) {
    let projectId = job.projectId;
    if (!projectId) {
      try {
        projectId = (await commitImport(p.jobId, { name: p.name }, true)).id;
      } catch (error) {
        if (!(error instanceof ConflictException) && !(error instanceof BadRequestException))
          throw error;
        projectId = (await db.job.findUniqueOrThrow({ where: { id: p.jobId } })).projectId;
        if (!projectId) throw error;
      }
    }
    await db.playerProfile.update({ where: { id: p.id }, data: { projectId } });
    p = await personalProfile(player.id, id);
  }
  const existing = await db.release.findFirst({ where: { projectId: p.projectId! } });
  if (!existing) {
    const project = await db.project.findUniqueOrThrow({ where: { id: p.projectId! } });
    try {
      await publishProject(project.id, {
        revision: project.revision,
          version: bundleSchema.parse(project.draft).version,
        distributionConfirmed: true,
      });
    } catch (error) {
      if (!(await db.release.count({ where: { projectId: project.id } }))) throw error;
    }
  }
  return profileCard(p);
}
export async function updateProfile(req: Request, id: string, input: unknown) {
  const player = await requirePlayer(req);
  await personalProfile(player.id, id);
  const value = z
    .object({
      revision: z.number().int().positive(),
      name: z.string().trim().min(1).max(120),
      favorite: z.boolean(),
      settings: profileSettings,
    })
    .parse(input);
  const result = await db.playerProfile.updateMany({
    where: { id, playerId: player.id, revision: value.revision },
    data: {
      name: value.name,
      favorite: value.favorite,
      settings: json(value.settings),
      revision: { increment: 1 },
    },
  });
  if (!result.count)
    throw new ConflictException('Perfil alterado em outro aparelho. Recarregue antes de salvar.');
  return profileCard(await personalProfile(player.id, id));
}
export async function accessRelease(req: Request, releaseId: string) {
  const release = await db.release.findUnique({
    where: { id: releaseId },
    include: { project: true },
  });
  if (!release) throw new NotFoundException('Release não encontrada');
  if (release.project.personal) {
    const player = await requirePlayer(req);
    if (
      !(await db.playerProfile.count({
        where: { playerId: player.id, projectId: release.projectId },
      }))
    )
      throw new NotFoundException('Release não encontrada');
  }
  return release;
}
export async function discover(req: Request, input: unknown) {
  await consumeLimit(redis, `player-search:${req.ip}`, 60, 60);
  await consumeLimit(redis, 'player-search-global', 300, 60);
  const q = searchSchema
    .extend({ provider: z.enum(['all', 'modrinth', 'curseforge']).default('all') })
    .parse(input);
  // External-only searches avoid exposing unpublished or personal local projects.
  return searchCatalog(q, true);
}
