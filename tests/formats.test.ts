import {describe,it,expect} from 'vitest';
import {bundleSchema,deduplicate,mergeUpstream,resolvedFileSchema,safePath} from '@studio/core';
import {parseMrpack,parseCurseforge,parseInternal,parseArchive} from '../apps/api/src/importer/parsers';
const json=(x:unknown)=>Buffer.from(JSON.stringify(x));
const entry=(path:string,env:unknown={client:'required',server:'required'})=>({path,hashes:{sha1:'a'.repeat(40),sha512:'b'.repeat(128)},downloads:['https://cdn.modrinth.com/test.jar'],fileSize:5,env});
const index={formatVersion:1,game:'minecraft',name:'Teste',versionId:'1.0',dependencies:{minecraft:'1.20.1','fabric-loader':'0.16.0'},files:[entry('mods/test.jar')]};
const file=(id:string,hash:string,path=`mods/${id}.jar`)=>resolvedFileSchema.parse({id,provider:'modrinth',projectId:id,versionId:hash,name:id,filename:path.split('/').at(-1),path,hashes:{sha1:hash.repeat(40)},size:1,kind:path.startsWith('config/')?'config':'mod'});
describe('formatos de modpack',()=>{
  it('respeita o ambiente cliente e a prioridade de client-overrides',()=>{
    const pack=parseMrpack(new Map([['modrinth.index.json',json({...index,files:[entry('mods/server.jar',{client:'unsupported',server:'required'}),entry('mods/optional.jar',{client:'optional',server:'required'})]})],['overrides/config/a.json',Buffer.from('base')],['client-overrides/config/a.json',Buffer.from('cliente')],['server-overrides/config/server.json',Buffer.from('server')]]));
    expect(pack.bundle.files.map(f=>f.path)).toEqual(['mods/optional.jar','config/a.json']);expect(pack.bundle.files[0]?.required).toBe(false);expect(pack.embedded.get('config/a.json')?.toString()).toBe('cliente');expect(pack.bundle.performance.enabled).toBe(false);
  });
  it('exige os dois hashes do MRPACK e rejeita loaders conflitantes',()=>{
    expect(()=>parseMrpack(new Map([['modrinth.index.json',json({...index,files:[{...entry('mods/a.jar'),hashes:{sha1:'a'.repeat(40)}}]})]]))).toThrow();
    expect(()=>parseMrpack(new Map([['modrinth.index.json',json({...index,dependencies:{...index.dependencies,forge:'47.0.0'}})]]))).toThrow(/loaders/);
  });
  it('normaliza referências CurseForge e seleciona o loader primário',()=>{
    const pack=parseCurseforge(new Map([['manifest.json',json({manifestType:'minecraftModpack',manifestVersion:1,name:'CF',version:'2',minecraft:{version:'1.20.1',modLoaders:[{id:'forge-47.3.0',primary:true}]},files:[{projectID:123,fileID:456,required:true}],overrides:'overrides'})]]));
    expect(pack.curseforgeRefs).toEqual([{projectId:'123',versionId:'456',required:true}]);expect(pack.bundle.loader).toEqual({type:'forge',version:'47.3.0'});
  });
  it('um JSON importado não pode conceder acesso a objetos internos',()=>{
    const f=file('x','a');const pack=parseInternal(json(bundleSchema.parse({schemaVersion:1,name:'X',version:'1',minecraft:'1.20.1',loader:{type:'fabric',version:'0.16'},files:[{...f,status:'resolved',distribution:'hosted',storageKey:'private/object'}]})));
    expect(pack.bundle.files[0]?.storageKey).toBeNull();expect(pack.bundle.files[0]?.status).toBe('pending');expect(pack.bundle.files[0]?.distribution).toBe('blocked');
  });
  it('rejeita um ZIP com ambos os manifests',()=>expect(()=>parseArchive(new Map([['manifest.json',json({})],['modrinth.index.json',json(index)]]))).toThrow(/ambíguos/));
});
describe('normalização e atualização',()=>{
  it.each(['../mods/a.jar','/a.jar','C:/a.jar','mods\\a.jar','config/NUL.txt','mods/a.jar.','a//b'])('rejeita caminho perigoso %s',path=>expect(()=>safePath(path)).toThrow());
  it('deduplica o mesmo mod de duas fontes por hash e preserva configs em caminhos diferentes',()=>{
    const a=file('a','a'),b={...file('b','a'),provider:'curseforge' as const};expect(deduplicate([a,b]).files).toHaveLength(1);
    expect(deduplicate([file('c','b','config/a.json'),file('d','b','config/b.json')]).files).toHaveLength(2);
  });
  it('marca duas versões do mesmo projeto como conflito',()=>{const a=file('a','a'),b={...file('a','b'),path:'mods/a-v2.jar'};expect(deduplicate([a,b]).files.every(f=>f.status==='conflict')).toBe(true);});
  it('preserva mods locais e exige escolha quando os dois lados alteram uma config',()=>{
    const base=file('c','a','config/settings.json'),ours=file('c','b','config/settings.json'),upstream=file('c','c','config/settings.json'),extra=file('custom','d');
    const diff=mergeUpstream([base],[ours,extra],[upstream]);expect(diff.conflicts).toHaveLength(1);expect(diff.files).toContain(extra);
    const resolved=mergeUpstream([base],[ours,extra],[upstream],{'config/settings.json':'upstream'});expect(resolved.conflicts).toHaveLength(0);expect(resolved.files).toEqual([upstream,extra]);
  });
});
