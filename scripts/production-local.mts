// One-time conversion of this project's local Docker database to production configuration.
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import {db,closeInfra} from '../apps/api/src/infra.js';
const current=parse(await readFile('.env','utf8'));
if(current.NODE_ENV==='production')throw new Error('Production is already configured; do not rotate automatically.');
await copyFile('.env','.data/development.env');
const password=randomBytes(32).toString('hex');
await db.$executeRawUnsafe(`ALTER ROLE studio WITH PASSWORD '${password}'`);
const config={...parse(await readFile('.env.production.example','utf8')),POSTGRES_PASSWORD:password,DATABASE_URL:`postgresql://studio:${password}@localhost:5432/studio`,REDIS_URL:'redis://localhost:6379',STORAGE_ENDPOINT:'http://localhost:9000',SESSION_SECRET:randomBytes(48).toString('hex'),STORAGE_SECRET_KEY:randomBytes(32).toString('hex'),CURSEFORGE_API_KEY:current.CURSEFORGE_API_KEY??''};
await writeFile('.env',Object.entries(config).map(([key,value])=>`${key}=${value}`).join('\n')+'\n');
const tunnel='61d8d2e9-60ca-4dda-a61f-aa5470367847';
const template=await readFile('infra/cloudflared.example.yml','utf8');await writeFile('.data/cloudflared/config.yml',template.replace('YOUR_TUNNEL_UUID',tunnel));
await closeInfra();console.log('Production configuration saved; database password rotated. No secrets printed.');
