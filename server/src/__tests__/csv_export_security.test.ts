import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { prisma } from '../config/database';
import ieltsRouter from '../routes/ielts';
import adminIeltsRouter from '../routes/adminIelts';
vi.mock('../routes/admin', () => ({ getAdminBot: () => null }));

describe('question CSV export security', () => {
  it('exports stored formula and control prefixes as literal text in both HTTP exports, while preserving JSON', async () => {
    const topic=await prisma.ieltsTopic.create({ data: { name: '+untrusted-topic', slug: 'csv-security-topic' } });
    const text='\t=HYPERLINK("https://example.invalid","What?")';
    await prisma.ieltsQuestion.create({ data: { part:'PART_1', questionText:text, topicId:topic.id, source:'@untrusted-source', questionType:'DIRECT' } });
    const app=express();app.use('/public',ieltsRouter);app.use('/admin',adminIeltsRouter);
    for(const url of ['/public/questions/export?format=csv','/admin/questions/export?format=csv']) {
      const res=await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.text).toContain('"\'\t=HYPERLINK(""https://example.invalid"",""What?"")"');
      expect(res.text).toContain('"\'+untrusted-topic"');expect(res.text).toContain('"\'@untrusted-source"');
    }
    const json=await request(app).get('/public/questions/export?format=json');
    expect(JSON.stringify(json.body)).toContain('HYPERLINK');
    expect((await prisma.ieltsQuestion.findMany()).find(row=>row.topicId===topic.id)?.questionText).toBe(text);
  });
});
