// Real HTTP handlers and Prisma against an owned, synthetic production container.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
const database=new URL(process.env.DATABASE_URL);
if(process.env.NODE_ENV!=='production'||process.env.BOT_TOKEN!==['123456789','synthetic'.repeat(5)].join(':')||!/^pairtalk-check-pg-[a-f0-9]{8}$/.test(database.hostname)||database.pathname!=='/pairtalk_check')throw Error('Owned container bindings required.');
const prisma=new PrismaClient(),suffix=crypto.randomUUID(),logs=[],contests=[],jobs=[];let user,originalPlans;
const headers={'X-Forwarded-Proto':'https',Authorization:'Bearer '+jwt.sign({role:'admin',telegramId:'12345678'},process.env.JWT_SECRET,{expiresIn:'5m'}),'Content-Type':'application/json'};
async function request(route,method='GET',body){return fetch('http://127.0.0.1:3001'+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'manual'});}
async function main(){
 const now=new Date();
 const rows=await prisma.auditLog.createMany({data:Array.from({length:105},(_,index)=>({action:'ENGINEERING_AUDIT_'+suffix,adminId:'synthetic',targetId:suffix,reason:index===104?'older needle '+suffix:'recent row '+suffix,createdAt:new Date(now.getTime()-index*1000)}))});assert.equal(rows.count,105);
 logs.push(suffix);
 const page=await request('/api/admin/audit-logs?page=2&search='+suffix);assert.equal(page.status,200);const data=await page.json();assert.equal(data.total,105);assert.equal(data.logs.length,5);assert.equal(data.totalPages,2);
 const filtered=await request('/api/admin/audit-logs?page=1&search='+encodeURIComponent('older needle '+suffix));assert.equal(filtered.status,200);assert.equal((await filtered.json()).total,1);
 const invalid=await request('/api/admin/audit-logs?page=0');assert.equal(invalid.status,400);
 console.log('PASS audit filters query saved records, paginate beyond 100, and reject invalid inputs');
 const contest=await prisma.contest.create({data:{title:'Engineering contest '+suffix,isActive:true,startsAt:new Date(Date.now()-10000),endsAt:new Date(Date.now()-1000)}});contests.push(contest.id);
 const status=await request('/api/admin/contest');assert.equal(status.status,200);const current=await status.json();assert.equal(current.status,'ENDED');assert.equal(current.contest.id,contest.id);
 const launch=await request('/api/admin/contest','POST',{title:'Replacement '+suffix,durationDays:1,isActive:true});assert.equal(launch.status,409);assert.equal((await prisma.contest.findUnique({where:{id:contest.id}})).isActive,true);
 const concluded=await request('/api/admin/contest/conclude','POST',{contestId:contest.id});assert.equal(concluded.status,200);assert.equal((await prisma.contest.findUnique({where:{id:contest.id}})).isActive,false);
 console.log('PASS ended contests remain awardable and cannot be overwritten by a new launch');
 user=await prisma.user.create({data:{telegramId:BigInt('0x'+crypto.randomBytes(6).toString('hex')),alias:'Engineering plan '+suffix}});
 const configuration=await request('/api/admin/plans');assert.equal(configuration.status,200);originalPlans=await configuration.json();
 const changed=await request('/api/admin/plans','PUT',{PLUS:{dailyLimit:7,callsLimit:7,maxDuration:17,recordingLimit:3,retentionDays:9,subscriptionDurationDays:60}});assert.equal(changed.status,200);
 const published=await request('/api/public/plans');assert.equal(published.status,200);const plus=(await published.json()).plans.find(plan=>plan.id==='PLUS');assert(plus);
 const assigned=await request('/api/admin/users/'+user.id+'/plan','PATCH',{plan:'PLUS',dailyLimit:null,maxDuration:null,recordingLimitOverride:null,retentionOverride:null});assert.equal(assigned.status,200);
 const updated=await prisma.user.findUnique({where:{id:user.id}});assert.equal(updated.dailyLimit,plus.calls);assert.equal(updated.maxDuration,plus.maxCallMinutes);assert.equal(updated.subscriptionDurationDays,plus.validityDays);assert.equal(updated.recordingLimitOverride,null);assert.equal(updated.retentionOverride,null);assert(updated.subscriptionStartsAt);
 assert.equal(plus.calls,7);assert.equal(plus.maxCallMinutes,17);assert.equal(plus.validityDays,60);assert.equal(plus.recordings,3);assert.equal(plus.retentionDays,9);
 console.log('PASS subscription assignment uses published limits and persists purchased validity');
 // Occupy the shared crawler lease so the background worker cannot contact vendors.
 const Redis=require('ioredis'),redis=new Redis(process.env.REDIS_URL),lease='engineering-'+suffix;
 try{
  assert.equal(await redis.set('pairtalk:crawler:lock',lease,'PX',60000,'NX'),'OK');
  const queued=await request('/api/admin/ielts/crawler/run','POST',{});assert.equal(queued.status,202);const admission=await queued.json();assert.equal(admission.status,'QUEUED');jobs.push(admission.jobId);
  const saved=await request('/api/admin/ielts/crawler/jobs/'+admission.jobId);assert.equal(saved.status,200);assert(['QUEUED','PROCESSING'].includes((await saved.json()).result.status));
  const unsafe=await request('/api/admin/ielts/crawler/run','POST',{customUrl:'http://169.254.169.254/'});assert.equal(unsafe.status,400);
  console.log('PASS manual crawling returns a durable job and rejects private targets');
 }finally{await prisma.crawlerSyncLog.deleteMany({where:{id:{in:jobs}}});await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,'pairtalk:crawler:lock',lease);redis.disconnect();}
}
main().catch(error=>{console.error('Container engineering check failed:',error.message);process.exitCode=1;}).finally(async()=>{
 if(originalPlans) {const restored=await request('/api/admin/plans','PUT',originalPlans);assert.equal(restored.status,200,'Restore captured fixture configuration.');}
 await prisma.auditLog.deleteMany({where:{OR:[{targetId:{in:logs}},{targetId:{in:contests}},...(user?[{targetId:user.id}]:[])]}});
 await prisma.contest.deleteMany({where:{id:{in:contests}}});
 if(user)await prisma.user.delete({where:{id:user.id}});
 await prisma.$disconnect();
});
