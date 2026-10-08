import { execFileSync } from 'node:child_process';
import { readFile,mkdir,access,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const lock=JSON.parse(await readFile(new URL('../integrations/amethyst/launcher.lock.json',import.meta.url),'utf8'));
const target=resolve(process.argv[2]??'vendor/amethyst');await mkdir(resolve(target,'..'),{recursive:true});
const git=(args)=>execFileSync('git',args,{cwd:target,stdio:'inherit'});
let cloned=false;try{await access(resolve(target,'.git'));}catch{cloned=true;execFileSync('git',['clone','--no-checkout',lock.repository,target],{stdio:'inherit'});}
const status=execFileSync('git',['status','--porcelain'],{cwd:target,encoding:'utf8'});if(!cloned&&status.split('\n').filter(line=>line.trim()&&!line.endsWith('studio-source-commit')).length)throw new Error('Checkout Android modificado. Prepare uma cópia limpa.');
git(['fetch','--depth','1','origin',lock.commit]);git(['checkout','--detach',lock.commit]);
// One upstream submodule uses SSH; fetch the identical repository and pinned commit over HTTPS.
git(['config','submodule.androidnsbypass.url','https://github.com/alexytomi/androidnsbypass.git']);
git(['-c','url.https://github.com/.insteadOf=git@github.com:','submodule','update','--init','--recursive','--depth','1']);
const actual=execFileSync('git',['rev-parse','HEAD'],{cwd:target,encoding:'utf8'}).trim();if(actual!==lock.commit)throw new Error('Commit Android divergente');await writeFile(resolve(target,'studio-source-commit'),actual);console.log(`Launcher preparado: ${actual}`);
