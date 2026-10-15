import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { env } from '../config/env';
import { prisma } from '../config/database';
import adminRoutes from '../routes/admin';

const app=express();app.use('/admin',adminRoutes);
afterEach(()=>vi.restoreAllMocks());
it('loads exact admin badge counts without reading payment proofs or appeal records',async()=>{
  env.ADMIN_TELEGRAM_IDS=['90101'];
  const token=jwt.sign({role:'admin',telegramId:'90101'},env.JWT_SECRET,{expiresIn:'1h'});
  const user=await prisma.user.create({data:{telegramId:BigInt(crypto.randomInt(100000000,999999999)),alias:'Performance fixture'}});
  for(const status of ['PENDING','PENDING','REFUND_PENDING','APPROVED','REFUNDED']) await prisma.manualPaymentRequest.create({data:{userId:user.id,telegramId:user.telegramId,alias:user.alias,plan:'PLUS',uzsAmount:10000,status,paymentProof:'synthetic-proof-'+ 'x'.repeat(50000)}});
  for(const status of ['PENDING','REJECTED']) await prisma.unblockAppeal.create({data:{userId:user.id,telegramId:user.telegramId,alias:user.alias,banReason:'Synthetic',appealText:'Synthetic appeal',status}});
  const payments=vi.spyOn(prisma.manualPaymentRequest,'findMany');const appeals=vi.spyOn(prisma.unblockAppeal,'findMany');
  const response=await request(app).get('/admin/queue-counts').auth(token,{type:'bearer'});
  expect(response.status).toBe(200);expect(response.body).toEqual({payments:2,refunds:1,appeals:1});
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(payments).not.toHaveBeenCalled();expect(appeals).not.toHaveBeenCalled();
  expect(Buffer.byteLength(response.text)).toBeLessThan(64);
});
it('protects badge counts behind the existing admin authentication boundary',async()=>{
  const count=vi.spyOn(prisma.manualPaymentRequest,'count');
  expect((await request(app).get('/admin/queue-counts')).status).toBe(401);
  expect(count).not.toHaveBeenCalled();
});
