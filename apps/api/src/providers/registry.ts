import type { Bundle, ExternalProject, ExternalVersion, Provider, ResolvedFile, SearchQuery } from '@studio/core';
import { bundleSchema } from '@studio/core';
import { env } from '../config.js';
import { db } from '../infra.js';
import { ModrinthModpackProvider } from './modrinth.js';
import { CurseForgeModpackProvider } from './curseforge.js';
import { LocalModpackProvider } from './local.js';
export const modrinth=new ModrinthModpackProvider(env.MODRINTH_USER_AGENT);
export const curseforge=new CurseForgeModpackProvider(env.CURSEFORGE_API_KEY);
function external(p:{id:string;name:string;slug:string;icon:string|null;draft:unknown;updatedAt:Date}):ExternalProject{const b=bundleSchema.parse(p.draft);return {provider:'local',externalProjectId:p.id,externalVersionId:null,name:p.name,slug:p.slug,icon:p.icon,authors:['Nossa equipe'],minecraftVersions:[b.minecraft],loaders:[b.loader.type],downloads:0,license:null,websiteUrl:`${env.WEB_ORIGIN}/projects/${p.id}`,sourceUrl:null,description:'Modpack do nosso catálogo',descriptionFormat:'text',summary:`${b.files.filter(f=>f.kind==='mod').length} mods · ${b.version}`,gallery:[],categories:[],followers:null,updatedAt:p.updatedAt.toISOString(),modCount:b.files.filter(f=>f.kind==='mod').length};}
export const local=new LocalModpackProvider({
  async search(q:SearchQuery){const projects=await db.project.findMany({where:{name:{contains:q.query??'',mode:'insensitive'}},orderBy:{updatedAt:'desc'}});const filtered=projects.filter(p=>{const b=bundleSchema.parse(p.draft);return (!q.minecraft||b.minecraft===q.minecraft)&&(!q.loader||b.loader.type===q.loader);});const offset=q.offset??0,limit=q.limit??24;return {items:filtered.slice(offset,offset+limit).map(external),total:filtered.length,hasMore:offset+limit<filtered.length};},
  async detail(id:string){const p=await db.project.findUniqueOrThrow({where:{id}});return external(p);},
  async versions(id:string):Promise<ExternalVersion[]>{const releases=await db.release.findMany({where:{projectId:id},orderBy:{createdAt:'desc'}});return releases.map(r=>{const b=bundleSchema.parse(r.bundle);return {provider:'local',projectId:id,id:r.id,name:r.version,versionNumber:r.version,minecraftVersions:[b.minecraft],loaders:[b.loader.type],publishedAt:r.createdAt.toISOString(),files:[],dependencies:[]};});},
  async files(projectId:string,versionId:string):Promise<ResolvedFile[]>{const r=await db.release.findFirstOrThrow({where:{id:versionId,projectId}});return bundleSchema.parse(r.bundle).files;},
});
export const providers={modrinth,curseforge,local};
export const getProvider=(provider:Provider)=>providers[provider];
export function compatible(bundle:Bundle,file:ResolvedFile){return (!file.minecraftVersions.length||file.minecraftVersions.includes(bundle.minecraft))&&(!file.loaders.length||file.loaders.includes(bundle.loader.type));}
