import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Bundle, Dependency, ImportedFrom, JobProgress, ResolvedFile } from '@studio/core';
import { bundleSchema, deduplicate, resolvedFileSchema } from '@studio/core';
import { env } from '../config.js';
import { db, getObject, putObject } from '../infra.js';
import { compatible, providers, modrinth } from '../providers/registry.js';
import { importRequest, json, type ImportRequest } from '../services/jobs.js';
import { readArchive } from './archive.js';
import { parseArchive, parseInternal, type ParsedPack } from './parsers.js';
import { downloadToFile } from './download.js';
export interface PreparedImport { bundle:Bundle; importedFrom:ImportedFrom|null; icon:string|null; optionalFiles:string[] }
async function checkCancelled(id:string){const job=await db.job.findUniqueOrThrow({where:{id}});if(job.cancelRequested)throw new Error('Importação cancelada');}
async function progress(id:string,value:JobProgress,result?:PreparedImport){await checkCancelled(id);await db.job.update({where:{id},data:{progress:json(value),...(result?{result:json(result)}:{})}});}
async function parseInput(input:ImportRequest,temp:string,jobId:string):Promise<{parsed:ParsedPack;upstream:ImportedFrom|null;icon:string|null}>{
  if(input.provider==='local'&&input.projectId&&!input.uploadKey){const project=await db.project.findUniqueOrThrow({where:{id:input.projectId}});const release=await db.release.findFirstOrThrow({where:{id:input.versionId,projectId:input.projectId}});return {parsed:{bundle:bundleSchema.parse(release.bundle),embedded:new Map()},upstream:{provider:'local',projectId:project.id,versionId:release.id,name:project.name,websiteUrl:`${env.WEB_ORIGIN}/projects/${project.id}`},icon:project.icon};}
  let bytes:Buffer;let upstream:ImportedFrom|null=null,icon:string|null=null;
  if(input.uploadKey){bytes=await getObject(input.uploadKey);}else{
    const provider=providers[input.provider];const details=await provider.getModpack(input.projectId!);const v=await provider.importModpack({projectId:input.projectId!,versionId:input.versionId!});
    const file=v.files.find(f=>input.provider==='modrinth'?f.filename.endsWith('.mrpack'):f.filename.endsWith('.zip'));
    if(!file?.url)throw new Error('Esta versão não fornece um arquivo de modpack autorizado');
    const path=join(temp,'pack');await downloadToFile([file.url],path,file.hashes,env.IMPORT_MAX_ARCHIVE_BYTES,file.size,()=>checkCancelled(jobId));bytes=await readFile(path);
    upstream={provider:input.provider,projectId:details.externalProjectId,versionId:v.id,name:details.name,websiteUrl:details.websiteUrl};icon=details.icon;
  }
  if(bytes.length>env.IMPORT_MAX_ARCHIVE_BYTES)throw new Error('Pacote excede o limite de upload');
  if(bytes.subarray(0,2).toString()==='PK'){const archive=join(temp,'archive.zip');await writeFile(archive,bytes);const entries=await readArchive(archive,{maxBytes:env.IMPORT_MAX_EXPANDED_BYTES,maxEntries:env.IMPORT_MAX_ENTRIES});return {parsed:parseArchive(entries),upstream,icon};}
  return {parsed:parseInternal(bytes),upstream,icon};
}
async function resolveReferences(parsed:ParsedPack,jobId:string){const refs=parsed.curseforgeRefs??[];for(let index=0;index<refs.length;index++){
  const ref=refs[index]!;await progress(jobId,{stage:'files',completed:index,total:refs.length,message:`Resolvendo metadata ${index+1}/${refs.length}`});
  try{const files=await providers.curseforge.getFiles(ref.projectId,ref.versionId);for(const file of files){file.required=ref.required;if(!compatible(parsed.bundle,file)){file.status='conflict';file.issue='Versão incompatível com Minecraft ou loader do pacote';}parsed.bundle.files.push(file);}}
  catch(error){parsed.bundle.files.push(resolvedFileSchema.parse({id:`curseforge:${ref.projectId}:${ref.versionId}`,provider:'curseforge',projectId:ref.projectId,versionId:ref.versionId,name:`Projeto ${ref.projectId}`,filename:`${ref.projectId}-${ref.versionId}.jar`,path:`mods/${ref.projectId}-${ref.versionId}.jar`,hashes:{},size:0,kind:'mod',distribution:'blocked',required:ref.required,issue:error instanceof Error?error.message:'Metadata indisponível'}));}
}}
async function identify(file:ResolvedFile){if(file.provider!=='local'||file.kind!=='mod'||!file.hashes.sha512||file.storageKey)return;
  const v=await modrinth.identifyHash(file.hashes.sha512);if(!v)return;
  const project=await modrinth.getModpack(v.projectId);file.provider='modrinth';file.projectId=v.projectId;file.versionId=v.id;file.name=project.name;file.minecraftVersions=v.minecraftVersions;file.loaders=v.loaders;file.websiteUrl=project.websiteUrl;file.license=project.license;
}
async function resolveDependencies(bundle:Bundle,jobId:string){
  const visited=new Set<string>();const additions:ResolvedFile[]=[];
  for(let i=0;i<bundle.files.length;i++){
    if(bundle.files.length>env.IMPORT_MAX_ENTRIES)throw new Error('Dependências excedem o limite de arquivos');
    const file=bundle.files[i]!;if(file.kind!=='mod'||file.provider==='local'||!file.projectId||!file.versionId)continue;
    const key=`${file.provider}:${file.projectId}:${file.versionId}`;if(visited.has(key))continue;visited.add(key);
    await progress(jobId,{stage:'dependencies',completed:i,total:bundle.files.length,message:`Dependências ${i+1}/${bundle.files.length}`});
    let dependencies:Dependency[];try{dependencies=await providers[file.provider].getDependencies(file.projectId,file.versionId);}catch{file.status='pending';file.issue='Não foi possível verificar dependências';continue;}
    for(const dep of dependencies){
      if(dep.incompatible){if(bundle.files.some(f=>f.provider===dep.provider&&(dep.projectId?f.projectId===dep.projectId:f.versionId===dep.versionId))){file.status='conflict';file.issue='Dependência incompatível presente no pacote';}continue;}
      if(!dep.required)continue;
      const existing=bundle.files.find(f=>f.provider===dep.provider&&(dep.projectId?f.projectId===dep.projectId:f.versionId===dep.versionId));
      if(existing){existing.required ||= file.required;if(!existing.requiredBy.includes(file.id))existing.requiredBy.push(file.id);if(dep.versionId&&existing.versionId!==dep.versionId){existing.status='conflict';existing.issue=`Dependência exige versão ${dep.versionId}`;}continue;}
      try{
        let projectId=dep.projectId,versionId=dep.versionId;
        if(!projectId&&versionId&&dep.provider==='modrinth')projectId=(await modrinth.getVersionById(versionId)).projectId;
        if(!projectId)throw new Error('Dependência sem identidade resolvível');
        if(!versionId){const versions=await providers[dep.provider].getVersions(projectId,{minecraft:bundle.minecraft,loader:bundle.loader.type});versionId=versions[0]?.id??null;}
        if(!versionId)throw new Error('Dependência sem versão compatível');
        const files=await providers[dep.provider].getFiles(projectId,versionId);if(!files.length)throw new Error('Dependência sem arquivo');
        for(const item of files){item.required=file.required;item.requiredBy.push(file.id);if(!compatible(bundle,item)){item.status='conflict';item.issue='Dependência incompatível com o pacote';}bundle.files.push(item);additions.push(item);}
      }catch(error){file.status='pending';file.issue=`Dependência ${dep.projectId??dep.versionId}: ${error instanceof Error?error.message:'Não resolvida'}`;}
    }
  }
  return additions;
}
async function verifyFiles(bundle:Bundle,temp:string,jobId:string,result:PreparedImport,checkpoint:Map<string,ResolvedFile>){
  let index=0;
  async function verifyOne(file:ResolvedFile){
    await checkCancelled(jobId);
    const old=checkpoint.get(file.path);if(old?.status==='resolved'&&JSON.stringify(old.hashes)===JSON.stringify(file.hashes)){Object.assign(file,{hashes:old.hashes,status:old.status,storageKey:old.storageKey,distribution:old.distribution});}
    if(file.environment.client==='unsupported'||file.status==='conflict'||file.issue||file.status==='resolved')return;
    if(file.distribution==='hosted'&&file.storageKey){file.status='resolved';return;}
    if(file.distribution==='blocked'||!file.downloadUrl){file.issue='Download autorizado indisponível';return;}
    try{const path=join(temp,randomUUID());const response=await downloadToFile(file.downloads.length?file.downloads:[file.downloadUrl],path,file.hashes,env.IMPORT_MAX_ARCHIVE_BYTES,file.size,()=>checkCancelled(jobId));file.hashes={...file.hashes,...response.hashes};file.status='resolved';file.issue=null;await rm(path,{force:true});}
    catch(error){if(error instanceof Error&&error.message==='Importação cancelada')throw error;file.status='pending';file.issue=error instanceof Error?error.message:'Download falhou';}
  }
  const tasks=Array.from({length:Math.min(env.IMPORT_CONCURRENCY,bundle.files.length)},async()=>{while(index<bundle.files.length){const current=index++;await verifyOne(bundle.files[current]!);await progress(jobId,{stage:'files',completed:bundle.files.filter(f=>f.status==='resolved').length,total:bundle.files.length,message:`Arquivos ${current+1}/${bundle.files.length}`},result);}});await Promise.all(tasks);
}
export async function processImport(jobId:string){
  const job=await db.job.findUniqueOrThrow({where:{id:jobId}});const input=importRequest.parse(job.input);if(job.status==='ready'||job.status==='committed')return job.result;
  const prior=job.result as unknown as PreparedImport|null;const checkpoint=new Map((prior?.bundle?.files??[]).map(f=>[f.path,f]));
  await db.job.update({where:{id:jobId},data:{status:'processing',error:null}});const temp=await mkdtemp(join(tmpdir(),'studio-import-'));
  try{
    await progress(jobId,{stage:'analyzing',completed:0,total:0,message:'Analisando modpack...'});
    let parsed:ParsedPack,upstream:ImportedFrom|null=null,icon:string|null=null;
    if(input.operation==='verify-draft'){
      const target=await db.project.findUniqueOrThrow({where:{id:input.targetProjectId!}});const bundle=bundleSchema.parse(target.draft);
      for(const file of bundle.files)if(file.distribution!=='blocked'){file.issue=null;if(file.status==='conflict')file.status='pending';}
      parsed={bundle,embedded:new Map()};
    }else if(input.operation==='add-mod'){
      const target=await db.project.findUniqueOrThrow({where:{id:input.targetProjectId!}});const bundle=bundleSchema.parse(target.draft);
      const files=await providers[input.provider].getFiles(input.projectId!,input.versionId!);parsed={bundle:{...bundle,files:[...bundle.files,...files]},embedded:new Map()};
      for(const file of files)if(!compatible(bundle,file)){file.status='conflict';file.issue='Mod incompatível com Minecraft ou loader do projeto';}
    }else {const loaded=await parseInput(input,temp,jobId);parsed=loaded.parsed;upstream=loaded.upstream;icon=loaded.icon;}
    const bundle=parsed.bundle;await progress(jobId,{stage:'minecraft',completed:1,total:1,message:`Minecraft ${bundle.minecraft} ✓`});await progress(jobId,{stage:'loader',completed:1,total:1,message:`${bundle.loader.type} ${bundle.loader.version} ✓`});
    for(const file of bundle.files){const bytes=parsed.embedded.get(file.path);if(bytes){await checkCancelled(jobId);file.storageKey=await putObject(`assets/${file.hashes.sha256}`,bytes);file.status='resolved';}}
    await resolveReferences(parsed,jobId);
    for(const file of bundle.files){await identify(file);if(!compatible(bundle,file)){file.status='conflict';file.issue='Arquivo incompatível com Minecraft ou loader';}}
    await resolveDependencies(bundle,jobId);
    const dedup=deduplicate(bundle.files);bundle.files=dedup.files;bundle.warnings.push(...dedup.warnings);bundleSchema.parse(bundle);
    const prepared:PreparedImport={bundle,importedFrom:upstream,icon,optionalFiles:bundle.files.filter(f=>!f.required).map(f=>f.id)};
    await verifyFiles(bundle,temp,jobId,prepared,checkpoint);
    await progress(jobId,{stage:'configs',completed:bundle.files.filter(f=>f.kind==='config'&&f.status==='resolved').length,total:bundle.files.filter(f=>f.kind==='config').length,message:'Configs analisadas ✓'},prepared);
    await progress(jobId,{stage:'resourcepacks',completed:bundle.files.filter(f=>f.kind==='resourcepack'&&f.status==='resolved').length,total:bundle.files.filter(f=>f.kind==='resourcepack').length,message:'Resource packs analisados ✓'},prepared);
    await db.job.update({where:{id:jobId},data:{status:'ready',result:json(prepared),progress:json({stage:'ready',completed:bundle.files.filter(f=>f.status==='resolved').length,total:bundle.files.length,message:'Análise concluída'})}});
    return prepared;
  }catch(error){const message=error instanceof Error?error.message:'Falha na importação';const cancelled=message==='Importação cancelada';await db.job.update({where:{id:jobId},data:{status:cancelled?'cancelled':'failed',error:message,progress:json({stage:cancelled?'cancelled':'failed',completed:0,total:0,message})}});throw error;}
  finally{await rm(temp,{recursive:true,force:true});}
}
