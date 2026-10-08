import { afterEach, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { currentTerms } from '../services/terms';
import { setupSocketSignaling } from '../socket/signaling';
import { authenticationAdmission } from '../socket/authenticationAdmission';
import { admitCall } from '../services/callAdmission';

afterEach(()=>vi.restoreAllMocks());
async function user(){return prisma.user.create({data:{telegramId:BigInt(crypto.randomInt(10000000,90000000)),alias:crypto.randomUUID(),onboarded:true,termsAcceptedAt:new Date(),termsAcceptedVersion:currentTerms.version,termsDocumentSha256:currentTerms.sha256}});}
it('bounds actual signed Node authentication lookups by peer and releases capacity',async()=>{
  const registered=await user();const values={auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(registered.telegramId),first_name:'Synthetic'})};
  const check=Object.keys(values).sort().map(key=>key+'='+values[key as keyof typeof values]).join('\n');
  const secret=crypto.createHmac('sha256','WebAppData').update(env.BOT_TOKEN).digest();
  const token=new URLSearchParams({...values,hash:crypto.createHmac('sha256',secret).update(check).digest('hex')}).toString();
  let authenticate!:Function;const io={use:(fn:Function)=>{authenticate=fn;},on:()=>{},to:()=>({emit:()=>{}}),in:()=>({socketsLeave:()=>{}}),sockets:{sockets:new Map()}};
  setupSocketSignaling(io as any);
  const resolvers:Array<(value:typeof registered)=>void>=[];
  const lookup=vi.spyOn(prisma.user,'findUnique').mockImplementation(()=>new Promise(resolve=>resolvers.push(resolve)) as any);
  const callbacks=Array.from({length:30},()=>vi.fn());
  const pending=callbacks.map((next,index)=>authenticate({id:String(index),data:{},handshake:{address:index%2?'::ffff:192.0.2.1':'192.0.2.1',auth:{token},headers:{}}},next));
  expect(lookup).toHaveBeenCalledTimes(4);expect(callbacks.filter(next=>next.mock.calls[0]?.[0] instanceof Error)).toHaveLength(26);
  resolvers.forEach(resolve=>resolve(registered));await Promise.all(pending);
  expect(callbacks.slice(0,4).every(next=>next.mock.calls[0]?.[0]===undefined)).toBe(true);
  lookup.mockResolvedValue(registered);const next=vi.fn();await authenticate({id:'control',data:{},handshake:{address:'192.0.2.1',auth:{token},headers:{}}},next);expect(next).toHaveBeenCalledWith();
});
it('caps distinct peers globally and release is idempotent',()=>{
  const reserve=authenticationAdmission();const releases=Array.from({length:16},(_,i)=>reserve('192.0.2.'+(i+1))!);
  expect(reserve('198.51.100.1')).toBeNull();releases[0]();releases[0]();expect(reserve('198.51.100.1')).toBeTypeOf('function');expect(reserve('198.51.100.2')).toBeNull();
});
it('expires only stale direct invitations under admission locks and keeps live invitations busy',async()=>{
  const a=await user(),b=await user(),c=await user();
  const old=await prisma.callSession.create({data:{userAId:a.id,userBId:b.id,roomName:crypto.randomUUID(),status:'PENDING',createdAt:new Date(Date.now()-61000)}});
  await admitCall(a.id,c.id,crypto.randomUUID(),'ACTIVE');
  expect((await prisma.callSession.findUnique({where:{id:old.id}}))?.status).toBe('CANCELLED');
  await prisma.callSession.deleteMany();
  await prisma.callSession.create({data:{userAId:a.id,userBId:b.id,roomName:crypto.randomUUID(),status:'PENDING'}});
  await expect(admitCall(a.id,c.id,crypto.randomUUID(),'ACTIVE')).rejects.toThrow();
});
