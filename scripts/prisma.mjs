import {config} from 'dotenv';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const cli=fileURLToPath(new URL('../apps/api/node_modules/prisma/build/index.js',import.meta.url));
const result=spawnSync(process.execPath,[cli,...process.argv.slice(2)],{stdio:'inherit',cwd:fileURLToPath(new URL('../apps/api',import.meta.url)),env:process.env});
if(result.error)throw result.error;
process.exit(result.status??1);
