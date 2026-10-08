import {chromium} from '@playwright/test';
import {hash} from 'argon2';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {db,closeInfra} from '../apps/api/src/infra.js';
const email=`browser-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();const admin=await db.admin.create({data:{email,passwordHash:await hash(password)}});
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://localhost:5173');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByRole('heading',{name:'Explorar Modpacks',exact:true}).waitFor();await page.getByRole('tab',{name:'Modrinth',exact:true}).click();const searched=page.waitForResponse(r=>r.url().includes('query=Cobblemon'));await page.getByLabel('Pesquisar modpacks').fill('Cobblemon');await searched;await page.locator('.pack-card:not(.skeleton)').first().waitFor();
 await mkdir('.data/screenshots',{recursive:true});await page.screenshot({path:'.data/screenshots/catalog-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.data/screenshots/catalog-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Overflow na tela mobile');
 await page.getByRole('link',{name:'Launcher Android',exact:true}).click();await page.getByRole('heading',{name:'Launcher Pojav'}).waitFor();await page.getByRole('heading',{name:'Nenhum modpack publicado'}).waitFor();
 await page.getByRole('link',{name:'Relatórios de erro',exact:true}).click();await page.getByRole('heading',{name:'Relatórios de erro',exact:true}).waitFor();assert.deepEqual(errors,[]);console.log('PASS: login e catálogo real no desktop/mobile, sem overflow ou erros JS, launcher único e relatórios.');
}finally{await browser.close();await db.admin.delete({where:{id:admin.id}});await closeInfra();}
