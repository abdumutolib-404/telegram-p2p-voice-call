const fs=require('node:fs'),path=require('node:path'),{spawnSync,spawn}=require('node:child_process');
const runtime=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),action=process.argv[3];
if(!/^postgresql:\/\/[^@]+@127\.0\.0\.1:55432\/pairtalk_check$/.test(runtime.DATABASE_URL)||runtime.REDIS_URL!=='redis://127.0.0.1:56379')throw new Error('Only dedicated loopback verification services are permitted.');
const root=path.resolve(__dirname,'..'),server=path.join(root,'server'),env=require('./safe-environment.cjs')({...runtime,NODE_ENV:'development',HOST:'127.0.0.1',BOT_TOKEN:'123456789:'+require('node:crypto').randomBytes(24).toString('base64url')});delete env.names;
const commands={migrate:[path.join(server,'node_modules/prisma/build/index.js'),'migrate','deploy'],integration:[path.join(server,'node_modules/ts-node/dist/bin.js'),'-T','--project',path.join(server,'tsconfig.json'),path.join(root,'scripts/isolated-integration.ts')],runtime:[path.join(server,'dist/index.js')]};
if(!commands[action])throw new Error('Use migrate, integration or runtime');
if(action==='runtime') {
 const child=spawn(process.execPath,commands[action],{cwd:server,env,stdio:['ignore','pipe','pipe']});
 const log=path.join(path.dirname(process.argv[2]),'backend-redacted.log');
 const write=chunk=>{let text=chunk.toString();for(const key of ['DATABASE_URL','JWT_SECRET','MASTER_PASSWORD','BOT_TOKEN','LIVEKIT_API_SECRET'])if(env[key])text=text.split(env[key]).join('[REDACTED]');fs.appendFileSync(log,text);process.stdout.write(text);};
 child.stdout.on('data',write);child.stderr.on('data',write);child.on('exit',code=>{process.exitCode=code??1;});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 return;
}
const result=spawnSync(process.execPath,commands[action],{cwd:server,env,encoding:'utf8',maxBuffer:16*1024*1024});
let output=(result.stdout||'')+(result.stderr||'');for(const key of ['DATABASE_URL','JWT_SECRET','MASTER_PASSWORD','BOT_TOKEN','LIVEKIT_API_SECRET'])if(env[key])output=output.split(env[key]).join('[REDACTED]');
process.stdout.write(output);process.exitCode=result.status??1;
