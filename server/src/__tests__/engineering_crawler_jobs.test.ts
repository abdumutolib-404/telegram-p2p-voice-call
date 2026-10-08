import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { prisma } from '../config/database';
import { recoverManualCrawlerJobs } from '../services/crawler/manualJobs';
import { questionIngestionService } from '../services/crawler/ingestionService';
import { CrawlerLease } from '../services/crawler/lease';

beforeEach(async()=>{await prisma.crawlerSyncLog.deleteMany();});
afterEach(()=>vi.restoreAllMocks());
const result={status:'SUCCESS' as const,sourcesProcessed:1,questionsDiscovered:2,questionsAccepted:1,duplicatesSkipped:1,topicsCreated:0,durationMs:100};
it('requeues a lease conflict and saves real success when the next execution completes',async()=>{
 const job=await prisma.crawlerSyncLog.create({data:{status:'QUEUED',requestJson:'{}'}});
 const run=vi.spyOn(questionIngestionService,'runIngestion').mockResolvedValueOnce({...result,status:'LOCKED'}).mockResolvedValueOnce(result);
 await recoverManualCrawlerJobs();expect((await prisma.crawlerSyncLog.findUnique({where:{id:job.id}}))?.status).toBe('QUEUED');
 await recoverManualCrawlerJobs();expect((await prisma.crawlerSyncLog.findUnique({where:{id:job.id}}))?.status).toBe('SUCCESS');expect(run).toHaveBeenCalledTimes(2);
});
it('keeps a failed ingestion distinguishable from successful scheduling',async()=>{
 const job=await prisma.crawlerSyncLog.create({data:{status:'QUEUED',requestJson:'{}'}});
 vi.spyOn(questionIngestionService,'runIngestion').mockResolvedValue({...result,status:'FAILED',error:'Synthetic provider failure'});
 await recoverManualCrawlerJobs();const stored=await prisma.crawlerSyncLog.findUnique({where:{id:job.id}});expect(stored?.status).toBe('FAILED');expect(stored?.errors).toBe('Synthetic provider failure');
});
it('recovers interrupted work only after distributed ownership is available',async()=>{
 const job=await prisma.crawlerSyncLog.create({data:{status:'RUNNING',requestJson:'{}',startedAt:new Date(Date.now()-180000)}});
 const lease=new CrawlerLease();expect(await lease.acquire()).toBe(true);
 try {await recoverManualCrawlerJobs();expect((await prisma.crawlerSyncLog.findUnique({where:{id:job.id}}))?.status).toBe('RUNNING');} finally {await lease.release();}
 await recoverManualCrawlerJobs();expect((await prisma.crawlerSyncLog.findUnique({where:{id:job.id}}))?.status).toBe('FAILED');
});
