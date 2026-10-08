import {randomBytes} from 'node:crypto';
import {hash} from 'argon2';
import {mkdir,writeFile} from 'node:fs/promises';
import {z} from 'zod';
import {db,closeInfra} from '../apps/api/src/infra.js';
const email=z.string().email().parse(process.argv[2]).toLowerCase();
try{
 if(await db.admin.findUnique({where:{email}}))throw new Error('Conta já existe; senha preservada.');
 const password=randomBytes(24).toString('base64url');await mkdir('.data/secrets',{recursive:true});
 await writeFile('.data/secrets/initial-admin.json',JSON.stringify({email,password},null,2),{flag:'wx',mode:0o600});
 await db.admin.create({data:{email,passwordHash:await hash(password)}});
 console.log('Conta criada. Credenciais iniciais em .data/secrets/initial-admin.json (não entram no Git).');
}finally{await closeInfra();}
