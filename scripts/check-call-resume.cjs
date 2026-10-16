// Real route, signature validation, PostgreSQL membership reads and JWT creation.
// No media connection or provider request is made. Only owned loopback fixtures.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
if(process.argv[2]!=='--child'){
  const runtime=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),url=new URL(runtime.DATABASE_URL);
  if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.port!=='55432'||url.pathname!=='/pairtalk_check')throw Error('Use the owned loopback verification database.');
  const env=require('./safe-environment.cjs')({DATABASE_URL:runtime.DATABASE_URL,NODE_ENV:'development'});
  const result=spawnSync(process.execPath,[__filename,'--child'],{env,encoding:'utf8',maxBuffer:1024*1024});
  process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');process.exitCode=result.status??1;
}else{
  const express=require('../server/node_modules/express'),request=require('../server/node_modules/supertest');
  const {prisma,disconnectDB}=require('../server/dist/config/database'),{env}=require('../server/dist/config/env');
  const {currentTerms}=require('../server/dist/services/terms'),calls=require('../server/dist/routes/calls').default;
  const {initDataLockdownMiddleware}=require('../server/dist/middleware/initDataLockdown');
  const {requireRegisteredMember}=require('../server/dist/middleware/registeredMember');
  const app=express();app.use('/calls',initDataLockdownMiddleware,requireRegisteredMember,calls);const users=[],sessions=[];
  function signed(id){const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(id),first_name:'Synthetic'})});params.sort();const text=[...params].map(([k,v])=>`${k}=${v}`).join('\n');const key=crypto.createHmac('sha256','WebAppData').update(env.BOT_TOKEN).digest();params.set('hash',crypto.createHmac('sha256',key).update(text).digest('hex'));return params.toString();}
  (async()=>{try{
    for(let i=0;i<3;i++)users.push(await prisma.user.create({data:{telegramId:BigInt('0x'+crypto.randomBytes(6).toString('hex')),alias:'Resume-'+crypto.randomUUID(),onboarded:true,termsAcceptedVersion:currentTerms.version,termsDocumentSha256:currentTerms.sha256,termsAcceptedAt:new Date()}}));
    const call=await prisma.callSession.create({data:{roomName:'resume-verification-'+crypto.randomUUID(),userAId:users[0].id,userBId:users[1].id,status:'ACTIVE',mediaAuthorizedAt:new Date()}});sessions.push(call.id);
    const get=()=>request(app).get('/calls/active').set('x-telegram-init-data',signed(users[0].telegramId));
    const normal=await get();assert.equal(normal.status,200);assert.equal(normal.body.hasActiveCall,true);assert.equal(normal.body.roomName,call.roomName);
    const grant=JSON.parse(Buffer.from(normal.body.livekitToken.split('.')[1],'base64url').toString()).video;assert.equal(grant.room,call.roomName);assert.equal(grant.canSubscribe,false);
    assert.deepEqual((await request(app).get('/calls/active').set('x-telegram-init-data',signed(users[2].telegramId))).body,{hasActiveCall:false});
    const valid={onboarded:true,termsAcceptedVersion:currentTerms.version,isBanned:false,isPermanentlyBanned:false,bannedUntil:null};
    for(const [state,code]of [[{isPermanentlyBanned:true},'banned'],[{isBanned:true},'suspended'],[{isBanned:true,bannedUntil:new Date(Date.now()+60000)},'suspended'],[{isBanned:false,bannedUntil:new Date(Date.now()+60000)},'suspended'],[{onboarded:false},'registration_required'],[{termsAcceptedVersion:'synthetic-old'},'terms_required']]){
      await prisma.user.update({where:{id:users[0].id},data:{...valid,...state}});const r=await get();assert.equal(r.status,403);assert.equal(r.body.code,code);assert.equal(r.body.livekitToken,undefined);
    }
    await prisma.user.update({where:{id:users[0].id},data:{...valid,isBanned:true,bannedUntil:new Date(Date.now()-60000)}});assert.equal((await get()).status,200);
    console.log('PASS real PostgreSQL/HTTP: six restricted membership states deny fresh media credentials; normal/expired-suspension recovery works; outsiders receive no room; JWT remains subscription-gated.');
  }finally{
    await prisma.callSession.deleteMany({where:{id:{in:sessions}}});await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});await disconnectDB();
  }})().catch(error=>{console.error(error.message);process.exitCode=1;});
}
