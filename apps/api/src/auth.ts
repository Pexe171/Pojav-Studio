import { createHmac, randomBytes } from 'node:crypto';
import { verify } from 'argon2';
import { ForbiddenException, UnauthorizedException, HttpException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from './config.js';
import { db, redis } from './infra.js';
const tokenId=(token:string)=>createHmac('sha256',env.SESSION_SECRET).update(token).digest('hex');
export class AuthGuard implements CanActivate {
  async canActivate(context:ExecutionContext){
    const req=context.switchToHttp().getRequest<Request>();
    const diagnostic=req.path==='/api/v1/public/diagnostics',auth=req.path.includes('/auth/login');const key=`limit:${req.ip}:${auth?'login':diagnostic?'diagnostic':'request'}`;const count=await redis.incr(key);if(count===1)await redis.expire(key,auth?900:diagnostic?3600:60);if(count>(auth?10:diagnostic?20:300))throw new HttpException('Muitas requisições. Tente novamente mais tarde.',429);
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){if(req.headers['x-studio-request']!=='1'||req.headers.origin&&req.headers.origin!==env.WEB_ORIGIN)throw new ForbiddenException('Requisição não autorizada');}
    if(req.path==='/api/v1/health'||req.path==='/api/v1/auth/login'||req.path.startsWith('/api/v1/public/'))return true;
    const token=req.cookies?.studio_session;if(typeof token!=='string')throw new UnauthorizedException('Faça login para continuar');
    const session=await db.session.findUnique({where:{id:tokenId(token)},include:{admin:true}});if(!session||session.expiresAt.getTime()<Date.now())throw new UnauthorizedException('Sessão expirada');
    (req as Request&{adminId:string}).adminId=session.adminId;return true;
  }
}
export async function login(input:unknown,res:Response){const {email,password}=z.object({email:z.string().email(),password:z.string().min(1).max(256)}).parse(input);const admin=await db.admin.findUnique({where:{email:email.toLowerCase()}});if(!admin||!await verify(admin.passwordHash,password))throw new UnauthorizedException('Email ou senha inválidos');const token=randomBytes(32).toString('base64url');await db.session.create({data:{id:tokenId(token),adminId:admin.id,expiresAt:new Date(Date.now()+8*3600000)}});res.cookie('studio_session',token,{httpOnly:true,secure:env.NODE_ENV==='production',sameSite:'strict',maxAge:8*3600000,path:'/'});return {email:admin.email};}
export async function logout(req:Request,res:Response){const token=req.cookies?.studio_session;if(typeof token==='string')await db.session.deleteMany({where:{id:tokenId(token)}});res.clearCookie('studio_session',{path:'/'});return {ok:true};}
