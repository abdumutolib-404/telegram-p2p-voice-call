const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const meta=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
assert.match(meta.container,/^pairtalk-audit-runtime-[a-f0-9]{8}$/);
const label=cp.execFileSync('docker',['inspect','--format','{{index .Config.Labels "pairtalk.verification"}}',meta.container],{encoding:'utf8'}).trim();assert.equal(label,'whole-audit');
const r=cp.spawnSync('docker',['exec','-i',meta.container,'node','-'],{input:fs.readFileSync(path.join(__dirname,'container-recording-check.cjs'),'utf8'),encoding:'utf8',timeout:60000,maxBuffer:16000000});
const output=(r.stdout||'')+(r.stderr||'');fs.writeFileSync(path.join(__dirname,'container-recording-check.log'),output);process.stdout.write(output);process.exitCode=r.status??1;
