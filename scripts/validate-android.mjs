import {cp,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {applyOverlay} from './launcher-overlay.mjs';
const root='/builds/validation';await mkdir(root,{recursive:true});await cp('/launcher',root,{recursive:true});
await applyOverlay(root,{apiUrl:'https://pojav-api.davidhenrique.dev.br',name:'Pojav Studio',applicationId:'br.dev.pojavstudio.launcher',versionCode:1,versionName:'1.0',keystore:'/secrets/studio.jks',keyAlias:'studio'});
const child=spawn('./gradlew',['--no-daemon',':app_pojavlauncher:assembleRelease'],{cwd:root,stdio:'inherit',env:process.env});
child.on('exit',code=>process.exit(code??1));child.on('error',error=>{console.error(error);process.exit(1);});
