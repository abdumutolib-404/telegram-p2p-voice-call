// QA reproduction against current TypeScript source. No credentials or network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('../../server/node_modules/typescript');
const root = path.resolve(__dirname, '../..');
const logger = {info(){}, warn(){}, error(){}};
let failDeletion = true, attempts = 0, writes = 0;
const session = {id:'qa-expired-recording', recordingUrl:'recordings/qa-disposable.mp3', recordingExpiresAt:new Date(0)};
const env = {S3_KEY:'synthetic',S3_SECRET:'synthetic',S3_BUCKET:'synthetic-private',RECORDINGS_DIR:path.join(__dirname,'synthetic-recordings')};
class Command {constructor(input){this.input=input;}}
class S3Client {async send(){attempts++; if(failDeletion)throw Object.assign(new Error('Synthetic AccessDenied'),{name:'AccessDenied'});return {};}}
function load(relative,dependencies) {
  const filename=path.join(root,relative);
  const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  const localRequire=name=>Object.hasOwn(dependencies,name)?dependencies[name]:require(name);
  vm.runInNewContext('(function(require,module,exports){'+output+'\n})',{Buffer,AbortSignal,console}, {filename})(localRequire,module,module.exports);
  return module.exports;
}
const s3 = load('server/src/services/s3Storage.ts',{'@aws-sdk/client-s3':{S3Client,GetObjectCommand:Command,HeadObjectCommand:Command,DeleteObjectCommand:Command},'@aws-sdk/s3-request-presigner':{},'../config/env':{env},'../utils/logger':{logger}});
const storage = load('server/src/services/storage.ts',{'node-cron':{},'../config/env':{env},'../utils/logger':{logger},'./s3Storage':s3,'../config/database':{prisma:{callSession:{findMany:async()=>session.recordingUrl?[{...session}]:[],update:async({data})=>{writes++;Object.assign(session,data);return session;}}}}});
(async()=>{
  const result=await storage.purgeExpiredRecordings();
  const evidence={scenario:'S3 deletion denied',deleteAttempts:attempts,metadataWrites:writes,purgedCount:result.purgedCount,recordingTracked:session.recordingUrl!==null};
  console.log(JSON.stringify(evidence));
  fs.writeFileSync(path.join(__dirname,'retention-failure-result.json'),JSON.stringify(evidence,null,2));
  assert.equal(session.recordingUrl,'recordings/qa-disposable.mp3','Failed S3 deletion must preserve recording metadata for retry');
  assert.equal(result.purgedCount,0,'Failed S3 deletion must not be reported as purged');
  failDeletion=false;
  const retry=await storage.purgeExpiredRecordings();
  assert.equal(retry.purgedCount,1);
  assert.equal(session.recordingUrl,null);
  const again=await storage.purgeExpiredRecordings();
  assert.equal(again.purgedCount,0);
  console.log('PASS denied deletion remains tracked; later retry deletes once and clears metadata.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
