import { readFile,writeFile,access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
try{await access('.env');console.log('.env já existe; preservado.');}catch{const template=await readFile('.env.example','utf8');await writeFile('.env',template.replace('SESSION_SECRET=replace-with-at-least-32-random-characters',`SESSION_SECRET=${randomBytes(48).toString('hex')}`),{flag:'wx'});console.log('.env local criado. Configure credenciais e URLs antes de produção.');}
