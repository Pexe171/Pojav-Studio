import yauzl from 'yauzl';
import { safePath } from '@studio/core';
export interface ArchiveLimits { maxBytes:number; maxEntries:number; maxEntryBytes?:number }
export async function readArchive(path:string,limits:ArchiveLimits):Promise<Map<string,Buffer>>{
  return new Promise((resolve,reject)=>{
    yauzl.open(path,{lazyEntries:true,decodeStrings:true,validateEntrySizes:true,strictFileNames:true},(error,zip)=>{
      if(error||!zip)return reject(error??new Error('Arquivo ZIP inválido'));
      const entries=new Map<string,Buffer>();const names=new Set<string>();let bytes=0,count=0,ended=false;
      const fail=(err:unknown)=>{if(ended)return;ended=true;zip.close();reject(err);};
      zip.on('error',fail);zip.on('end',()=>{if(!ended){ended=true;resolve(entries);}});
      zip.on('entry',(entry:yauzl.Entry)=>{
        try{
          if(++count>limits.maxEntries)throw new Error('Arquivo excede o limite de entradas');
          const directory=entry.fileName.endsWith('/'),name=directory?entry.fileName.slice(0,-1):entry.fileName;safePath(name);
          const folded=name.toLowerCase();if(names.has(folded))throw new Error(`Entrada duplicada: ${name}`);names.add(folded);
          const unixType=(entry.externalFileAttributes>>>16)&0xf000;
          if(unixType&&unixType!==0x8000&&unixType!==0x4000)throw new Error('Links e entradas especiais não são permitidos');
          if(entry.generalPurposeBitFlag&1)throw new Error('Pacote criptografado não suportado');
          if(directory){zip.readEntry();return;}
          bytes+=entry.uncompressedSize;if(bytes>limits.maxBytes||entry.uncompressedSize>(limits.maxEntryBytes??268435456))throw new Error('Arquivo excede o limite de expansão');
          if(entry.uncompressedSize>1048576 && entry.uncompressedSize/Math.max(1,entry.compressedSize)>1000)throw new Error('Taxa de compressão excessiva');
          zip.openReadStream(entry,(err,stream)=>{
            if(err||!stream)return fail(err??new Error('Entrada inválida'));
            const chunks:Buffer[]=[];let actual=0;
            stream.on('data',(chunk:Buffer)=>{actual+=chunk.length;if(actual>entry.uncompressedSize){stream.destroy(new Error('Entrada excede o tamanho declarado'));return;}chunks.push(chunk);});
            stream.on('error',fail);stream.on('end',()=>{if(ended)return;if(actual!==entry.uncompressedSize)return fail(new Error('Entrada truncada'));entries.set(entry.fileName,Buffer.concat(chunks));zip.readEntry();});
          });
        }catch(err){fail(err);}
      });zip.readEntry();
    });
  });
}
