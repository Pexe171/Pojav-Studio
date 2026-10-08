import { z } from 'zod';

export const providerSchema = z.enum(['modrinth', 'curseforge', 'local']);
export type Provider = z.infer<typeof providerSchema>;
export const loaderSchema = z.enum(['forge', 'fabric', 'neoforge', 'quilt', 'vanilla']);
export type Loader = z.infer<typeof loaderSchema>;
export const hashesSchema = z.object({
  sha1: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  sha512: z.string().regex(/^[a-f0-9]{128}$/i).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  md5: z.string().regex(/^[a-f0-9]{32}$/i).optional(),
});
export type Hashes = z.infer<typeof hashesSchema>;
export const environmentSchema = z.object({ client: z.enum(['required', 'optional', 'unsupported']).default('required'), server: z.enum(['required', 'optional', 'unsupported']).default('required') });
export function safePath(value: string): string {
  if (!value || value.includes('\\') || value.startsWith('/') || value.includes(':') || /[\x00-\x1f]/.test(value) || value.split('/').some(x => !x || x === '.' || x === '..' || /[. ]$/.test(x) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(x))) throw new Error(`Caminho inválido: ${value}`);
  return value;
}
export const pathSchema = z.string().max(512).refine(x => { try { safePath(x); return true; } catch { return false; } }, 'Caminho relativo inválido');
export const resolvedFileSchema = z.object({
  id: z.string(), provider: providerSchema, projectId: z.string().nullable().default(null), versionId: z.string().nullable().default(null),
  name: z.string(), filename: z.string(), path: pathSchema,
  downloadUrl: z.string().url().nullable().default(null), downloads: z.array(z.string().url()).default([]),
  hashes: hashesSchema, size: z.number().int().nonnegative(), required: z.boolean().default(true),
  environment: environmentSchema.default({client:'required',server:'required'}),
  kind: z.enum(['mod','config','resourcepack','shaderpack','other']),
  distribution: z.enum(['origin','hosted','blocked']).default('origin'),
  status: z.enum(['resolved','pending','conflict']).default('pending'),
  storageKey: z.string().nullable().default(null), issue: z.string().nullable().default(null),
  minecraftVersions: z.array(z.string()).default([]), loaders: z.array(z.string()).default([]),
  websiteUrl: z.string().url().nullable().default(null), license: z.string().nullable().default(null),
  requiredBy: z.array(z.string()).default([]),
});
export type ResolvedFile = z.infer<typeof resolvedFileSchema>;
export interface ExternalProject {
  provider: Provider; externalProjectId: string; externalVersionId: string | null;
  name: string; slug: string; icon: string | null; authors: string[]; minecraftVersions: string[]; loaders: string[];
  downloads: number; license: string | null; websiteUrl: string; sourceUrl: string | null;
  description: string; descriptionFormat: 'markdown'|'html'|'text'; summary: string; gallery: string[];
  categories: string[]; followers: number | null; updatedAt: string; modCount: number | null;
}
export interface ExternalVersion {
  provider: Provider; projectId: string; id: string; name: string; versionNumber: string;
  minecraftVersions: string[]; loaders: string[]; publishedAt: string;
  files: { filename: string; url: string | null; size: number; hashes: Hashes; primary: boolean }[];
  dependencies: Dependency[];
}
export interface Dependency { provider: Provider; projectId: string | null; versionId: string | null; required: boolean; incompatible?: boolean }
export const bundleSchema = z.object({
  schemaVersion: z.literal(1), name: z.string().min(1).max(120), version: z.string().min(1).max(100),
  minecraft: z.string().regex(/^\d+\.\d+(\.\d+)?$/), loader: z.object({ type: loaderSchema, version: z.string().min(1).max(100) }),
  files: z.array(resolvedFileSchema).max(20000), warnings: z.array(z.string()).default([]),
  performance: z.object({ enabled:z.boolean().default(false), renderDistance:z.number().int().min(2).max(32).default(6), simulationDistance:z.number().int().min(2).max(32).default(4), maxFps:z.number().int().min(30).max(240).default(60), renderer:z.string().nullable().default(null) }).default({enabled:false,renderDistance:6,simulationDistance:4,maxFps:60,renderer:null}),
});
export type Bundle = z.infer<typeof bundleSchema>;
export interface ImportedFrom { provider: Provider; projectId: string; versionId: string; name: string; websiteUrl: string }
export interface SearchQuery { query?: string; minecraft?: string; loader?: string; category?: string; sort?: 'popular'|'updated'|'relevance'|'newest'; offset?: number; limit?: number; type?: 'modpack'|'mod' }
export interface SearchPage { items: ExternalProject[]; total: number; hasMore: boolean }
export interface ProviderImport { projectId: string; versionId: string }
export interface ModpackRepositoryProvider {
  readonly id: Provider;
  searchModpacks(query: SearchQuery): Promise<SearchPage>;
  getModpack(id: string): Promise<ExternalProject>;
  getVersions(id: string, query?: SearchQuery): Promise<ExternalVersion[]>;
  getVersion(projectId: string, versionId: string): Promise<ExternalVersion>;
  getFiles(projectId: string, versionId: string): Promise<ResolvedFile[]>;
  getDependencies(projectId: string, versionId: string): Promise<Dependency[]>;
  importModpack(input: ProviderImport): Promise<ExternalVersion>;
}
export interface Category { id: string; name: string; provider: Provider }
export type JobStage = 'queued'|'analyzing'|'minecraft'|'loader'|'files'|'dependencies'|'configs'|'resourcepacks'|'ready'|'failed'|'cancelled'|'building';
export interface JobProgress { stage: JobStage; completed: number; total: number; message: string }
export const runtimeFor = (minecraft: string): 8|17|21 => {
  const [,minor='0',patch='0'] = minecraft.split('.');
  if (Number(minor)>20 || Number(minor)===20 && Number(patch)>=5) return 21;
  return Number(minor)>=18 ? 17 : Number(minor)===17 ? 17 : 8;
};
export const kindFor = (path: string): ResolvedFile['kind'] => path.startsWith('mods/') ? 'mod' : path.startsWith('config/') || path.startsWith('defaultconfigs/') ? 'config' : path.startsWith('resourcepacks/') ? 'resourcepack' : path.startsWith('shaderpacks/') ? 'shaderpack' : 'other';

export function deduplicate(files: ResolvedFile[]): { files: ResolvedFile[]; warnings: string[] } {
  const result: ResolvedFile[] = [], warnings: string[] = [];
  const redirects=new Map<string,string>();
  const combine=(kept:ResolvedFile,duplicate:ResolvedFile)=>{kept.required ||= duplicate.required;kept.requiredBy=[...new Set([...kept.requiredBy,...duplicate.requiredBy])];redirects.set(duplicate.id,kept.id);};
  for (const file of files) {
    const sameIdentity = result.find(x => file.projectId && x.provider === file.provider && x.projectId === file.projectId && x.kind === 'mod');
    const sameHash = result.find(x => (['sha512','sha256','sha1'] as const).some(h => !!file.hashes[h] && file.hashes[h]?.toLowerCase() === x.hashes[h]?.toLowerCase()));
    if (sameHash && sameHash.kind === file.kind) {
      // Configs and resources may legitimately place identical bytes at several paths.
      if (file.kind === 'mod' || sameHash.path === file.path) { combine(sameHash,file);warnings.push(`Arquivo repetido removido: ${file.path}`); continue; }
    }
    if (sameIdentity && sameIdentity.versionId === file.versionId && sameIdentity.path === file.path && !Object.keys(file.hashes).some(h=>sameIdentity.hashes[h as keyof Hashes]&&file.hashes[h as keyof Hashes]?.toLowerCase()!==sameIdentity.hashes[h as keyof Hashes]?.toLowerCase())) {combine(sameIdentity,file);continue;}
    if (sameIdentity && sameIdentity.versionId !== file.versionId) {
      file.status='conflict'; file.issue=`Duas versões do projeto ${file.projectId}`;
      sameIdentity.status='conflict'; sameIdentity.issue=file.issue;
    }
    const collision = result.find(x => x.path.toLowerCase() === file.path.toLowerCase());
    if (collision) { file.status='conflict'; collision.status='conflict'; file.issue=collision.issue=`Colisão de destino: ${file.path}`; }
    if (result.some(x => x.filename.toLowerCase() === file.filename.toLowerCase())) warnings.push(`Verificar arquivos de mesmo nome: ${file.filename}`);
    result.push(file);
  }
  for(const file of result)file.requiredBy=[...new Set(file.requiredBy.map(id=>redirects.get(id)??id))].filter(id=>id!==file.id);
  return { files: result, warnings };
}
const identity = (file: ResolvedFile) => file.kind === 'mod' && file.projectId ? `${file.provider}:${file.projectId}` : file.path;
export const fingerprint = (file: ResolvedFile|undefined): string => file ? JSON.stringify([file.path,file.versionId,file.hashes.sha512 ?? file.hashes.sha256 ?? file.hashes.sha1 ?? file.hashes.md5 ?? file.downloadUrl,file.required,file.environment]) : 'absent';
export interface FileChange { key: string; type: 'added'|'removed'|'updated'|'config'; before?: ResolvedFile; after?: ResolvedFile }
export interface MergeConflict { key: string; base?: ResolvedFile; local?: ResolvedFile; upstream?: ResolvedFile }
export function diffFiles(before: ResolvedFile[], after: ResolvedFile[]): FileChange[] {
  const a = new Map(before.map(x=>[identity(x),x])), b = new Map(after.map(x=>[identity(x),x]));
  const changes: FileChange[] = [];
  for (const key of new Set([...a.keys(),...b.keys()])) {
    const old=a.get(key), next=b.get(key);
    if (fingerprint(old)===fingerprint(next)) continue;
    changes.push({key,type:!old?'added':!next?'removed':next.kind==='config'?'config':'updated',before:old,after:next});
  }
  return changes;
}
export function mergeUpstream(base: ResolvedFile[], local: ResolvedFile[], upstream: ResolvedFile[], choices: Record<string,'local'|'upstream'> = {}) {
  const a=new Map(base.map(x=>[identity(x),x])), b=new Map(local.map(x=>[identity(x),x])), c=new Map(upstream.map(x=>[identity(x),x]));
  const files:ResolvedFile[]=[], conflicts:MergeConflict[]=[];
  for (const key of new Set([...a.keys(),...b.keys(),...c.keys()])) {
    const old=a.get(key), ours=b.get(key), theirs=c.get(key);
    const localChanged=fingerprint(old)!==fingerprint(ours), remoteChanged=fingerprint(old)!==fingerprint(theirs);
    let chosen=ours;
    if (!localChanged) chosen=theirs;
    else if (remoteChanged && fingerprint(ours)!==fingerprint(theirs)) {
      if (!choices[key]) conflicts.push({key,base:old,local:ours,upstream:theirs});
      chosen=choices[key]==='upstream'?theirs:ours;
    }
    if(chosen) files.push(chosen);
  }
  return {files,conflicts,changes:diffFiles(base,upstream)};
}
export const manifestSchema = z.object({
  schemaVersion:z.literal(1), projectId:z.string(), releaseId:z.string(), name:z.string(), version:z.string(),
  minecraft:z.string(), loader:z.object({type:loaderSchema,version:z.string()}), runtime:z.union([z.literal(8),z.literal(17),z.literal(21)]),
  files:z.array(z.object({id:z.string(),path:pathSchema,size:z.number().int().nonnegative(),hashes:hashesSchema,downloadEndpoint:z.string(),provider:providerSchema})),
  performance:bundleSchema.shape.performance,
});
export type ReleaseManifest = z.infer<typeof manifestSchema>;
