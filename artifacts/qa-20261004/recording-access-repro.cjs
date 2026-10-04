// Exercise the actual recording route with synthetic authenticated identities.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const ts=require('../../server/node_modules/typescript');
const express=require('../../server/node_modules/express');
const request=require('../../server/node_modules/supertest');
const session={id:'qa-recording',recordingUrl:'recordings/qa-private.mp3',recordingExpiresAt:new Date(Date.now()+86400000),createdAt:new Date(),userAId:'qa-owner',userBId:'qa-peer',recordedByUserId:'qa-owner',userA:{id:'qa-owner',telegramId:1001n},userB:{id:'qa-peer',telegramId:1002n}};
const deps={'express':express,'../config/database':{prisma:{callSession:{findUnique:async()=>session}}},'../config/env':{env:{RECORDINGS_DIR:path.join(__dirname,'synthetic-recordings')}},'../middleware/initDataLockdown':{initDataLockdownMiddleware:(req,res,next)=>{req.telegramUser={id:Number(req.headers['x-qa-user'])};next();}},'../config/livekit':{},'../services/plan':{getEffectiveEntitlement:()=>({retentionDays:30})},'../types/canonical':{createCanonicalError:(code,message)=>({code,message})},'../services/s3Storage':{isS3Configured:()=>true,checkS3ObjectExists:async()=>({exists:true,size:512}),generatePresignedDownloadUrl:async()=>'https://synthetic.invalid/private-qa.mp3'},'../utils/logger':{logger:{error(){}}}};
const filename=path.join(root,'server/src/routes/calls.ts');
const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const moduleResult={exports:{}};
function sourceRequire(name){
 if(Object.hasOwn(deps,name))return deps[name];
 if(name==='../utils/recordingAccess'){
  const helperPath=path.join(root,'server/src/utils/recordingAccess.ts');
  const helper=ts.transpileModule(fs.readFileSync(helperPath,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const loaded={exports:{}};vm.runInNewContext('(function(require,module,exports){'+helper+'\n})',{}, {filename:helperPath})(require,loaded,loaded.exports);return loaded.exports;
 }
 return require(name);
}
vm.runInNewContext('(function(require,module,exports){'+output+'\n})',{Buffer,AbortSignal,console},{filename})(sourceRequire,moduleResult,moduleResult.exports);
const app=express();app.use('/api/calls',moduleResult.exports.default);
(async()=>{
 const owner=await request(app).get('/api/calls/recording/qa-recording?format=json').set('x-qa-user','1001');
 const peer=await request(app).get('/api/calls/recording/qa-recording?format=json').set('x-qa-user','1002');
 const outsider=await request(app).get('/api/calls/recording/qa-recording?format=json').set('x-qa-user','1003');
 const evidence={scenario:'Recording owned by A, requested by authenticated non-recorder B',ownerStatus:owner.status,nonRecorderStatus:peer.status,nonRecorderReceivesDownloadUrl:Boolean(peer.body.url),outsiderStatus:outsider.status};
 console.log(JSON.stringify(evidence));fs.writeFileSync(path.join(__dirname,'recording-access-result.json'),JSON.stringify(evidence,null,2));
 assert.equal(owner.status,200);assert.equal(outsider.status,403);
 assert.equal(peer.status,403,'Recording API must enforce the same recorder ownership as the bot');
 console.log('PASS recorder can retrieve, non-recorder participant and outsider are denied.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
