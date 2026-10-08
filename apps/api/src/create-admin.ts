import { hash } from 'argon2';
import { z } from 'zod';
import './config.js';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const email = z
  .string()
  .email()
  .parse(process.argv[2] ?? process.env.ADMIN_EMAIL)
  .toLowerCase();
let password = process.env.ADMIN_PASSWORD;
if (!password) {
  const { readPassword } = (await import(
    new URL('../../../scripts/read-password.mjs', import.meta.url).href
  )) as { readPassword: (prompt: string) => Promise<string> };
  password = (await readPassword('Senha (mínimo 12 caracteres, entrada oculta): ')) as string;
}
z.string().min(12).max(256).parse(password);
try {
  await db.admin.create({ data: { email, passwordHash: await hash(password) } });
  console.log(`Administrador criado: ${email}`);
} finally {
  await db.$disconnect();
}
