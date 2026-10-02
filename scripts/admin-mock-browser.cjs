// Local-only browser fixture server. Never forwards requests or accepts production credentials.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'admin/dist');
let mode='normal',mutationCount=0;const reports=[];
const createdAt='2026-10-01T12:00:00.000Z';
const candidate={id:'synthetic-user',telegramId:'90000001',alias:'Synthetic Candidate',planTier:'PLUS',status:'active',band:6.5,subscores:{fc:6.5,lr:6,gra:6.5,p:7},dailyLimit:10,maxDuration:30,dailyCallsUsed:0,recordingLimitOverride:0,retentionOverride:null,subscriptionStatus:'ACTIVE',subscriptionExpiresAt:'2026-11-01T00:00:00.000Z',createdAt};
const payment={id:'synthetic-payment',userId:candidate.id,telegramId:candidate.telegramId,alias:candidate.alias,plan:'PLUS',planTier:'PLUS',amountUzs:1,status:'PENDING',orderNumber:'TEST-001',paymentProof:'protected',createdAt};
const appeal={id:'synthetic-appeal',userId:candidate.id,telegramId:candidate.telegramId,alias:candidate.alias,status:'PENDING',banReason:'Synthetic case',appealText:'Please review this synthetic account.',createdAt};
const plans=Object.fromEntries(['FREE','PLUS','PRO','BOSS'].map((tier,index)=>[tier,{name:tier,description:'Synthetic fixture',active:true,starsPrice:index,uzsPrice:index,maxDuration:[15,30,60,90][index],dailyLimit:[3,10,25,50][index],callsLimit:[3,10,25,50][index],recordingLimit:index,retentionDays:[1,7,30,90][index],subscriptionDurationDays:index?30:0}]));
const stats={totalUsers:3,dau:1,mau:3,activeCalls:0,totalCalls:2,totalMinutesSpoken:4,starsRevenue:{totalStars:1,totalUsd:0.01,transactionCount:1,refundedCount:0,refundedStars:0,monthlyHistory:[]},manualUzsRevenue:{approvedUzs:0,transactionCount:0,pendingUzs:1,pendingCount:1,rejectedUzs:0,rejectedCount:0}};
const toolbar=`<aside id="qa" style="position:fixed;bottom:0;right:0;z-index:10000;overflow-wrap:anywhere;background:#fff;color:#111;padding:6px;max-width:100%;font:12px sans-serif"><strong>SYNTHETIC QA</strong> <button id="qa-axe">Accessibility/layout</button> <select id="qa-mode" aria-label="Synthetic scenario"><option>normal</option><option>mutation-failure</option><option>partial</option><option>forbidden</option><option>expired</option></select><output id="qa-result" style="display:block;max-height:70px;overflow:auto" aria-live="polite"></output></aside><script src="/qa/axe.js"></script><script>
document.getElementById('qa-mode').onchange=async e=>{await fetch('/qa/mode',{method:'POST',body:e.target.value});};
document.getElementById('qa-axe').onclick=async()=>{const result=await axe.run({exclude:[['#qa'],['.qa-modal-tool']]});const report={screen:document.querySelector('main h1')?.textContent,dialog:document.querySelector('dialog[open] h2')?.textContent,path:location.pathname,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))};await fetch('/qa/report',{method:'POST',body:JSON.stringify(report)});document.getElementById('qa-result').textContent=JSON.stringify(report);};new MutationObserver(()=>{for(const dialog of document.querySelectorAll('dialog[open]'))if(!dialog.querySelector('.qa-modal-tool')){const button=document.createElement('button');button.className='qa-modal-tool';button.textContent='Check dialog accessibility';button.onclick=()=>document.getElementById('qa-axe').onclick();dialog.append(button);}}).observe(document.body,{childList:true,subtree:true});</script>`;
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:4181'),p=url.pathname;let body='';for await(const chunk of req)body+=chunk;
 if(p==='/qa/axe.js'){res.writeHead(200,{'Content-Type':'application/javascript'});res.end(fs.readFileSync(path.join(root,'admin/node_modules/axe-core/axe.min.js')));return;}
 if(p==='/qa/mode'){mode=body;return json(res,{mode});}if(p==='/qa/report'){reports.push(JSON.parse(body));return json(res,{success:true});}if(p==='/qa/results')return json(res,{mode,mutationCount,reports});
 if(p.startsWith('/api/')){
  if(p.includes('/auth/password'))return json(res,{success:true,challengeId:'synthetic-challenge'});
  if(p.includes('/auth/otp'))return json(res,{success:true,jwtToken:'synthetic-local-only'});
  if(mode==='expired')return json(res,{error:'Synthetic expired session'},401);if(mode==='forbidden')return json(res,{error:'Synthetic forbidden action'},403);
  if(req.method!=='GET'){mutationCount++;await new Promise(r=>setTimeout(r,1200));if(mode==='mutation-failure')return json(res,{error:'Synthetic mutation failed; entered values retained.'},409);if(p.includes('/users/'))return json(res,candidate);return json(res,{success:true,...(p.endsWith('/plans')?plans:{})});}
  if(p==='/api/admin/stats')return json(res,stats);
  if(p==='/api/admin/plans')return json(res,plans);
  if(p==='/api/admin/users'){const q=url.searchParams.get('query');await new Promise(r=>setTimeout(r,q==='old'?900:30));return json(res,q==='new'?[{...candidate,alias:'New search result'}]:q==='old'?[{...candidate,alias:'Old search result'}]:[candidate]);}
  if(p.includes('/payments/manual/')){res.writeHead(200,{'Content-Type':'application/pdf'});res.end('%PDF-1.4\nSynthetic preview');return;}
  if(p==='/api/admin/payments/manual')return json(res,[{...payment,...(url.searchParams.get('tab')==='refunds'?{status:'REFUND_PENDING',refundProof:'protected'}:{})}]);
  if(p==='/api/admin/appeals')return json(res,[appeal]);
  if(p.includes('/telemetry/')){if(mode==='partial')return json(res,{error:'Synthetic telemetry unavailable'},503);if(p.endsWith('/health'))return json(res,{database:{status:'healthy',latencyMs:1},redis:{status:'healthy',latencyMs:1},bot:{status:'disabled'},livekit:{status:'unavailable'}});if(p.endsWith('/queue'))return json(res,{waitingCount:0});if(p.endsWith('/active-calls'))return json(res,{activeCallsCount:0,rooms:[]});return json(res,{recentErrors:[]});}
  if(p==='/api/admin/audit-logs')return json(res,[{id:'synthetic-audit',action:'STARS_REFUND_FAILED',adminId:'synthetic',targetId:candidate.id,createdAt,beforeState:'{}',afterState:'{}',reason:'Synthetic test'}]);
  if(p==='/api/admin/contest')return json(res,{isActive:false,contest:null,leaderboard:[],totalReferrals:0,activeBonusCalls:0});
  if(p==='/api/admin/ielts/topics')return json(res,{success:true,topics:[{id:'topic',name:'Synthetic topic',slug:'synthetic-topic',relevance:'HIGH',isActive:true,_count:{questions:150}}]});
  if(p==='/api/admin/ielts/questions'){const page=Number(url.searchParams.get('page')||1),part=url.searchParams.get('part')||'PART_1';return json(res,{success:true,questions:Array.from({length:50},(_,i)=>({id:'q-'+((page-1)*50+i+1),questionText:'Synthetic question '+((page-1)*50+i+1),part,questionType:part==='PART_2'?'CUE_CARD':'GENERAL',topicId:'topic',topic:{name:'Synthetic topic'},isActive:true,cueCardBullets:i%2?'["first","second"]':'legacy bullet\nsecond',createdAt})),pagination:{total:150,page,limit:50,totalPages:3}});}
  if(p.endsWith('/crawler/logs'))return json(res,{success:true,logs:[]});if(p.includes('/crawler/'))return json(res,{success:true,totalQuestions:150,totalTopics:1,sources:[],status:'idle',stats:{}});
  return json(res,{success:true});
 }
 let target=path.join(dist,decodeURIComponent(p));if(!target.startsWith(dist+path.sep)&&target!==dist)return json(res,{error:'Invalid path'},400);
 if(!fs.existsSync(target)||fs.statSync(target).isDirectory())target=path.join(dist,'index.html');
 let data=fs.readFileSync(target);const ext=path.extname(target);if(ext==='.html')data=Buffer.from(data.toString().replace(/<script src="https:\/\/telegram[^>]+><\/script>/,'').replace('</body>',toolbar+'</body>'));
 res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.ico':'image/x-icon'}[ext]||'application/octet-stream')});res.end(data);
}).listen(Number(process.env.SYNTHETIC_ADMIN_PORT || 4181),'127.0.0.1',()=>console.log('Synthetic admin browser fixture server ready on loopback.'));
