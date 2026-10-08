import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
dotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('postgresql://studio:studio_dev_password@localhost:5432/studio'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SESSION_SECRET: z.string().min(32),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
  CURSEFORGE_API_KEY: z.string().default(''),
  MODRINTH_USER_AGENT: z.string().default('AmethystModpackStudio/1.0'),
  STORAGE_ENDPOINT: z.string().url().default('http://localhost:9000'),
  PUBLIC_STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_BUCKET: z.string().default('modpack-studio'),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_ACCESS_KEY: z.string(),
  STORAGE_SECRET_KEY: z.string(),
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((x) => x === 'true'),
  IMPORT_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  IMPORT_MAX_ARCHIVE_BYTES: z.coerce.number().default(536870912),
  IMPORT_MAX_EXPANDED_BYTES: z.coerce.number().int().positive().max(4294967296).default(536870912),
  IMPORT_MAX_ENTRIES: z.coerce.number().default(20000),
  BUILD_ENABLED: z
    .string()
    .default('false')
    .transform((x) => x === 'true'),
  BUILD_ROOT: z.string().default('/builds'),
  LAUNCHER_SOURCE: z.string().default('/launcher'),
  APK_KEYSTORE_PATH: z.string().default('/secrets/studio.jks'),
  APK_KEYSTORE_PASSWORD: z.string().default(''),
  APK_KEY_ALIAS: z.string().default('studio'),
  APK_KEY_PASSWORD: z.string().default(''),
  ANDROID_VALIDATED_TARGETS: z
    .string()
    .default('[]')
    .transform((x, ctx) => {
      try {
        return z
          .array(z.object({ minecraft: z.string(), loader: z.string(), loaderVersion: z.string() }))
          .parse(JSON.parse(x));
      } catch {
        ctx.addIssue({ code: 'custom', message: 'ANDROID_VALIDATED_TARGETS deve ser JSON válido' });
        return z.NEVER;
      }
    }),
  PERFORMANCE_APPROVED_MODS: z
    .string()
    .default('[]')
    .transform((x, ctx) => {
      try {
        return z
          .array(
            z.object({
              provider: z.enum(['modrinth', 'curseforge']),
              projectId: z.string(),
              versionId: z.string(),
              minecraft: z.string(),
              loader: z.string(),
              renderer: z.string().nullable().default(null),
            }),
          )
          .parse(JSON.parse(x));
      } catch {
        ctx.addIssue({ code: 'custom', message: 'PERFORMANCE_APPROVED_MODS inválido' });
        return z.NEVER;
      }
    }),
  DIAGNOSTIC_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  LAUNCHER_NAME: z.string().min(1).max(80).default('Pojav Studio'),
  LAUNCHER_APPLICATION_ID: z
    .string()
    .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/)
    .default('br.dev.pojavstudio.launcher'),
});
export const env = schema.parse(process.env);
if (
  env.NODE_ENV === 'production' &&
  (!env.PUBLIC_API_URL.startsWith('https://') || !env.WEB_ORIGIN.startsWith('https://'))
)
  throw new Error('Produção exige HTTPS');
