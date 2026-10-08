export class ProviderError extends Error {
  constructor(public provider:string,public status:number,message:string){super(message);}
}
const cache=new Map<string,{expires:number;value:unknown}>();
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export async function apiJson<T>(provider:string,url:string,headers:Record<string,string>,method='GET',body?:unknown):Promise<T>{
  const key=`${provider}:${url}:${method}:${JSON.stringify(body)}`;
  const found=cache.get(key);if(found && found.expires>Date.now())return found.value as T;
  for(let attempt=0;attempt<4;attempt++){
    let response:Response;
    try { response=await fetch(url,{method,headers:{Accept:'application/json',...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)}); }
    catch(error){if(attempt===3)throw new ProviderError(provider,503,'Não foi possível acessar a origem');await delay(500*2**attempt);continue;}
    if(response.status===429 || response.status>=500){if(attempt<3){await response.body?.cancel();const seconds=Number(response.headers.get('retry-after'));await delay(Number.isFinite(seconds)&&seconds>0?Math.min(seconds*1000,15000):500*2**attempt);continue;}}
    if(!response.ok){await response.body?.cancel();throw new ProviderError(provider,response.status,response.status===403?'Download ou acesso não autorizado pela origem':`A origem respondeu HTTP ${response.status}`);}
    const value=await response.json() as T;
    if(cache.size>1000)cache.clear();cache.set(key,{expires:Date.now()+60000,value});return value;
  }
  throw new ProviderError(provider,503,'Origem temporariamente indisponível');
}
