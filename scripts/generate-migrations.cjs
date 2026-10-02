// Run once when introducing migration history; never connects to a database.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'), server=path.join(root,'server');
const original=execFileSync('git',['show','HEAD:server/prisma/schema.prisma'],{cwd:root});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pairtalk-schema-')), before=path.join(temp,'before.prisma'); fs.writeFileSync(before,original);
const prisma=path.join(server,'node_modules/prisma/build/index.js');
const diff=args=>execFileSync(process.execPath,[prisma,'migrate','diff',...args,'--script'],{cwd:server,env:require('./safe-environment.cjs')(),encoding:'utf8'});
const migrations=path.join(server,'prisma/migrations');
if (process.argv.includes('--notification')) {
 const current=path.join(server,'prisma/schema.prisma');
 fs.writeFileSync(before,fs.readFileSync(current,'utf8').replace(/^model NotificationJob \{[\s\S]*?^\}/m,''));
 const directory=path.join(migrations,'202610020003_notification_jobs');
 if(fs.existsSync(directory))throw new Error('Migration already exists; never overwrite applied migration history.');
 fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'migration.sql'),diff(['--from-schema-datamodel',before,'--to-schema-datamodel',current]));
 console.log('Generated additive notification job migration.');return;
}
if(fs.existsSync(migrations))throw new Error('Migration history exists; do not regenerate the baseline.');
for(const [name,sql] of [ ['202610020001_baseline',diff(['--from-empty','--to-schema-datamodel',before])], ['202610020002_refund_recovery',diff(['--from-schema-datamodel',before,'--to-schema-datamodel',path.join(server,'prisma/schema.prisma')])] ]) {
 fs.mkdirSync(path.join(migrations,name),{recursive:true});fs.writeFileSync(path.join(migrations,name,'migration.sql'),sql);
}
fs.writeFileSync(path.join(migrations,'migration_lock.toml'),'provider = "postgresql"\n');
console.log('Generated baseline and additive refund migrations without database access.');
