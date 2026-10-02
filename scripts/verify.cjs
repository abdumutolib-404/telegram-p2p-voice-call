const {spawnSync} = require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const safe=require('./safe-environment.cjs');
const action=process.argv[2]||'unit';
const root=path.resolve(__dirname,'..'), server=path.join(root,'server');
const commands={unit:[path.join(server,'node_modules/vitest/vitest.mjs'),'run','--testTimeout','15000',...process.argv.slice(3)], build:[path.join(server,'node_modules/typescript/bin/tsc'),'--noEmit'], compile:[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),'run','build']};
if(!commands[action])throw new Error('Use unit, build or compile');
const result=spawnSync(process.execPath,commands[action],{cwd:server,env:safe(),encoding:'utf8',maxBuffer:16*1024*1024});
const output=((result.stdout||'')+(result.stderr||'')).replace(/gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+/g,'[REDACTED]').replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/g,'https://[REDACTED]@');
if(process.env.VERIFICATION_LOG) {fs.writeFileSync(process.env.VERIFICATION_LOG,output); const lines=output.replace(/\u001b\[[0-9;]*m/g,'').split('\n'); console.log(lines.filter(line=>/^\s*(Test Files|Tests |Duration|FAIL |AssertionError)/.test(line)).join('\n') || lines.slice(-12).join('\n'));}
else process.stdout.write(output);
process.exitCode=result.status??1;
