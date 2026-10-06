import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import router from '../routes/ielts';

afterEach(()=>vi.restoreAllMocks());
function app(){const app=express();app.use(router);return app;}

describe('bounded anonymous question access',()=>{
 it.each(['part=unexpected','part[x]=PART_1','part=PART_1&part=PART_2','topicId[x]=a','page=1e9','page=-1','limit=999999999','page=10001'])('rejects %s before persistence',async query=>{
  const find=vi.spyOn(prisma.ieltsQuestion,'findMany'),cache=vi.spyOn(getRedis(),'get');
  expect((await request(app()).get('/questions?'+query)).status).toBe(400);expect(find).not.toHaveBeenCalled();expect(cache).not.toHaveBeenCalled();
 });
 it('normalizes valid case variants to the same cache key and preserves fresh reads',async()=>{
  const read=vi.spyOn(getRedis(),'get');const find=vi.spyOn(prisma.ieltsQuestion,'findMany').mockResolvedValue([{id:'test-question'}] as any);vi.spyOn(prisma.ieltsQuestion,'count').mockResolvedValue(1);
  await request(app()).get('/questions?part=part_2&limit=10');
  await request(app()).get('/questions?part=PART_2&limit=10');
  expect(read.mock.calls.map(args=>args[0])).toEqual(['cache:ielts:questions:all:PART_2:1:10','cache:ielts:questions:all:PART_2:1:10']);expect(find).toHaveBeenCalledTimes(1);
  expect((await request(app()).get('/questions?part=PART_2&limit=10&fresh=true')).status).toBe(200);expect(find).toHaveBeenCalledTimes(2);
 });
 it('never caches arbitrary topic filters, deep pages, or empty results',async()=>{
  const write=vi.spyOn(getRedis(),'set');vi.spyOn(prisma.ieltsQuestion,'findMany').mockResolvedValue([]);vi.spyOn(prisma.ieltsQuestion,'count').mockResolvedValue(0);
  for(const query of ['topicId=missing-a','topicId=missing-b','page=11','part=PART_3']) expect((await request(app()).get('/questions?'+query)).status).toBe(200);
  expect(write).not.toHaveBeenCalled();
 });
 it.each(['json','csv'])('refuses an oversized %s export without truncation',async format=>{
  const find=vi.spyOn(prisma.ieltsQuestion,'findMany').mockResolvedValue(Array.from({length:1001},(_,i)=>({id:String(i)})) as any);
  const result=await request(app()).get('/questions/export?format='+format);expect(result.status).toBe(413);expect(result.body.error).toContain('1000');expect(find.mock.calls[0][0]?.take).toBe(1001);
 });
 it('bounds simultaneous exports and releases slots on success and query failure',async()=>{
  const pending: Array<(rows: never[])=>void>=[];
  const find=vi.spyOn(prisma.ieltsQuestion,'findMany').mockImplementation(()=>new Promise(resolve=>pending.push(resolve)) as any);
  const server=app(),first=request(server).get('/questions/export').then(r=>r),second=request(server).get('/questions/export').then(r=>r);
  await vi.waitFor(()=>expect(pending.length).toBe(2));expect((await request(server).get('/questions/export')).status).toBe(429);
  pending.forEach(resolve=>resolve([]));expect((await first).status).toBe(200);expect((await second).status).toBe(200);
  find.mockRejectedValueOnce(new Error('Synthetic database failure')).mockResolvedValue([]);
  expect((await request(server).get('/questions/export')).status).toBe(500);expect((await request(server).get('/questions/export')).status).toBe(200);
 });
 it('limits repeated anonymous exports through the request matrix',async()=>{
  vi.spyOn(prisma.ieltsQuestion,'findMany').mockResolvedValue([]);const server=app();
  for(let i=0;i<3;i++) expect((await request(server).get('/questions/export').set('x-test-ratelimit','true')).status).toBe(200);
  expect((await request(server).get('/questions/export').set('x-test-ratelimit','true')).status).toBe(429);
 });
});
