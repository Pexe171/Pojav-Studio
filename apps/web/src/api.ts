import type { Bundle, ImportedFrom, JobProgress, ReleaseManifest } from '@studio/core';
export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(`/api/v1${path}`,{...options,credentials:'include',headers:{'x-studio-request':'1',...(options.body&&!(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...options.headers}});
  const result=await response.json().catch(()=>({message:'O servidor não respondeu como esperado'}));if(!response.ok)throw new ApiError(response.status,result.message??'Não foi possível concluir');return result as T;
}
export const post=<T>(path:string,body:unknown={})=>api<T>(path,{method:'POST',body:JSON.stringify(body)});
export interface Project {id:string;name:string;slug:string;icon:string|null;customVersion:string;draft:Bundle;importedFrom:ImportedFrom|null;upstreamSnapshot:Bundle|null;modified:boolean;revision:number;updatedAt:string;releases:Release[];builds:Build[]}
export interface Release {id:string;version:string;createdAt:string;manifest:ReleaseManifest}
export interface Build {id:string;jobId:string;status:string;versionCode:number;storageKey:string|null;sha256:string|null}
export interface Job {id:string;kind:string;status:string;projectId:string|null;progress:JobProgress;error:string|null;createdAt:string;result:{bundle:Bundle;icon:string|null;optionalFiles:string[];importedFrom:ImportedFrom|null;buildId?:string;url?:string}|null;input:{targetProjectId?:string;revision?:number}}
export interface Settings {curseforgeConfigured:boolean;buildEnabled:boolean;validatedTargets:{minecraft:string;loader:string;loaderVersion:string}[]}
export const sourceName=(source:string)=>({curseforge:'CurseForge',modrinth:'Modrinth',local:'Local'}[source]??source);
export const bytes=(size:number)=>size>=1024**3?`${(size/1024**3).toFixed(2)} GB`:size>=1024**2?`${(size/1024**2).toFixed(1)} MB`:`${Math.ceil(size/1024)} KB`;
export const number=(value:number)=>Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(value);
