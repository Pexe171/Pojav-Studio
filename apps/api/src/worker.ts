import { Worker } from 'bullmq';
import { env } from './config.js';
import { db,redis,ensureBucket,closeInfra } from './infra.js';
import { processImport } from './importer/process.js';
import { processBuild } from './services/android.js';
import { reconcileJobs } from './services/jobs.js';
import { expireDiagnostics } from './services/launcher.js';
await db.$connect();await ensureBucket();await reconcileJobs();
const workers:Worker[]=[];
if(process.env.WORKER_ROLE!=='builds')workers.push(new Worker('imports',job=>processImport(String(job.data.id)),{connection:redis,concurrency:2}));
if(env.BUILD_ENABLED&&process.env.WORKER_ROLE!=='imports')workers.push(new Worker('android-builds',job=>processBuild(String(job.data.id)),{connection:redis,concurrency:1,lockDuration:120000}));
for(const worker of workers){worker.on('error',e=>console.error('Worker:',e.message));worker.on('failed',(job,error)=>console.error('Job falhou:',job?.id,error.message));}
console.log('Workers ativos:',workers.map(w=>w.name).join(', '));
const reconciliation=setInterval(()=>void reconcileJobs().catch(e=>console.error('Reconciliação:',e.message)),30000);
const cleanup=setInterval(()=>void expireDiagnostics().catch(e=>console.error('Retenção:',e.message)),3600000);await expireDiagnostics();
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{clearInterval(reconciliation);clearInterval(cleanup);void Promise.all(workers.map(w=>w.close())).then(closeInfra).then(()=>process.exit(0));});
