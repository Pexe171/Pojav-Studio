import type { ExternalProject, ExternalVersion, ModpackRepositoryProvider, ResolvedFile, SearchPage, SearchQuery } from '@studio/core';
export interface LocalCatalog { search(q:SearchQuery):Promise<SearchPage>; detail(id:string):Promise<ExternalProject>; versions(id:string):Promise<ExternalVersion[]>; files(projectId:string,versionId:string):Promise<ResolvedFile[]> }
export class LocalModpackProvider implements ModpackRepositoryProvider {
  readonly id='local' as const;
  constructor(private catalog:LocalCatalog){}
  searchModpacks(q:SearchQuery){return this.catalog.search(q);}
  getModpack(id:string){return this.catalog.detail(id);}
  getVersions(id:string){return this.catalog.versions(id);}
  async getVersion(projectId:string,versionId:string){const v=(await this.getVersions(projectId)).find(v=>v.id===versionId);if(!v)throw new Error('Release local não encontrada');return v;}
  getFiles(projectId:string,versionId:string){return this.catalog.files(projectId,versionId);}
  async getDependencies(){return [];}
  importModpack(input:{projectId:string;versionId:string}){return this.getVersion(input.projectId,input.versionId);}
}
