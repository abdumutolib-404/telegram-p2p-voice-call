// Real database checks. This script cannot target a hosted database or call a
// payment/media provider; their acknowledgements are synthetic inputs.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),{spawnSync}=require('node:child_process');
function verify(value){const u=new URL(value);if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='55432'||u.pathname!=='/pairtalk_check')throw new Error('Use the dedicated loopback verification database.');}
if(process.argv[2]!=='--child'){
  const bindings=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));verify(bindings.DATABASE_URL);
  const env=require('./safe-environment.cjs')({DATABASE_URL:bindings.DATABASE_URL,NODE_ENV:'development'});
  const result=spawnSync(process.execPath,[__filename,'--child'],{env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  let output=(result.stdout||'')+(result.stderr||'');for(const key of ['DATABASE_URL','BOT_TOKEN','JWT_SECRET','MASTER_PASSWORD','LIVEKIT_API_SECRET'])if(env[key])output=output.split(env[key]).join('[REDACTED]');
  process.stdout.write(output);process.exitCode=result.status??1;
}else{
  verify(process.env.DATABASE_URL);if(process.env.NODE_ENV!=='development')throw new Error('The real database adapter is required.');
  const {prisma,connectDB,disconnectDB}=require('../server/dist/config/database');
  const {disconnectRedis}=require('../server/dist/config/redis');
  const {currentTerms}=require('../server/dist/services/terms');
  const {readCreditConfiguration}=require('../server/dist/services/creditConfiguration');
  const credits=require('../server/dist/services/credits');
  const {admitCall}=require('../server/dist/services/callAdmission');
  const {completeCallSession}=require('../server/dist/services/callCompletion');
  const {commitRecordingStart}=require('../server/dist/services/recordingLifecycle');
  const ids=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
  const user=id=>prisma.user.findUniqueOrThrow({where:{id}});
  const call=()=>admitCall(ids[0],ids[1],`credit-check-${crypto.randomUUID()}`,'ACTIVE');
  const complete=async(s,seconds=0)=>{if(seconds)await prisma.callSession.update({where:{id:s.id},data:{mediaAuthorizedAt:new Date(Date.now()-seconds*1000)}});return completeCallSession(s.id,{endedAt:new Date(),duration:seconds});};
  (async()=>{
    try{
      await connectDB();
      for(const [i,id]of ids.entries())await prisma.user.create({data:{id,telegramId:BigInt(Date.now())+BigInt(i),alias:`credit-check-${id}`,onboarded:true,termsAcceptedVersion:currentTerms.version,termsDocumentSha256:currentTerms.sha256,termsAcceptedAt:new Date()}});
      assert.equal((await user(ids[0])).callCredits,3);
      const {catalog}=await readCreditConfiguration(),buyer=await user(ids[0]),other=await user(ids[2]);
      const stock=()=>prisma.$queryRaw`SELECT pairtalk_recording_capacity_remaining() AS remaining`;
      assert.equal((await stock())[0].remaining,60);
      const races=await Promise.allSettled(Array.from({length:4},(_,i)=>credits.createCreditOrder(ids[i%3],crypto.randomUUID(),{calls:0,recordings:1,storage:false},catalog.revision)));
      assert.equal(races.filter(x=>x.status==='fulfilled').length,3);
      assert.equal((await stock())[0].remaining,12);
      await prisma.creditOrder.updateMany({where:{userId:{in:ids}},data:{expiresAt:new Date(Date.now()-1000)}});
      assert.equal((await stock())[0].remaining,60);
      console.log('PASS four simultaneous recording orders produce only three capacity holds; expired unpaid invoices release stock.');
      const requestId=crypto.randomUUID(),basket={calls:2,recordings:1,storage:true};
      const order=await credits.createCreditOrder(buyer.id,requestId,basket,catalog.revision);
      assert.equal((await credits.createCreditOrder(buyer.id,requestId,basket,catalog.revision)).id,order.id);
      await assert.rejects(credits.createCreditOrder(other.id,requestId,basket,catalog.revision));
      await assert.rejects(credits.createCreditOrder(buyer.id,requestId,{...basket,calls:3},catalog.revision));
      await assert.rejects(credits.createCreditOrder(buyer.id,crypto.randomUUID(),basket,'0'.repeat(64)));
      await assert.rejects(credits.settleCreditOrder(order.id,buyer.telegramId,order.starsAmount,'XTR','unapproved'));
      await assert.rejects(credits.authorizeCreditOrder(order.id,other.telegramId,order.starsAmount,'XTR','wrong-owner'));
      await assert.rejects(credits.authorizeCreditOrder(order.id,buyer.telegramId,order.starsAmount+1,'XTR','wrong-amount'));
      await credits.authorizeCreditOrder(order.id,buyer.telegramId,order.starsAmount,'XTR','synthetic-checkout');
      await assert.rejects(credits.authorizeCreditOrder(order.id,buyer.telegramId,order.starsAmount,'XTR','duplicate-checkout'));
      await prisma.creditOrder.update({where:{id:order.id},data:{expiresAt:new Date(Date.now()-1000)}});
      assert.equal((await stock())[0].remaining,44);
      const settlements=await Promise.all(Array.from({length:8},()=>credits.settleCreditOrder(order.id,buyer.telegramId,order.starsAmount,'XTR','synthetic-charge-'+order.id)));
      assert.equal(settlements.filter(x=>!x.duplicate).length,1);assert.equal((await user(buyer.id)).callCredits,5);assert.equal((await user(buyer.id)).recordingCredits,1);
      console.log('PASS immutable quotes, invoice ownership/amount checks and eight concurrent payment replays.');
      await assert.rejects(credits.refundCreditOrder(order.id,buyer.telegramId,{refundStarPayment:async()=>{throw new Error('synthetic timeout');}}));
      assert.equal((await user(buyer.id)).callCredits,3);assert.equal((await prisma.creditOrder.findUnique({where:{id:order.id}})).status,'REFUND_PENDING');
      let refunds=0;const provider={refundStarPayment:async()=>{refunds++;return true;}};
      await credits.refundCreditOrder(order.id,buyer.telegramId,provider);await credits.refundCreditOrder(order.id,buyer.telegramId,provider);
      assert.equal(refunds,1);assert.equal((await user(buyer.id)).callCredits,3);
      console.log('PASS refund recovery removes credits once and confirms the same original payment.');
      const attempts=await Promise.allSettled([call(),call()]);assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
      const admitted=attempts.find(x=>x.status==='fulfilled').value;assert.equal((await user(ids[0])).callCredits,2);
      await complete(admitted);assert.equal((await user(ids[0])).callCredits,3);assert.equal((await user(ids[0])).creditCallActive,false);
      const charged=await call();await complete(charged,20);await complete(charged,20);
      assert.equal((await user(ids[0])).callCredits,2);assert.equal((await user(ids[0])).dailyCallsUsed,0);
      assert.equal((await prisma.creditUsage.findUnique({where:{callId_userId_kind:{callId:charged.id,userId:ids[0],kind:'CALL'}}})).status,'CONSUMED');
      console.log('PASS concurrent call admission, failed-connection restoration and replay-safe completion.');
      await prisma.user.updateMany({where:{id:{in:ids.slice(0,2)}},data:{callCredits:10}});
      await prisma.user.update({where:{id:ids[0]},data:{recordingCredits:2,storageCredits:1}});
      const recorded=await call();await prisma.callSession.update({where:{id:recorded.id},data:{mediaAuthorizedAt:new Date(Date.now()-20000)}});
      const prepared=await prisma.$queryRaw`SELECT pairtalk_prepare_recording_capacity(${recorded.id},${ids[0]},15,true) AS reserved`;
      assert.equal(prepared[0].reserved,true);
      assert(await commitRecordingStart(recorded.id,ids[0],null,{egressId:'synthetic-egress-'+recorded.id,relativeUrl:'recordings/'+recorded.id+'.mp3'}));
      const stored=await prisma.recordingSegment.findFirst({where:{callId:recorded.id}});assert.deepEqual(stored.storedOwnerIds,[ids[0]]);assert.equal(stored.expiresAt.getTime()-stored.createdAt.getTime(),30*86400000);
      await prisma.recordingSegment.update({where:{id:stored.id},data:{status:'READY'}});await complete(recorded,20);await credits.reconcileRecordingCredits();
      assert.equal((await user(ids[0])).recordingCredits,1);assert.equal((await user(ids[0])).storageCredits,0);
      const failed=await call();await prisma.callSession.update({where:{id:failed.id},data:{mediaAuthorizedAt:new Date(Date.now()-20000)}});
      assert(await commitRecordingStart(failed.id,ids[0],null,{egressId:'synthetic-egress-'+failed.id,relativeUrl:'recordings/'+failed.id+'.mp3'}));
      const temporary=await prisma.recordingSegment.findFirst({where:{callId:failed.id}});assert.equal(temporary.expiresAt.getTime()-temporary.createdAt.getTime(),86400000);
      await prisma.recordingSegment.update({where:{id:temporary.id},data:{status:'FAILED'}});await complete(failed,20);await credits.reconcileRecordingCredits();await credits.reconcileRecordingCredits();
      assert.equal((await user(ids[0])).recordingCredits,1);
      assert.equal((await stock())[0].remaining,12);
      await assert.rejects(credits.createCreditOrder(ids[2],crypto.randomUUID(),{calls:0,recordings:1,storage:false},catalog.revision));
      await credits.createCreditOrder(ids[2],crypto.randomUUID(),{calls:1,recordings:0,storage:false},catalog.revision);
      const last=await call();await prisma.callSession.update({where:{id:last.id},data:{mediaAuthorizedAt:new Date(Date.now()-20000)}});
      assert.equal((await prisma.$queryRaw`SELECT pairtalk_prepare_recording_capacity(${last.id},${ids[2]},15,true) AS reserved`)[0].reserved,false);
      assert.equal((await prisma.$queryRaw`SELECT pairtalk_prepare_recording_capacity(${last.id},${ids[0]},15,true) AS reserved`)[0].reserved,true);
      assert(await commitRecordingStart(last.id,ids[0],null,{egressId:'synthetic-egress-'+last.id,relativeUrl:'recordings/'+last.id+'.mp3'}));
      await prisma.recordingSegment.updateMany({where:{callId:last.id},data:{status:'READY'}});await complete(last,20);await credits.reconcileRecordingCredits();
      assert.equal((await user(ids[0])).recordingCredits,0);
      const blocked=await call();await prisma.callSession.update({where:{id:blocked.id},data:{mediaAuthorizedAt:new Date()}});
      assert.equal((await prisma.$queryRaw`SELECT pairtalk_prepare_recording_capacity(${blocked.id},${ids[0]},15,false) AS reserved`)[0].reserved,false);
      await complete(blocked);
      console.log('PASS authorized invoices retain capacity after expiry, existing wallets redeem their held stock, and exhausted capacity blocks provider startup.');
      await prisma.user.update({where:{id:ids[1]},data:{callCredits:0}});const before=(await user(ids[0])).callCredits;await assert.rejects(call());assert.equal((await user(ids[0])).callCredits,before);
      console.log('PASS recording/storage reservation, creation-based expiry, successful export charging, failed export restoration and empty-wallet rollback.');
    }finally{
      await prisma.postCallJob.deleteMany({where:{call:{userAId:{in:ids}}}});
      await prisma.callSession.deleteMany({where:{OR:[{userAId:{in:ids}},{userBId:{in:ids}}]}});
      const orders=await prisma.creditOrder.findMany({where:{userId:{in:ids}},select:{id:true}});
      await prisma.auditLog.deleteMany({where:{targetId:{in:orders.map(x=>x.id)}}});await prisma.creditOrder.deleteMany({where:{userId:{in:ids}}});await prisma.user.deleteMany({where:{id:{in:ids}}});
      await disconnectRedis();await disconnectDB();
    }
  })().catch(error=>{console.error(error.message);process.exitCode=1;});
}
