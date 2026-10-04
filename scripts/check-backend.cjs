const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const inContainer=process.argv[2]==='--container-bindings'&&process.env.BOT_TOKEN==='123456789:synthetic-container-verification-token';
const runtime=inContainer?{JWT_SECRET:process.env.JWT_SECRET}:JSON.parse(fs.readFileSync(process.argv[2],'utf8')),base=inContainer?'http://127.0.0.1:3001':process.argv[3]||'http://127.0.0.1:4182';
if(!(inContainer&&base==='http://127.0.0.1:3001')&&!/^http:\/\/127\.0\.0\.1:(4182|4184)$/.test(base)&&!/^https:\/\/[a-z-]+\.trycloudflare\.com$/.test(base))throw new Error('Unexpected verification destination');
const jwt=require(path.resolve(__dirname,'../server/node_modules/jsonwebtoken'));
const forwardedHeaders=inContainer?{'X-Forwarded-Proto':'https'}:{};
async function request(endpoint,headers={}) {return fetch(base+endpoint,{headers:{...forwardedHeaders,...headers},signal:AbortSignal.timeout(15000),redirect:'manual'});}
async function main(){
 let count=0;const check=async(name,fn)=>{await fn();console.log('PASS '+name);count++;};
 await check('readiness requires representative database and Redis operations',async()=>{const response=await request('/health');assert.equal(response.status,200);assert.equal((await response.json()).status,'ok');});
 await check('anonymous admin access is rejected',async()=>assert.equal((await request('/api/admin/users')).status,401));
 const token=jwt.sign({role:'admin',telegramId:'12345678'},runtime.JWT_SECRET,{expiresIn:'5m'}),headers={Authorization:'Bearer '+token};
 await check('synthetic administrator can read actual isolated statistics',async()=>{const response=await request('/api/admin/stats',headers);assert.equal(response.status,200);const data=await response.json();assert.equal(typeof data.totalUsers,'number');assert(data.totalUsers>0);});
 await check('wrong administrator identity is forbidden',async()=>{const invalid=jwt.sign({role:'admin',telegramId:'90000001'},runtime.JWT_SECRET,{expiresIn:'5m'});assert.equal((await request('/api/admin/users',{Authorization:'Bearer '+invalid})).status,403);});
 await check('receipt authentication remains required',async()=>assert.equal((await request('/api/admin/payments/manual/synthetic/receipt')).status,401));
 await check('cookie-only mutations require anti-CSRF header',async()=>{const response=await fetch(base+'/api/admin/users/synthetic/plan',{method:'PATCH',headers:{...forwardedHeaders,Cookie:'admin_session='+token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000),redirect:'manual'});assert.equal(response.status,403);});
 await check('untrusted origins receive no CORS permission',async()=>{const response=await request('/health',{Origin:'https://untrusted.example'});assert.equal(response.headers.get('access-control-allow-origin'),null);});
 console.log(`Functional API result: ${count} passed, 0 failed; ${base}`);
}
main().catch(error=>{console.error('Functional API check failed:',error.message,error.cause?.code||'');process.exitCode=1;});
