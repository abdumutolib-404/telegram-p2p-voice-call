// Additional QA of the actual production image. Synthetic users, local tmpfs only.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {PrismaClient}=require('@prisma/client');
assert.equal(process.env.NODE_ENV,'production');
assert.equal(process.env.BOT_TOKEN,'123456789:synthetic-container-verification-token');
const prisma=new PrismaClient(),suffix=crypto.randomUUID(),users=[];
const root=path.resolve(require('./dist/config/env').env.RECORDINGS_DIR),filename=path.join(root,'qa-owned-'+suffix+'.mp3');
assert.equal(root,'/app/server/recordings','Only the disposable recording tmpfs is permitted');
assert.equal(path.dirname(filename),root);
const bytes=Buffer.from('Synthetic QA recording fixture; no private audio.');
let call,passed=0;
function signed(id){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(id)})});p.sort();const key=crypto.createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN).digest();p.set('hash',crypto.createHmac('sha256',key).update([...p].map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();}
async function get(alias,id,credential){return fetch('http://127.0.0.1:3001/api/calls/'+alias.replace(':id',call.id),{headers:{'X-Forwarded-Proto':'https','X-Telegram-Init-Data':credential??signed(id)},redirect:'manual',signal:AbortSignal.timeout(5000)});}
async function check(label,fn){await fn();passed++;console.log('PASS '+label);}
(async()=>{
 fs.mkdirSync(root,{recursive:true});fs.writeFileSync(filename,bytes,{flag:'wx'});
 for(let i=0;i<3;i++)users.push(await prisma.user.create({data:{telegramId:BigInt(Date.now()+i),alias:'qa-access-'+suffix+'-'+i,onboarded:true}}));
 call=await prisma.callSession.create({data:{roomName:'qa-access-'+suffix,userAId:users[0].id,userBId:users[1].id,status:'COMPLETED',duration:10,recordingUrl:'recordings/'+path.basename(filename),recordingExpiresAt:new Date(Date.now()+86400000),recordedByUserId:users[0].id}});
 for(const alias of ['recording/:id',':id/recording']){
  await check(alias+' sends the owner recording with actual signed authentication',async()=>{const r=await get(alias,users[0].telegramId);assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);});
  await check(alias+' denies the non-recorder participant',async()=>{const r=await get(alias+'?format=json',users[1].telegramId);assert.equal(r.status,403);const body=await r.json();assert.equal(body.url,undefined);assert.equal(r.headers.get('location'),null);});
  await check(alias+' denies a signed outsider',async()=>{assert.equal((await get(alias,users[2].telegramId)).status,403);});
 }
 await check('shared recorder marker preserves both participant access',async()=>{await prisma.callSession.update({where:{id:call.id},data:{recordedByUserId:'BOTH'}});assert.equal((await get('recording/:id',users[1].telegramId)).status,200);});
 await check('partial recorder identity cannot grant recording access',async()=>{await prisma.callSession.update({where:{id:call.id},data:{recordedByUserId:users[1].id+'-extra'}});assert.equal((await get('recording/:id',users[1].telegramId)).status,403);});
 await check('expired recording is unavailable to its authenticated owner',async()=>{await prisma.callSession.update({where:{id:call.id},data:{recordedByUserId:users[0].id,recordingExpiresAt:new Date(0)}});assert.equal((await get('recording/:id',users[0].telegramId)).status,404);});
 await check('forged Telegram launch is rejected',async()=>{assert.equal((await get('recording/:id',users[0].telegramId,'forged')).status,403);});
 console.log('Production recording authorization result: '+passed+' passed, 0 failed.');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{try{if(call)await prisma.callSession.delete({where:{id:call.id}});for(const u of users)await prisma.user.delete({where:{id:u.id}});if(fs.existsSync(filename))fs.unlinkSync(filename);}finally{await prisma.$disconnect();}});
