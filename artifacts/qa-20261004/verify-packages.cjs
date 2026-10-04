const {spawnSync} = require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const safe=require('../../scripts/safe-environment.cjs');
const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const actions=process.argv.slice(2);
for(const action of actions) {
 const [pkg,operation]=action.split(':');
 if(!['server','client','admin','landing'].includes(pkg)||!['build','check','audit'].includes(operation))throw new Error('Invalid package verification action');
 const args=operation==='audit'?[npm,'audit','--omit=dev','--json']:[npm,'run',operation];
 // Build production artifacts without inheriting the isolated unit-test mode.
 const result=spawnSync(process.execPath,args,{cwd:path.join(root,pkg),env:safe({NODE_ENV:operation==='build'?'production':'test'}),encoding:'utf8',maxBuffer:16000000});
 const output=((result.stdout||'')+(result.stderr||'')).replace(/gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+/g,'[REDACTED]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1[REDACTED]@');
 fs.writeFileSync(path.join(__dirname,action.replace(':','-')+'.log'),output);
 if(operation==='audit') {
  try {const data=JSON.parse(result.stdout);console.log(JSON.stringify({action,exit:result.status,vulnerabilities:data.metadata?.vulnerabilities,error:data.error?.code}));}
  catch{console.log(JSON.stringify({action,exit:result.status,error:'Audit response unavailable'}));}
 } else {console.log(JSON.stringify({action,exit:result.status})); if(result.status!==0)console.log(output.slice(-3000));}
 if(result.status!==0)process.exitCode=1;
}
