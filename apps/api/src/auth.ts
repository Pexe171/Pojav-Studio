import { createHmac, randomBytes } from 'node:crypto';
import { hash, verify } from 'argon2';
import {
  ForbiddenException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from './config.js';
import { db, redis } from './infra.js';
import { consumeLimit, accountLimitKey, passwordCheck } from './security.js';
const dummyPasswordHash = hash(randomBytes(32).toString('hex'));
const sessionCookie = env.NODE_ENV === 'production' ? '__Host-studio_session' : 'studio_session';
const tokenId = (token: string) =>
  createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const diagnostic = req.path === '/api/v1/public/diagnostics',
      auth = req.path.includes('/auth/login');
    const key = `limit:${req.ip}:${auth ? 'login' : diagnostic ? 'diagnostic' : 'request'}`;
    await consumeLimit(
      redis,
      key,
      auth ? 10 : diagnostic ? 20 : 300,
      auth ? 900 : diagnostic ? 3600 : 60,
    );
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (
        req.headers['x-studio-request'] !== '1' ||
        (req.headers.origin && req.headers.origin !== env.WEB_ORIGIN)
      )
        throw new ForbiddenException('Requisição não autorizada');
    }
    if (
      req.path === '/api/v1/health' ||
      req.path === '/api/v1/auth/login' ||
      req.path.startsWith('/api/v1/public/')
    )
      return true;
    const token = req.cookies?.[sessionCookie];
    if (typeof token !== 'string') throw new UnauthorizedException('Faça login para continuar');
    const session = await db.session.findUnique({
      where: { id: tokenId(token) },
      include: { admin: true },
    });
    if (!session || session.expiresAt.getTime() < Date.now())
      throw new UnauthorizedException('Sessão expirada');
    (req as Request & { adminId: string }).adminId = session.adminId;
    return true;
  }
}
export async function login(input: unknown, res: Response) {
  const { email, password } = z
    .object({ email: z.string().trim().max(254).email(), password: z.string().min(1).max(256) })
    .parse(input);
  await consumeLimit(redis, 'login-global', 60, 60);
  const accountKey = accountLimitKey(email, env.SESSION_SECRET);
  await consumeLimit(redis, accountKey, 10, 900);
  const admin = await db.admin.findUnique({ where: { email: email.toLowerCase() } });
  const valid = await passwordCheck(async () =>
    verify(admin?.passwordHash ?? (await dummyPasswordHash), password),
  );
  if (!admin || !valid) throw new UnauthorizedException('Email ou senha inválidos');
  await redis.del(accountKey);
  const token = randomBytes(32).toString('base64url');
  await db.session.create({
    data: { id: tokenId(token), adminId: admin.id, expiresAt: new Date(Date.now() + 8 * 3600000) },
  });
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 3600000,
    path: '/',
  });
  return { email: admin.email };
}
export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[sessionCookie];
  if (typeof token === 'string') await db.session.deleteMany({ where: { id: tokenId(token) } });
  res.clearCookie(sessionCookie, {
    path: '/',
    secure: env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
  });
  return { ok: true };
}
