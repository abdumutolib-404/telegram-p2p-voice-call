// Report locations and types only. Never output matched credential values.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
function git(args){return cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64000000});}
const patterns=[['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],['Telegram token',/\b\d{8,12}:[A-Za-z0-9_-]{35}\b/],['Private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['Google API key',/\bAIza[0-9A-Za-z_-]{35}\b/],['Authenticated remote',/https?:\/\/[^\s/@]+:[^\s/@]+@github\.com/]];
const files=[...new Set(git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean))];
const current=[];
for(const file of files){const absolute=path.join(root,file);if(!fs.existsSync(absolute)||fs.statSync(absolute).size>5000000)continue;const data=fs.readFileSync(absolute);if(data.includes(0))continue;const lines=data.toString('utf8').split(/\r?\n/);for(let i=0;i<lines.length;i++)for(const [type,pattern]of patterns)if(pattern.test(lines[i]))current.push({file,line:i+1,type});}
const committedEnvironmentFiles=git(['ls-files','-z']).split('\0').filter(x=>/(^|\/)\.env(?:\.|$)/.test(x)&&!x.endsWith('.example'));
const history=[];const commits=git(['rev-list','--all']).trim().split('\n').filter(Boolean);
for(const revision of commits){const result=cp.spawnSync('git',['grep','-I','-n','-E','(gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,}|[0-9]{8,12}:[A-Za-z0-9_-]{35}|AIza[0-9A-Za-z_-]{35}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)',revision,'--'],{cwd:root,encoding:'utf8',maxBuffer:16000000});for(const line of (result.stdout||'').split('\n').filter(Boolean)){const match=line.match(/^([^:]+):(.+?):(\d+):(.*)$/);if(!match)continue;for(const [type,pattern]of patterns)if(pattern.test(match[4]))history.push({revision:match[1],file:match[2],line:Number(match[3]),type});}}
const ignored=cp.spawnSync('git',['check-ignore','server/.env','client/.env','admin/.env','landing/.env'],{cwd:root,encoding:'utf8'}).stdout.trim().split('\n');
const synthetic=x=>x.file==='server/src/__tests__/pii_redaction.test.ts'&&x.line===35&&x.type==='Private key';
const review={knownSyntheticFindings:current.filter(synthetic).length+history.filter(synthetic).length,unreviewedCurrentFindings:current.filter(x=>!synthetic(x)),unreviewedHistoryFindings:history.filter(x=>!synthetic(x)),classification:'The private-key fixture contains a deliberately truncated fake header for log-redaction testing.',localGitRemoteIncident:'Two pre-existing embedded GitHub tokens were exposed by the initial remote diagnostic. Embedded remote authentication was removed from local Git configuration. User revocation/rotation remains required.'};
const report={scope:'Pattern scan of tracked/untracked nonignored text and all reachable Git commits; not proof that every secret format is detectable',filesScanned:files.length,commitsScanned:commits.length,current,committedEnvironmentFiles,history,environmentFilesIgnored:ignored,review};
fs.writeFileSync(path.join(__dirname,'secret-scan.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({filesScanned:files.length,commitsScanned:commits.length,current,committedEnvironmentFiles,historyFindings:history.length,environmentFilesIgnored:ignored},null,2));
