import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {env} from '../config/env';
import {prisma} from '../config/database';
import {currentTerms} from '../services/terms';
const fixture=vi.hoisted(()=>({create:vi.fn(),invoice:vi.fn()}));
vi.mock('../services/credits',async original=>({...await original<typeof import('../services/credits')>(),createCreditOrder:fixture.create}));
import dashboard,{setDashboardBot} from '../routes/dashboard';
const app=express();app.use(express.json());app.use('/api/dashboard',dashboard);
let telegramId:number,userId:string;
function signed(){const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:telegramId,first_name:'Synthetic buyer'})});params.sort();const secret=crypto.createHmac('sha256','WebAppData').update(env.BOT_TOKEN).digest();params.set('hash',crypto.createHmac('sha256',secret).update([...params].map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));return params.toString();}
const basket=()=>({requestId:crypto.randomUUID(),revision:'a'.repeat(64),calls:2,recordings:1,storage:true,termsAccepted:true,termsVersion:'credits-2026-10-15'});
beforeEach(async()=>{
  vi.clearAllMocks();telegramId=Date.now()+Math.floor(Math.random()*100000);
  const user=await prisma.user.create({data:{telegramId:BigInt(telegramId),alias:crypto.randomUUID(),onboarded:true,termsAcceptedVersion:currentTerms.version,termsDocumentSha256:currentTerms.sha256,termsAcceptedAt:new Date()}});userId=user.id;
  fixture.create.mockResolvedValue({id:crypto.randomUUID(),status:'PENDING',expiresAt:new Date(Date.now()+60000),calls:2,recordings:1,storage:1,starsAmount:73,uzsAmount:11203});
  fixture.invoice.mockResolvedValue('https://t.me/$synthetic-invoice');
  setDashboardBot({api:{createInvoiceLink:fixture.invoice}} as never);
});
afterEach(async()=>{setDashboardBot(null);await prisma.user.deleteMany({where:{id:userId}});});
it('creates a Stars invoice only for the authenticated user and the server quote',async()=>{
  const body=basket();const result=await request(app).post('/api/dashboard/credits/checkout').set('x-telegram-init-data',signed()).send(body);
  expect(result.status).toBe(200);expect(result.body.stars).toBe(73);expect(result.body.uzs).toBe(11203);
  expect(fixture.create).toHaveBeenCalledWith(userId,body.requestId,{calls:2,recordings:1,storage:true},body.revision);
  expect(fixture.invoice.mock.calls[0].slice(3,6)).toEqual(['','XTR',[{label:'Calls and recordings',amount:73}]]);
});
it.each([{termsAccepted:false},{termsVersion:'old-credit-terms'},{starsAmount:1},{userId:'someone-else'}])('rejects forged prices, ownership and missing agreement %#',async patch=>{
  const result=await request(app).post('/api/dashboard/credits/checkout').set('x-telegram-init-data',signed()).send({...basket(),...patch});
  expect(result.status).toBe(400);expect(fixture.create).not.toHaveBeenCalled();expect(fixture.invoice).not.toHaveBeenCalled();
});
it('requires verified Telegram membership before creating any order',async()=>{
  const result=await request(app).post('/api/dashboard/credits/checkout').send(basket());
  expect(result.status).toBeGreaterThanOrEqual(400);expect(fixture.create).not.toHaveBeenCalled();
});
it('returns a reviewable error for a changed quote without issuing an invoice',async()=>{
  fixture.create.mockRejectedValueOnce(new Error('Prices changed. Review the updated total before paying.'));
  const result=await request(app).post('/api/dashboard/credits/checkout').set('x-telegram-init-data',signed()).send(basket());
  expect(result.status).toBe(409);expect(result.body.error).toContain('Prices changed');expect(fixture.invoice).not.toHaveBeenCalled();
});
