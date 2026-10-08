import { hash } from 'argon2';
import { createInterface } from 'node:readline/promises';
import { z } from 'zod';
import './config.js';
import { PrismaClient } from '@prisma/client';
const db=new PrismaClient();
const email=z.string().email().parse(process.argv[2]??process.env.ADMIN_EMAIL).toLowerCase();
let password=process.env.ADMIN_PASSWORD;
if(!password){if(!process.stdin.isTTY)throw new Error('Defina ADMIN_PASSWORD no ambiente');const rl=createInterface({input:process.stdin,output:process.stdout});password=await rl.question('Senha (mínimo 12 caracteres; use ADMIN_PASSWORD para entrada sem eco): ');rl.close();}
z.string().min(12).max(256).parse(password);
try{await db.admin.create({data:{email,passwordHash:await hash(password)}});console.log(`Administrador criado: ${email}`);}finally{await db.$disconnect();}
