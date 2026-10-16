// Real PostgreSQL inventory races, synthetic Telegram responses only. This
// runner cannot target a hosted database or send a message to a real channel.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
function verify(value){const u=new URL(value);if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='55432'||u.pathname!=='/pairtalk_check')throw new Error('Use the dedicated loopback verification database.');}
if(process.argv[2]!=='--child'){
  const bindings=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));verify(bindings.DATABASE_URL);
  const env=require('./safe-environment.cjs')({DATABASE_URL:bindings.DATABASE_URL,NODE_ENV:'development',MANUAL_PAYMENT_CARD_HOLDER:'Synthetic verification payee',MANUAL_PAYMENT_INSTRUCTIONS:'Synthetic payment instructions. Never transfer real money.'});
  const result=spawnSync(process.execPath,[__filename,'--child'],{env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  let output=(result.stdout||'')+(result.stderr||'');for(const key of ['DATABASE_URL','BOT_TOKEN','JWT_SECRET','MASTER_PASSWORD','LIVEKIT_API_SECRET'])if(env[key])output=output.split(env[key]).join('[REDACTED]');
  process.stdout.write(output);process.exitCode=result.status??1;
}else{
  verify(process.env.DATABASE_URL);
  const {prisma,connectDB,disconnectDB}=require('../server/dist/config/database'),{disconnectRedis}=require('../server/dist/config/redis');
  const {currentTerms}=require('../server/dist/services/terms'),{readCreditConfiguration}=require('../server/dist/services/creditConfiguration');
  const campaigns=require('../server/dist/services/packCampaigns'),{reconcilePackChannel}=require('../server/dist/services/packChannel');
  const {createPracticeOrder,cancelPendingPracticeCheckout,attachPracticePaymentProof,approvePracticePayment}=require('../server/dist/services/practiceCheckout'),credits=require('../server/dist/services/credits');
  const {claimStarterGift}=require('../server/dist/services/starterGift');
  const ids=Array.from({length:6},()=>crypto.randomUUID()),campaignIds=[];
  const sent=[],edited=[],deleted=[];let message=100;
  const bot={api:{
    getMe:async()=>({id:999000,username:'FixturePracticeBot'}),
    getChatMember:async()=>({status:'administrator',can_post_messages:true}),
    sendMessage:async(chat,text,options)=>{assert.equal(chat,'-1004318847810');sent.push({text,options});await new Promise(resolve=>setTimeout(resolve,10));return {message_id:++message,date:Math.floor(Date.now()/1000)};},
    editMessageText:async(chat,id,text,options)=>{assert.equal(chat,'-1004318847810');edited.push({id,text,options});return true;},
    deleteMessage:async(chat,id)=>{assert.equal(chat,'-1004318847810');deleted.push(id);return true;},
  }};
  const user=id=>prisma.user.findUniqueOrThrow({where:{id}});
  let catalog;
  const make=async(percent=20,maximumClaims=2)=>{
    const campaign=await campaigns.createPackCampaign({requestId:crypto.randomUUID(),revision:catalog.revision,calls:1,recordings:0,retention:false,minutes:15,percent,maximumClaims,validMinutes:60},'synthetic-admin',bot);
    campaignIds.push(campaign.id);return campaign;
  };
  const order=(campaign,userId,requestId=crypto.randomUUID())=>createPracticeOrder(userId,requestId,{calls:1,recordings:0,retention:false,minutes:15},catalog.revision,'XTR',campaign.id);
  const pay=async(o)=>{const u=await user(o.userId);await credits.authorizeCreditOrder(o.id,u.telegramId,o.starsAmount,'XTR','synthetic-precheckout-'+o.id);return credits.settleCreditOrder(o.id,u.telegramId,o.starsAmount,'XTR','synthetic-charge-'+o.id);};
  (async()=>{try{
    await connectDB();
    for(const [i,id]of ids.entries())await prisma.user.create({data:{id,telegramId:BigInt(Date.now())+BigInt(i),alias:'channel-check-'+id,onboarded:true,...(i===5?{}:{callCredits:0}),termsAcceptedVersion:currentTerms.version,termsDocumentSha256:currentTerms.sha256,termsAcceptedAt:new Date()}});
    catalog=(await readCreditConfiguration()).packs;
    const campaign=await make();
    await Promise.all([reconcilePackChannel(bot),reconcilePackChannel(bot)]);
    assert.equal(sent.length,1);assert.equal((await prisma.packCampaign.findUniqueOrThrow({where:{id:campaign.id}})).status,'ACTIVE');
    assert.match(sent[0].options.reply_markup.inline_keyboard[0][0].url,/\?startapp=offer_/);assert.match(sent[0].text,/<s>3,500 UZS<\/s>/);
    const races=await Promise.allSettled(ids.slice(0,5).map(id=>order(campaign,id)));
    assert.equal(races.filter(r=>r.status==='fulfilled').length,2);
    const orders=races.filter(r=>r.status==='fulfilled').map(r=>r.value);
    for(const o of orders){assert.equal(o.uzsAmount,2800);assert.equal(o.starsAmount,15);}
    for(const o of orders){await pay(o);const u=await user(o.userId);await Promise.all(Array.from({length:6},()=>credits.settleCreditOrder(o.id,u.telegramId,o.starsAmount,'XTR','synthetic-charge-'+o.id)));assert.equal((await user(o.userId)).callCredits,1);}
    const sold=await prisma.packCampaign.findUniqueOrThrow({where:{id:campaign.id}});assert.equal(sold.claimedCount,2);assert.equal(sold.status,'SOLD_OUT');
    await reconcilePackChannel(bot);assert(deleted.includes(sold.telegramMessageId));assert(edited.some(e=>e.id===sold.telegramMessageId&&e.options.reply_markup.inline_keyboard.length===0&&e.text.includes('Available: 0/2')));
    await assert.rejects(order(campaign,orders[0].userId));
    console.log('PASS two workers publish once; five buyers cannot oversell two slots; payment replays fulfill once and sold-out reconciliation removes buttons and deletes the post.');
    const once=await make(20,3);await reconcilePackChannel(bot);
    const first=await order(once,ids[0]),resumed=await order(once,ids[0]);assert.equal(first.id,resumed.id);await pay(first);await assert.rejects(order(once,ids[0]));
    console.log('PASS repeated taps resume the same current checkout and a person cannot claim the campaign again after payment.');
    const free=await make(100,1);await reconcilePackChannel(bot);const freeRaces=await Promise.allSettled(ids.slice(0,5).map(id=>order(free,id)));
    assert.equal(freeRaces.filter(r=>r.status==='fulfilled').length,1);const freeOrder=freeRaces.find(r=>r.status==='fulfilled').value;assert.equal(freeOrder.status,'PAID');assert.equal(freeOrder.starsAmount,0);
    assert.equal((await order(free,freeOrder.userId,freeOrder.requestId)).id,freeOrder.id);assert.equal((await prisma.packCampaign.findUniqueOrThrow({where:{id:free.id}})).claimedCount,1);
    console.log('PASS concurrent 100% offers grant one free pack, with no zero-value provider invoice or second claim.');
    const uncertain=await make(20,1);let attempts=0;
    const uncertainBot={api:{...bot.api,sendMessage:async()=>{attempts++;throw new Error('Synthetic lost acknowledgement');}}};
    await reconcilePackChannel(uncertainBot);await reconcilePackChannel(uncertainBot);assert.equal(attempts,1);assert.equal((await prisma.packCampaign.findUniqueOrThrow({where:{id:uncertain.id}})).messageState,'UNCONFIRMED');
    await campaigns.recoverCampaignMessage(uncertain.id,999,'synthetic-admin');await reconcilePackChannel(bot);assert.equal((await prisma.packCampaign.findUniqueOrThrow({where:{id:uncertain.id}})).status,'ACTIVE');
    console.log('PASS an uncertain send is never blindly repeated; linking the existing post requires an acknowledged edit before activation.');
    const expires=await make(20,1);await reconcilePackChannel(bot);const late=await order(expires,ids[1]),buyer=await user(ids[1]);
    await credits.authorizeCreditOrder(late.id,buyer.telegramId,late.starsAmount,'XTR','synthetic-expiry-checkout');const authorized=await prisma.creditOrder.findUniqueOrThrow({where:{id:late.id}}),deadline=new Date(authorized.authorizedAt.getTime()+1);
    await prisma.packCampaign.update({where:{id:expires.id},data:{expiresAt:deadline}});await prisma.creditOrder.update({where:{id:late.id},data:{expiresAt:deadline}});await new Promise(resolve=>setTimeout(resolve,5));await reconcilePackChannel(bot);
    await assert.rejects(order(expires,ids[2]));await credits.settleCreditOrder(late.id,buyer.telegramId,late.starsAmount,'XTR','synthetic-expiry-charge');assert.equal((await prisma.packCampaign.findUniqueOrThrow({where:{id:expires.id}})).claimedCount,1);
    console.log('PASS expiry disables new claims while an already-authorized in-flight payment still receives its reserved pack.');
    const old=await make(20,1);await reconcilePackChannel(bot);await prisma.packCampaign.update({where:{id:old.id},data:{expiresAt:new Date(Date.now()-1000),telegramMessageAt:new Date(Date.now()-49*3600000)}});await reconcilePackChannel(bot);
    assert.equal((await prisma.packCampaign.findUniqueOrThrow({where:{id:old.id}})).messageState,'MANUAL_CLEANUP');
    console.log('PASS a post outside Telegram’s deletion window is disabled with no claim buttons and an honest manual-cleanup state.');
    assert((await campaigns.listPackCampaigns(ids[0])).every(o=>o.status==='ACTIVE'));
    const manualCampaign=await make(20,1);await reconcilePackChannel(bot);
    const manualOrder=await createPracticeOrder(ids[2],crypto.randomUUID(),{calls:1,recordings:0,retention:false,minutes:15},catalog.revision,'UZS',manualCampaign.id);
    await assert.rejects(order(manualCampaign,ids[3]));
    await cancelPendingPracticeCheckout(ids[2],manualOrder.id);
    const secondManual=await createPracticeOrder(ids[3],crypto.randomUUID(),{calls:1,recordings:0,retention:false,minutes:15},catalog.revision,'UZS',manualCampaign.id);
    const receipt=await prisma.manualPaymentRequest.findUniqueOrThrow({where:{creditOrderId:secondManual.id}}),manualBuyer=await user(ids[3]);
    await attachPracticePaymentProof(receipt.id,manualBuyer.telegramId,'{"fileId":"synthetic-validated-receipt"}');await assert.rejects(cancelPendingPracticeCheckout(ids[3],secondManual.id));
    const approvals=await Promise.allSettled(Array.from({length:5},()=>approvePracticePayment(receipt.id,'synthetic-admin')));
    assert.equal(approvals.filter(r=>r.status==='fulfilled').length,1);assert.equal((await prisma.packCampaign.findUniqueOrThrow({where:{id:manualCampaign.id}})).claimedCount,1);
    console.log('PASS cancelling an unauthorised checkout releases the slot, submitted receipts cannot be cancelled across currency paths, and five manual approvals consume one campaign claim.');
    const giftUser=await user(ids[5]);assert.equal(giftUser.callCredits,0);assert.equal(giftUser.starterGiftGrantedAt,null);
    let member=false;
    const membershipBot={api:{...bot.api,getChatMember:async(_channel,id)=>id===999000?{status:'administrator',can_post_messages:true}:id===Number(giftUser.telegramId)?{status:member?'member':'left'}:{status:'left'}}};
    assert.equal((await claimStarterGift(giftUser.id,membershipBot)).claimed,false);assert.equal((await user(giftUser.id)).callCredits,0);
    member=true;const gifts=await Promise.all(Array.from({length:8},()=>claimStarterGift(giftUser.id,membershipBot)));
    assert.equal(gifts.filter(g=>g.claimed).length,1);assert.equal((await user(giftUser.id)).callCredits,3);
    member=false;assert.equal((await claimStarterGift(giftUser.id,membershipBot)).alreadyClaimed,true);assert.equal((await user(giftUser.id)).callCredits,3);
    const untouched=await user(ids[4]);await assert.rejects(claimStarterGift(untouched.id,{api:{...bot.api,getChatMember:async()=>({status:'member'})}}));assert.equal((await user(untouched.id)).callCredits,untouched.callCredits);
    console.log('PASS new profiles start at zero; non-members and unverifiable membership receive no gift; eight simultaneous member claims grant exactly three units once, including after leaving and rejoining.');
  }finally{
    const orders=await prisma.creditOrder.findMany({where:{userId:{in:ids}},select:{id:true}}),orderIds=orders.map(o=>o.id);
    await prisma.notificationJob.deleteMany({where:{dedupeKey:{in:orderIds.flatMap(id=>[`pack-checkout:${id}`,`pack-receipt:${id}`])}}});
    await prisma.auditLog.deleteMany({where:{targetId:{in:[...campaignIds,...orderIds,...ids]}}});
    await prisma.manualPaymentRequest.deleteMany({where:{userId:{in:ids}}});await prisma.creditOrder.deleteMany({where:{userId:{in:ids}}});await prisma.packClaim.deleteMany({where:{campaignId:{in:campaignIds}}});await prisma.packCampaign.deleteMany({where:{id:{in:campaignIds}}});await prisma.user.deleteMany({where:{id:{in:ids}}});
    await disconnectDB();await disconnectRedis();
  }})().catch(error=>{console.error(error.stack);process.exitCode=1;});
}
