import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bundleSchema, environmentSchema, hashesSchema, kindFor, pathSchema, resolvedFileSchema, safePath, type Bundle, type Loader, type ResolvedFile } from '@studio/core';
const mrpack=z.object({formatVersion:z.literal(1),game:z.literal('minecraft'),versionId:z.string().min(1),name:z.string().min(1),dependencies:z.record(z.string()),files:z.array(z.object({path:pathSchema,hashes:hashesSchema.refine(h=>!!h.sha1&&!!h.sha512,'MRPACK exige SHA-1 e SHA-512'),downloads:z.array(z.string().url()).min(1),fileSize:z.number().int().nonnegative(),env:environmentSchema.optional()}))});
const cfManifest=z.object({manifestType:z.literal('minecraftModpack'),manifestVersion:z.literal(1),name:z.string().min(1),version:z.string().min(1),minecraft:z.object({version:z.string(),modLoaders:z.array(z.object({id:z.string(),primary:z.boolean().optional()})).min(1)}),files:z.array(z.object({projectID:z.number().int().positive(),fileID:z.number().int().positive(),required:z.boolean()})),overrides:z.string().default('overrides')});
export interface ParsedPack { bundle:Bundle; embedded:Map<string,Buffer>; curseforgeRefs?:{projectId:string;versionId:string;required:boolean}[] }
function readJson(bytes:Buffer|undefined){if(!bytes||bytes.length>4194304)throw new Error('Manifest ausente ou muito grande');try{return JSON.parse(bytes.toString('utf8'));}catch{throw new Error('Manifest JSON inválido');}}
function embeddedFile(path:string,bytes:Buffer):ResolvedFile{return resolvedFileSchema.parse({id:randomUUID(),provider:'local',name:path.split('/').at(-1),filename:path.split('/').at(-1),path,downloadUrl:null,hashes:{sha1:createHash('sha1').update(bytes).digest('hex'),sha512:createHash('sha512').update(bytes).digest('hex'),sha256:createHash('sha256').update(bytes).digest('hex')},size:bytes.length,kind:kindFor(path),distribution:'hosted',status:'pending'});}
function overrides(entries:Map<string,Buffer>,prefixes:string[]){const result=new Map<string,Buffer>();for(const prefix of prefixes){safePath(prefix);for(const [path,bytes] of entries){if(path.startsWith(`${prefix}/`)){const relative=safePath(path.slice(prefix.length+1));result.set(relative,bytes);}}}return result;}
export function parseMrpack(entries:Map<string,Buffer>):ParsedPack{
  const index=mrpack.parse(readJson(entries.get('modrinth.index.json')));
  const minecraft=index.dependencies.minecraft;if(!minecraft)throw new Error('Minecraft ausente nas dependências');
  const mapping:Record<string,Loader>={'forge':'forge','neoforge':'neoforge','fabric-loader':'fabric','quilt-loader':'quilt'};
  const loaders=Object.entries(index.dependencies).filter(([key])=>key in mapping);if(loaders.length>1)throw new Error('Pacote declara loaders incompatíveis');
  const chosen=loaders[0];const warnings=Object.keys(index.dependencies).filter(k=>k!=='minecraft'&&!(k in mapping)).map(k=>`Dependência de runtime não suportada: ${k}`);
  const embedded=overrides(entries,['overrides','client-overrides']);
  const files=index.files.filter(f=>f.env?.client!=='unsupported').map(f=>resolvedFileSchema.parse({id:randomUUID(),provider:'local',name:f.path.split('/').at(-1),filename:f.path.split('/').at(-1),path:f.path,downloadUrl:f.downloads[0],downloads:f.downloads,hashes:f.hashes,size:f.fileSize,required:f.env?.client!=='optional',environment:f.env,kind:kindFor(f.path),distribution:'origin',status:'pending',minecraftVersions:[minecraft],loaders:[chosen?mapping[chosen[0]]:'vanilla']}));
  const effective=files.filter(f=>!embedded.has(f.path));effective.push(...[...embedded].map(([path,bytes])=>embeddedFile(path,bytes)));
  return {bundle:bundleSchema.parse({schemaVersion:1,name:index.name,version:index.versionId,minecraft,loader:{type:chosen?mapping[chosen[0]]:'vanilla',version:chosen?chosen[1]:minecraft},files:effective,warnings}),embedded};
}
export function parseCurseforge(entries:Map<string,Buffer>):ParsedPack{
  const manifest=cfManifest.parse(readJson(entries.get('manifest.json')));
  const primaries=manifest.minecraft.modLoaders.filter(l=>l.primary);if(primaries.length>1||(!primaries.length&&manifest.minecraft.modLoaders.length>1))throw new Error('Loader principal ambíguo');
  const main=primaries[0]??manifest.minecraft.modLoaders[0]!;
  const match=/^(forge|fabric|neoforge|quilt)-(.+)$/.exec(main.id);if(!match)throw new Error(`Loader não suportado: ${main.id}`);
  const embedded=overrides(entries,[manifest.overrides]);
  return {bundle:bundleSchema.parse({schemaVersion:1,name:manifest.name,version:manifest.version,minecraft:manifest.minecraft.version,loader:{type:match[1],version:match[2]},files:[...embedded].map(([path,bytes])=>embeddedFile(path,bytes)),warnings:[]}),embedded,curseforgeRefs:manifest.files.map(f=>({projectId:String(f.projectID),versionId:String(f.fileID),required:f.required}))};
}
export function parseInternal(bytes:Buffer):ParsedPack{
  const input=bundleSchema.parse(readJson(bytes));
  // A user-supplied manifest cannot grant access to an internal object or claim prior verification.
  const files=input.files.map(f=>({...f,id:randomUUID(),storageKey:null,status:'pending' as const,distribution:f.downloadUrl?'origin' as const:'blocked' as const,issue:f.downloadUrl?null:'Arquivo local precisa ser enviado novamente'}));
  return {bundle:{...input,files},embedded:new Map()};
}
export function parseArchive(entries:Map<string,Buffer>):ParsedPack{
  if(entries.has('modrinth.index.json')&&entries.has('manifest.json'))throw new Error('Pacote com formatos ambíguos');
  if(entries.has('modrinth.index.json'))return parseMrpack(entries);
  if(entries.has('manifest.json'))return parseCurseforge(entries);
  throw new Error('ZIP não contém um manifest de modpack suportado');
}
