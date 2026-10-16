// Owned production-build browser benchmark. All API, Telegram and signaling
// traffic is synthetic and restricted to loopback; no provider account is used.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),phase=process.argv[2]||'baseline';
if(!['baseline','after'].includes(phase))throw Error('Use baseline or after.');
const runs=Number(process.env.BENCH_RUNS||5);if(!Number.isInteger(runs)||runs<3||runs>10)throw Error('Use 3–10 runs.');
const output=path.join(root,'.ecc/benchmarks',`2026-10-16-${phase}-browser.json`);
if(phase==='baseline'&&fs.existsSync(output))throw Error('Baseline already exists; preserve it and use after for comparisons.');
const {chromium}=require(process.env.PAIRTALK_PLAYWRIGHT_MODULE||'playwright');
const {defaultCreditCosts,sellingCreditRates}=require('../server/dist/contracts/credits');
const {defaultPracticePrices}=require('../server/dist/contracts/practicePacks');
const checkedAt=new Date().toISOString(),revision='a'.repeat(64);
const credits={version:1,revision,checkedAt,minutes:15,storageDays:30,starterCalls:3,markupPercent:12,salesEnabled:true,recordingsAvailable:3,rates:sellingCreditRates(defaultCreditCosts),uzsPerUsd:defaultCreditCosts.uzsPerUsd,usdPerStar:defaultCreditCosts.usdPerStar};
const packs={version:2,revision,checkedAt,prices:defaultPracticePrices,durations:[15,30],retentionDays:30,starterCalls:3,salesEnabled:true,recordingMinutesAvailable:60};
const pricing={version:1,revision,checkedAt,botUsername:'SyntheticPracticeBot',plans:[],credits,packs};
const profile={id:'benchmark-fixture',alias:'Synthetic benchmark learner',band:7,plan:'FREE',callsRemaining:3,totalCallsLimit:3,maxCallDuration:15,preferredCallMinutes:15,starterGiftClaimed:true,creditOnly:true,creditBalance:{calls:3,recordings:0,storage:0}};
const telegram=`window.Telegram={WebApp:{platform:'android',initData:'synthetic-benchmark-only',ready(){},expand(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}},HapticFeedback:{impactOccurred(){}}}};`;
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain'};
const servers=[],rows=[],transfers=[];
// Pace compressed bytes across responses, not per resource. A control request
// must observe the 150ms delay before any benchmark result can be accepted.
const delivery=setInterval(()=>{let budget=2000;while(budget>0&&transfers.length){const item=transfers.shift();if(item.res.destroyed)continue;const size=Math.min(1000,budget,item.data.length-item.offset);item.res.write(item.data.subarray(item.offset,item.offset+size));item.offset+=size;budget-=size;if(item.offset===item.data.length)item.res.end();else transfers.push(item);}},10);
function send(res,data,type){const compressed=/javascript|css|html/.test(type);const body=compressed?zlib.gzipSync(data):data;res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');if(compressed)res.setHeader('Content-Encoding','gzip');setTimeout(()=>{if(res.destroyed)return;res.flushHeaders();if(body.length)transfers.push({res,data:body,offset:0});else res.end();},150);}
function serve(surface){const dist=path.join(root,surface,'dist');return http.createServer((req,res)=>{
 try{const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/__delivery-probe'){send(res,Buffer.from('delivery control'),'text/plain');return;}if(u.pathname.startsWith('/api/')){
  const body=u.pathname.endsWith('/auth/verify')?{success:true,hasActiveCall:false,user:profile}:u.pathname.endsWith('/calls/active')?{hasActiveCall:false}:u.pathname.endsWith('/public/plans')?pricing:u.pathname.endsWith('/starter-gift')?{claimed:true}:u.pathname.endsWith('/pack-offers')||u.pathname.endsWith('/discount-offers')?{offers:[],serverNow:checkedAt}:{};
  setTimeout(()=>send(res,Buffer.from(JSON.stringify(body)),'application/json'),40);return;
 }if(u.pathname.startsWith('/socket.io')){res.statusCode=400;res.end('Synthetic signaling unavailable');return;}
 let relative=decodeURIComponent(u.pathname);if(relative==='/'||!path.extname(relative))relative=surface==='landing'?(relative==='/'?'/index.html':relative+'.html'):'/index.html';
 const file=path.resolve(dist,'.'+relative);if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;res.end();return;}
 const data=fs.readFileSync(file),type=mime[path.extname(file)]||'application/octet-stream';send(res,data,type);
 }catch{res.statusCode=400;res.end();}
});}
(async()=>{let browser;try{
 const ports={};for(const surface of ['landing','client','admin']){const server=serve(surface);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));ports[surface]=server.address().port;servers.push(server);}
 browser=await chromium.launch({headless:true,...(process.env.PAIRTALK_CHROME_PATH?{executablePath:process.env.PAIRTALK_CHROME_PATH}:{})});
 const control=await browser.newPage();await control.goto(`http://127.0.0.1:${ports.landing}/__delivery-probe`);const verifiedTtfbMs=await control.evaluate(()=>performance.getEntriesByType('navigation')[0].responseStart);assert(verifiedTtfbMs>=125,'Delivery throttle did not apply');await control.close();
 for(const [surface,route,ready]of [['landing','/','h1'],['landing','/pricing','h2'],['client','/','button[aria-label="Find a partner"]'],['admin','/','input[type="password"]']])for(let run=0;run<runs;run++){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='telegram.org')return r.fulfill({contentType:'application/javascript',body:telegram});return u.hostname==='127.0.0.1'?r.continue():r.abort();});
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.addInitScript(()=>{window.benchmark={lcp:0,cls:0,blockingMs:0,events:[]};new PerformanceObserver(l=>{for(const e of l.getEntries())window.benchmark.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.benchmark.cls+=e.value;}).observe({type:'layout-shift',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())window.benchmark.blockingMs+=Math.max(0,e.duration-50);}).observe({type:'longtask',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.interactionId)window.benchmark.events.push({duration:e.duration,type:e.name});}).observe({type:'event',durationThreshold:16,buffered:true});});
  await page.goto(`http://127.0.0.1:${ports[surface]}${route}`,{waitUntil:'load'});await page.locator(ready).first().waitFor();await page.waitForTimeout(1200);
  if(route==='/pricing')await page.getByRole('heading',{name:'Choose your practice'}).waitFor();
  const metrics=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0],resources=performance.getEntriesByType('resource');return {...window.benchmark,fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime??null,ttfb:n.responseStart-n.startTime,serverResponseMs:n.responseStart-n.requestStart,domReady:n.domContentLoadedEventEnd,load:n.loadEventEnd,documentBytes:n.encodedBodySize,resources:resources.map(r=>({path:new URL(r.name).pathname,initiator:r.initiatorType,encodedBytes:r.encodedBodySize,decodedBytes:r.decodedBodySize,blocking:r.renderBlockingStatus}))};});
  if(route==='/pricing'){await page.getByLabel('Choose duration',{exact:false}).selectOption('30');await page.getByRole('spinbutton',{name:'Calls',exact:true}).fill('2');await page.getByRole('spinbutton',{name:'Recordings',exact:true}).fill('1');await page.getByText('22,400 UZS',{exact:true}).waitFor();}
  else {const button=page.locator('button').filter({visible:true}).first();if(await button.count())await button.click();}
  await page.waitForTimeout(150);metrics.events=await page.evaluate(()=>window.benchmark.events);metrics.maxObservedInteractionMs=metrics.events.length?Math.max(...metrics.events.map(e=>e.duration)):null;
  metrics.initialJsBytes=metrics.resources.filter(r=>r.initiator==='script'||r.path.endsWith('.js')).reduce((n,r)=>n+r.encodedBytes,0);metrics.pageEncodedBytes=metrics.documentBytes+metrics.resources.reduce((n,r)=>n+r.encodedBytes,0);metrics.requestCount=metrics.resources.length+1;
  assert(metrics.fcp>0&&metrics.lcp>0,`Missing paint metrics for ${surface}${route}`);assert(metrics.ttfb>=125,'Navigation delivery delay missing');rows.push({surface,route,run,...metrics});await context.close();console.log(`Measured ${surface}${route} run ${run+1}/${runs}`);
 }
 const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];const summary=[...new Set(rows.map(r=>r.surface+r.route))].map(key=>{const r=rows.filter(r=>r.surface+r.route===key);return {surface:r[0].surface,route:r[0].route,runs:r.length,...Object.fromEntries(['lcp','cls','fcp','ttfb','blockingMs','initialJsBytes','pageEncodedBytes','requestCount'].map(k=>[k,median(r.map(x=>x[k]))])),maxObservedInteractionMs:Math.max(...r.flatMap(x=>x.events.map(e=>e.duration)),0)||null};});
 const report={schemaVersion:2,phase,sourceState:"Production build from the current working tree; commit records its base revision.",commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),checkedAt:new Date().toISOString(),conditions:{build:'Local production output',browser:await browser.version(),viewport:'390x844 DPR1',cache:'Disabled; fresh context each run',deliveryModel:'Server delays each response 150ms, then shares 200,000 compressed bytes/s across responses; not browser network emulation',verifiedControlTtfbMs:verifiedTtfbMs,latencyMs:150,downloadBytesPerSecond:200000,cpuSlowdown:4,api:'Synthetic 40ms loopback responses plus delivery model; no real Telegram, payment, media or signed member credential'},limitations:['Observed lab interactions are not field INP. Null interaction duration means no event exceeded the browser 16ms observation threshold.','Delivery model does not simulate DNS/TLS/radio conditions or real provider/CDN/backend latency.','This browser benchmark does not measure actual backend latency or media capacity.'],summary,rows};fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,summary},null,2));
 }finally{await browser?.close();for(const server of servers)await new Promise(resolve=>server.close(resolve));clearInterval(delivery);}})().catch(e=>{console.error(e.message);process.exitCode=1;});
